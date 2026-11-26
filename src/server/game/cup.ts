import type { AnswerValue } from "../../shared/answer-match.ts";
import { answerOf } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type { CupAwardKey, CupAwards, CupPhase, CupRevealView, CupStanding, HostCupState, PlayerCupView } from "../../shared/modes/cup.ts";
import {
  CUP_ALL_SAFE_MS,
  CUP_DEFAULT_CUPS,
  CUP_DIE_SIDES,
  CUP_DRINK_MS,
  CUP_MAX_CUPS,
  CUP_MIN_CUPS,
  CUP_ROLL_MS,
  CUP_SIP_MS,
  CUP_VERDICT_MS,
  cupAwardLabels,
  cupQuizMs,
  cupShared,
} from "../../shared/modes/cup.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import type { SeasonTheme } from "../../shared/themed-modes.ts";
import { modeTheme, THEMED_MODES } from "../../shared/themed-modes.ts";
import type { Clock } from "./common.ts";
import { GameError, shuffle } from "./common.ts";
import type { LobbyChoices, LobbyFacts } from "./lobby-facts.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, pickTheme, unhandled } from "./mode-entry.ts";
import type { Podium } from "./podium.ts";
import { buildPodium, emptyPodium } from "./podium.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { accuracy, sheet } from "./results.ts";
import type { BasePlayer } from "./roster.ts";
import { most } from "./standings.ts";
import type { AnswerTotals } from "./stream.ts";
import { StreamedSession } from "./streamed-session.ts";

export { FEEDBACK_MS } from "./stream.ts";

export const COUNTDOWN_MS = 3000;

export interface CupPlayer extends BasePlayer, AnswerTotals {
  cups: number;
  outRound: number | null;
  target: number;
  progress: number;
  safe: boolean;
  pick: number | null;
  drinksSurvived: number;
  safeRounds: number;
  poisonedFrom: number | null;
}

interface Drink {
  id: string;
  cup: number;
  cupsBefore: number;
  auto: boolean;
  poisoned: boolean;
}

interface Reveal {
  seq: number;
  round: number;
  drinks: Drink[];
  step: number;
}

interface CupOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: CupGame) => void;
}

interface CupGameSettings {
  theme?: SeasonTheme;
  cups?: number;
  shuffleAnswers: boolean;
  protect?: boolean;
}

const hasNoChoice = (p: CupPlayer) => p.cups <= 1;

export class CupGame {
  readonly runningMode = "cup" as const;
  readonly theme: SeasonTheme;
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly startCups: number;
  round = 0;
  drinkers: string[] = [];
  reveal: Reveal | null = null;
  private reveals = 0;

  private readonly session: StreamedSession<CupPlayer, CupPhase, Podium<CupPlayer, CupPlayer, CupAwardKey>>;

  constructor(quiz: Quiz, settings: CupGameSettings, opts: CupOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.startCups = settings.cups ?? CUP_DEFAULT_CUPS;
    this.theme = modeTheme("cup", settings.theme);
    this.session = new StreamedSession({
      questions: quiz.questions,
      shuffleAnswers: settings.shuffleAnswers,
      protect: settings.protect,
      clock: opts.clock,
      rng: opts.rng,
      countdownMs: COUNTDOWN_MS,
      inPlay: (phase) => phase !== "countdown",
      canAnswer: (p) => this.answering(p),
      cleanup: () => {
        // why: ending mid-reveal, the drinks already poured still count.
        const r = this.reveal;
        if (this.phase === "reveal" && r) while (r.step < r.drinks.length * 2 - 1) this.forceStep(r);
        this.drinkers = [];
        this.reveal = null;
      },
      podium: { build: () => this.buildPodium(), empty: () => emptyPodium(cupAwardLabels(this.theme)) },
      hub: { onChange: opts.onChange, onActivity: opts.onActivity, onFinish: () => opts.onFinish?.(this) },
    });
  }

  get choices(): LobbyChoices {
    return this.session.choices;
  }

  static fromLobby(lobby: LobbyFacts<"cup">, opts: CupOptions = {}): CupGame {
    const game = new CupGame(
      lobby.quiz,
      { cups: lobby.settings.cups, theme: lobby.settings.theme, shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect },
      opts,
    );
    game.session.adoptLobby(lobby, (base) => game.newPlayer(base));
    return game;
  }

  get phase(): CupPhase {
    return this.session.phase;
  }

  get phaseEndsAt(): number {
    return this.session.phases.endsAt;
  }

  get phaseDurationMs(): number {
    return this.session.phases.durationMs;
  }

  get players(): Map<string, CupPlayer> {
    return this.session.players;
  }

  private alive(): CupPlayer[] {
    return [...this.players.values()].filter((p) => p.outRound === null);
  }

  private rollDie(): number {
    return 1 + Math.min(CUP_DIE_SIDES - 1, Math.floor(this.session.rng() * CUP_DIE_SIDES));
  }

  private newPlayer(base: BasePlayer): Omit<CupPlayer, keyof AnswerTotals> {
    const rolling = this.phase === "roll" || this.phase === "quiz";
    return {
      ...base,
      cups: this.startCups,
      outRound: null,
      target: rolling ? this.rollDie() : 0,
      progress: 0,
      // why: too late to answer this round, so they don't have to drink either.
      safe: !rolling,
      pick: null,
      drinksSurvived: 0,
      safeRounds: 0,
      poisonedFrom: null,
    };
  }

  start(): void {
    this.session.start(() => this.beginRound());
  }

  private beginRound(): void {
    this.round++;
    this.drinkers = [];
    this.reveal = null;
    for (const p of this.players.values()) {
      p.pick = null;
      p.progress = 0;
      p.safe = false;
      p.target = p.outRound === null ? this.rollDie() : 0;
    }
    this.session.phases.set("roll", CUP_ROLL_MS, () => this.beginQuiz());
    this.session.changed();
  }

  private beginQuiz(): void {
    this.session.phases.set("quiz", cupQuizMs(this.round), () => this.endQuiz());
    for (const p of this.players.values()) this.session.stream.open(p);
    this.session.changed();
  }

  private maybeEndQuizEarly(): void {
    if (this.phase !== "quiz") return;
    const alive = this.alive();
    if (alive.some((p) => p.connected) && alive.every((p) => p.safe || !p.connected)) this.endQuiz();
  }

  private endQuiz(): void {
    if (this.phase !== "quiz") return;
    for (const p of this.alive()) if (p.safe && p.target > 0) p.safeRounds++;
    const drinkers = this.alive().filter((p) => !p.safe);
    this.drinkers = shuffle(
      drinkers.map((p) => p.id),
      this.session.rng,
    );
    if (drinkers.length === 0) {
      this.reveal = { seq: ++this.reveals, round: this.round, drinks: [], step: 0 };
      this.session.phases.set("reveal", CUP_ALL_SAFE_MS, () => this.afterReveal());
      this.session.changed();
      return;
    }
    for (const p of drinkers) if (hasNoChoice(p)) p.pick = 0;
    this.session.phases.set("drink", CUP_DRINK_MS, () => this.pour());
    this.session.changed();
    this.maybeEndDrinkEarly();
  }

  private maybeEndDrinkEarly(): void {
    if (this.phase !== "drink") return;
    const waiting = this.drinkers.map((id) => this.players.get(id)).filter((p) => p && p.connected && p.pick === null);
    if (waiting.length === 0) this.pour();
  }

  private pour(): void {
    if (this.phase !== "drink") return;
    const drinks: Drink[] = [];
    for (const id of this.drinkers) {
      const p = this.players.get(id);
      if (!p || p.outRound !== null) continue;
      const auto = p.pick === null || p.cups <= 1;
      const cup = p.pick ?? Math.floor(this.session.rng() * p.cups);
      const poison = Math.floor(this.session.rng() * p.cups);
      drinks.push({ id, cup, cupsBefore: p.cups, auto, poisoned: cup === poison });
    }
    this.reveal = { seq: ++this.reveals, round: this.round, drinks, step: -1 };
    this.session.phases.set("reveal", drinks.length * (CUP_SIP_MS + CUP_VERDICT_MS), () => this.afterReveal());
    this.nextStep();
  }

  private nextStep(): void {
    const r = this.reveal;
    if (!r || this.phase !== "reveal") return;
    r.step++;
    if (r.step % 2 === 1) this.applyVerdict(r.drinks[(r.step - 1) / 2]!);
    if (r.step < r.drinks.length * 2 - 1) this.session.phases.after("step", r.step % 2 === 0 ? CUP_SIP_MS : CUP_VERDICT_MS, () => this.nextStep());
    this.session.changed();
  }

  private applyVerdict(d: Drink): void {
    const p = this.players.get(d.id);
    if (!p || p.outRound !== null) return;
    if (d.poisoned) {
      p.outRound = this.round;
      p.poisonedFrom = d.cupsBefore;
    } else {
      p.cups--;
      p.drinksSurvived++;
    }
  }

  private afterReveal(): void {
    const r = this.reveal;
    if (r) while (r.step < r.drinks.length * 2 - 1) this.forceStep(r);
    this.session.phases.cancel("step");
    if (this.isOver()) this.session.end();
    else this.beginRound();
  }

  private forceStep(r: Reveal): void {
    r.step++;
    if (r.step % 2 === 1) this.applyVerdict(r.drinks[(r.step - 1) / 2]!);
  }

  /** why: everyone poisoned in the same round shares the win; a solo game runs until its player is out. */
  private isOver(): boolean {
    const alive = this.alive().length;
    return this.players.size <= 1 ? alive === 0 : alive <= 1;
  }

  end(): void {
    this.session.end();
  }

  dispose(): void {
    this.session.dispose();
  }

  join(rawNickname: unknown, avatar?: AvatarChoice | null): CupPlayer {
    const player = this.session.addPlayer(rawNickname, avatar, (base) => this.newPlayer(base));
    this.session.changed();
    return player;
  }

  byToken(token: unknown): CupPlayer | null {
    return this.session.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    this.session.setConnected(playerId, connected);
    if (!connected) {
      this.maybeEndQuizEarly();
      this.maybeEndDrinkEarly();
    }
  }

  kick(playerId: string): CupPlayer | null {
    const p = this.session.removePlayer(playerId);
    if (!p) return null;
    this.drinkers = this.drinkers.filter((id) => id !== playerId);
    this.session.changed();
    this.maybeEndQuizEarly();
    this.maybeEndDrinkEarly();
    return p;
  }

  private quizzing(p: CupPlayer): boolean {
    if (p.outRound !== null) return this.phase !== "countdown" && this.phase !== "podium";
    return this.phase === "quiz";
  }

  private answering(p: CupPlayer): boolean {
    return this.quizzing(p) && (p.outRound !== null || !p.safe);
  }

  answer(playerId: string, seq: number, option: AnswerValue): boolean {
    const answered = this.session.answer(playerId, seq, option);
    if (!answered) return false;
    const { player: p, correct } = answered;
    if (correct && p.outRound === null) {
      p.progress++;
      if (p.progress >= p.target) p.safe = true;
    }
    this.session.activity(p.id);
    if (p.safe) this.maybeEndQuizEarly();
    return true;
  }

  pick(playerId: string, cup: number): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "drink" || !this.drinkers.includes(p.id) || p.pick !== null) return false;
    if (!Number.isInteger(cup) || cup < 0 || cup >= p.cups) return false;
    p.pick = cup;
    this.session.activity(p.id);
    this.maybeEndDrinkEarly();
    return true;
  }

  private buildPodium(): Podium<CupPlayer, CupPlayer, CupAwardKey> {
    const players = [...this.players.values()];
    return buildPodium({
      entries: players,
      order: [most((p) => p.outRound ?? Infinity)],
      then: [most((p) => p.correct)],
      players,
      entryOf: (p) => p,
      awards: {
        labels: cupAwardLabels(this.theme),
        values: {
          mostCorrect: (p) => p.correct,
          mostDrinksSurvived: (p) => p.drinksSurvived,
          mostSafeRounds: (p) => p.safeRounds,
          earliestFirstCupOut: (p) => (this.poisonedByFirstCup(p) ? this.roundsFrom(p.outRound!) : 0),
        },
      },
    });
  }

  get podium(): Podium<CupPlayer, CupPlayer, CupAwardKey> {
    return this.session.podium;
  }

  private standings(): CupStanding[] {
    return this.podium.places.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      rank: p.place,
      cups: p.cups,
      outRound: p.outRound,
      correct: p.correct,
    }));
  }

  /** why: a single cup guarantees poison, so it cannot earn the Unluckiest award. */
  private poisonedByFirstCup(p: CupPlayer): boolean {
    return this.startCups > 1 && p.poisonedFrom === this.startCups && p.outRound !== null;
  }

  private roundsFrom(round: number): number {
    return this.round + 1 - round;
  }

  private awards(): CupAwards {
    const a = this.podium.awards;
    const out = a.earliestFirstCupOut;
    return { ...a, earliestFirstCupOut: out && { ...out, value: this.roundsFrom(out.value) } };
  }

  private revealView(): CupRevealView | null {
    const r = this.reveal;
    if (!r || this.phase !== "reveal") return null;
    const current = r.step >= 0 && r.step < r.drinks.length * 2 ? Math.floor(r.step / 2) : -1;
    return {
      seq: r.seq,
      round: r.round,
      current,
      drinks: r.drinks.map((d, i) => ({
        id: d.id,
        cup: d.cup,
        cupsBefore: d.cupsBefore,
        auto: d.auto,
        verdict: r.step >= 2 * i + 1 ? (d.poisoned ? "poison" : "safe") : null,
      })),
    };
  }

  hostView(): HostCupState {
    const podium = this.phase === "podium";
    const drinking = this.phase === "drink";
    return {
      kind: "cup",
      theme: this.theme,
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      round: this.round,
      phaseRemainingMs: this.session.phases.remainingMs(),
      phaseDurationMs: this.phaseDurationMs,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        connected: p.connected,
        cups: p.cups,
        out: p.outRound !== null,
        target: p.target,
        progress: p.progress,
        safe: p.safe,
        drinker: drinking && this.drinkers.includes(p.id),
        picked: drinking && p.pick !== null,
      })),
      startCups: this.startCups,
      reveal: this.revealView(),
      playerCount: this.players.size,
      standings: podium ? this.standings() : null,
      awards: podium ? this.awards() : null,
      errors: this.session.stream.errorsWhen(podium),
    };
  }

  playerView(playerId: string): PlayerCupView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    let result: PlayerCupView["result"] = null;
    if (this.phase === "podium") {
      const mine = this.podium.result(p.id);
      result = mine && {
        rank: mine.place,
        playerCount: mine.playerCount,
        won: mine.place === 1,
        outRound: p.outRound,
        awards: mine.awards,
      };
    }
    const reveal = this.revealView();
    const mineAt = reveal ? reveal.drinks.findIndex((d) => d.id === p.id) : -1;
    return {
      kind: "cup",
      theme: this.theme,
      phase: this.phase,
      title: this.title,
      round: this.round,
      phaseRemainingMs: this.session.phases.remainingMs(),
      phaseDurationMs: this.phaseDurationMs,
      me: {
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        cups: p.cups,
        out: p.outRound !== null,
        target: p.target,
        progress: p.progress,
        safe: p.safe,
        correct: p.correct,
      },
      startCups: this.startCups,
      ...this.session.stream.fragment(p),
      drink: this.phase === "drink" && this.drinkers.includes(p.id) ? { picked: p.pick } : null,
      myDrink: reveal && mineAt >= 0 ? { ...reveal.drinks[mineAt]!, seq: reveal.seq, turn: reveal.current === mineAt, waiting: reveal.current < mineAt } : null,
      alive: this.alive().length,
      result,
    };
  }
}

function cupColumns(game: CupGame): Column<{ rank: number; p: CupPlayer }>[] {
  const out = game.theme === "christmas" ? "Blasted off" : "Poisoned";
  return [
    { header: "Rank", value: (r) => r.rank },
    { header: "Nickname", value: (r) => r.p.nickname },
    { header: "Status", value: (r) => (r.rank === 1 ? "Winner" : r.p.outRound === null ? "Survived" : `${out} in round ${r.p.outRound}`) },
    { header: "Cups left", value: (r) => r.p.cups },
    { header: "Rounds survived", value: (r) => (r.p.outRound === null ? game.round : r.p.outRound - 1) },
    { header: "Correct", value: (r) => r.p.correct },
    { header: "Wrong", value: (r) => r.p.wrong },
    { header: "Accuracy %", value: (r) => accuracy(r.p) },
    { header: "Drinks survived", value: (r) => r.p.drinksSurvived },
    { header: "Rounds safe", value: (r) => r.p.safeRounds },
  ];
}

export function buildCupResults(game: CupGame): ResultsSheet {
  return sheet(
    cupColumns(game),
    game.podium.rows.map((r) => ({ rank: r.place, p: r.player })),
  );
}

export const cupMode: ModeEntry<"cup"> = {
  ...cupShared,
  defaultSettings: { cups: CUP_DEFAULT_CUPS, theme: THEMED_MODES.cup.default },
  readSettings(raw, current) {
    const cups = Number(raw.cups);
    if (!(Number.isInteger(cups) && cups >= CUP_MIN_CUPS && cups <= CUP_MAX_CUPS))
      throw new GameError(`Cups must be between ${CUP_MIN_CUPS} and ${CUP_MAX_CUPS}`);
    return { cups, theme: pickTheme(raw.theme, modeTheme("cup", current.theme), "cup") };
  },
  start(lobby, ctx) {
    const game = CupGame.fromLobby(lobby, handoffOptions(ctx));
    return { game, log: `${this.name} started with ${game.players.size} player(s)` };
  },
  pacing: null,
  teams: () => null,
  results: buildCupResults,
  handle(game, playerId, msg) {
    switch (msg.type) {
      case "cup.answer":
        return game.answer(playerId, Number(msg.seq), answerOf(msg)) ? undefined : "resend";
      case "cup.pick":
        return game.pick(playerId, Number(msg.cup)) ? undefined : "resend";
      default:
        return unhandled(msg);
    }
  },
};
