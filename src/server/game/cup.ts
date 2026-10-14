import type { AnswerValue } from "../../shared/answer-match.ts";
import {
  CUP_ALL_SAFE_MS,
  CUP_CUPS,
  CUP_DIE_SIDES,
  CUP_DRINK_MS,
  CUP_ROLL_MS,
  CUP_SIP_MS,
  CUP_VERDICT_MS,
  cupQuizMs,
  type CupAwards,
  type CupPhase,
  type CupRevealView,
  type CupStanding,
  type HostCupState,
  type PlayerCupView,
} from "../../shared/protocol.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { GameError, realClock, shuffle, type Clock } from "./common.ts";
import type { Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { QuestionStream, newStreamPlayer, type StreamPlayer } from "./stream.ts";

export { FEEDBACK_MS } from "./stream.ts";

export const COUNTDOWN_MS = 3000;

export interface CupPlayer extends BasePlayer, StreamPlayer {
  /** Cups still in front of the player. */
  cups: number;
  /** Round this player was poisoned in, or null while still alive. */
  outRound: number | null;
  /** This round's dice roll: correct answers needed to be safe. */
  target: number;
  /** Correct answers this round. */
  progress: number;
  safe: boolean;
  /** Drink phase: the cup picked, or null. */
  pick: number | null;
  drinksSurvived: number;
  safeRounds: number;
  /** Cups in front of them when they drank the poison (for "Unluckiest"). */
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
  /** Steps taken: drink k is in the spotlight from step 2k, its verdict shows from step 2k + 1. */
  step: number;
}

export interface CupOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: CupGame) => void;
}

export interface CupGameSettings {
  shuffleAnswers: boolean;
  /** Longer waits for wrong answers in a row (the lobby's "Protect from abuse"). */
  protect?: boolean;
}

/** Cup of Death: roll a die, answer that many questions in time, or drink one of your cups. One is poisoned. Last one standing wins. */
export class CupGame {
  readonly kind = "cup";
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly roster = new Roster<CupPlayer>();
  readonly startedAt = new Date();
  phase: CupPhase = "countdown";
  round = 0;
  phaseEndsAt = 0;
  phaseDurationMs = COUNTDOWN_MS;
  /** Ids of the players who have to drink this round (drink and reveal phases). */
  drinkers: string[] = [];
  reveal: Reveal | null = null;
  private reveals = 0;

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream;
  private timer: unknown = null;
  private stepTimer: unknown = null;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: CupGame) => void;

  constructor(quiz: Quiz, settings: CupGameSettings, opts: CupOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    this.stream = new QuestionStream(quiz.questions, settings.shuffleAnswers, this.rng, this.clock, settings.protect);
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  /** Take over a lobby's players (same ids and tokens). */
  static fromLobby(lobby: Game, opts: CupOptions = {}): CupGame {
    const game = new CupGame(lobby.quiz, { shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect }, opts);
    for (const p of lobby.players.values()) {
      game.roster.adopt(game.newPlayer({ id: p.id, nickname: p.nickname, token: p.token, connected: p.connected, avatar: p.avatar }));
    }
    return game;
  }

  get players(): Map<string, CupPlayer> {
    return this.roster.players;
  }

  private alive(): CupPlayer[] {
    return [...this.players.values()].filter((p) => p.outRound === null);
  }

  private rollDie(): number {
    return 1 + Math.min(CUP_DIE_SIDES - 1, Math.floor(this.rng() * CUP_DIE_SIDES));
  }

  private newPlayer(base: BasePlayer): CupPlayer {
    // Joining mid-round: roll straight away if the round's questions haven't finished yet.
    const rolling = this.phase === "roll" || this.phase === "quiz";
    return {
      ...base,
      ...newStreamPlayer(),
      cups: CUP_CUPS,
      outRound: null,
      target: rolling ? this.rollDie() : 0,
      progress: 0,
      // Too late to answer this round: they don't have to drink either.
      safe: !rolling,
      pick: null,
      drinksSurvived: 0,
      safeRounds: 0,
      poisonedFrom: null,
    };
  }

  // ---------- lifecycle ----------

  start(): void {
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    this.setPhase("countdown", COUNTDOWN_MS, () => this.beginRound());
    this.onChange();
  }

  private setPhase(phase: CupPhase, ms: number, then: () => void): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.phase = phase;
    this.phaseDurationMs = ms;
    this.phaseEndsAt = this.clock.now() + ms;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      then();
    }, ms);
  }

  /** Everyone still alive rolls the die: that's how many questions they must get right. */
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
    this.setPhase("roll", CUP_ROLL_MS, () => this.beginQuiz());
    this.onChange();
  }

  private beginQuiz(): void {
    this.setPhase("quiz", cupQuizMs(this.round), () => this.endQuiz());
    for (const p of this.players.values()) if (!p.current) this.stream.deal(p);
    this.onChange();
  }

  /** Ends the quiz early once every connected living player is safe. */
  private maybeEndQuizEarly(): void {
    if (this.phase !== "quiz") return;
    const alive = this.alive();
    if (alive.some((p) => p.connected) && alive.every((p) => p.safe || !p.connected)) this.endQuiz();
  }

  /** Time's up: whoever isn't safe has to drink. */
  private endQuiz(): void {
    if (this.phase !== "quiz") return;
    for (const p of this.alive()) if (p.safe && p.target > 0) p.safeRounds++;
    const drinkers = this.alive().filter((p) => !p.safe);
    this.drinkers = shuffle(
      drinkers.map((p) => p.id),
      this.rng,
    );
    if (drinkers.length === 0) {
      this.reveal = { seq: ++this.reveals, round: this.round, drinks: [], step: 0 };
      this.setPhase("reveal", CUP_ALL_SAFE_MS, () => this.afterReveal());
      this.onChange();
      return;
    }
    // A last cup needs no choosing.
    for (const p of drinkers) if (p.cups <= 1) p.pick = 0;
    this.setPhase("drink", CUP_DRINK_MS, () => this.pour());
    this.onChange();
    this.maybeEndDrinkEarly();
  }

  private maybeEndDrinkEarly(): void {
    if (this.phase !== "drink") return;
    const waiting = this.drinkers.map((id) => this.players.get(id)).filter((p) => p && p.connected && p.pick === null);
    if (waiting.length === 0) this.pour();
  }

  /** Everyone drinks: random cups for anyone who didn't pick, then one cup in each set turns out to be poisoned. */
  private pour(): void {
    if (this.phase !== "drink") return;
    const drinks: Drink[] = [];
    for (const id of this.drinkers) {
      const p = this.players.get(id);
      if (!p || p.outRound !== null) continue;
      const auto = p.pick === null || p.cups <= 1;
      const cup = p.pick ?? Math.floor(this.rng() * p.cups);
      const poison = Math.floor(this.rng() * p.cups);
      drinks.push({ id, cup, cupsBefore: p.cups, auto, poisoned: cup === poison });
    }
    this.reveal = { seq: ++this.reveals, round: this.round, drinks, step: -1 };
    this.setPhase("reveal", drinks.length * (CUP_SIP_MS + CUP_VERDICT_MS), () => this.afterReveal());
    this.nextStep();
  }

  /** Spotlight the next drinker, or show the current one's verdict. */
  private nextStep(): void {
    this.stepTimer = null;
    const r = this.reveal;
    if (!r || this.phase !== "reveal") return;
    r.step++;
    if (r.step % 2 === 1) this.applyVerdict(r.drinks[(r.step - 1) / 2]!);
    if (r.step < r.drinks.length * 2 - 1) this.stepTimer = this.clock.setTimeout(() => this.nextStep(), r.step % 2 === 0 ? CUP_SIP_MS : CUP_VERDICT_MS);
    this.onChange();
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
    // Everything has been shown by now; make sure every verdict is in.
    const r = this.reveal;
    if (r) while (r.step < r.drinks.length * 2 - 1) this.forceStep(r);
    if (this.stepTimer !== null) this.clock.clearTimeout(this.stepTimer);
    this.stepTimer = null;
    if (this.isOver()) this.finish();
    else this.beginRound();
  }

  private forceStep(r: Reveal): void {
    r.step++;
    if (r.step % 2 === 1) this.applyVerdict(r.drinks[(r.step - 1) / 2]!);
  }

  /** Last one standing (everyone poisoned in the same round share the win); a solo game runs until its player is out. */
  private isOver(): boolean {
    const alive = this.alive().length;
    return this.players.size <= 1 ? alive === 0 : alive <= 1;
  }

  /** Host ends the game now; standings are as they are. */
  end(): void {
    this.finish();
  }

  private finish(): void {
    if (this.phase === "podium") return;
    // Ending mid-reveal: the drinks already poured still count.
    const r = this.reveal;
    if (this.phase === "reveal" && r) while (r.step < r.drinks.length * 2 - 1) this.forceStep(r);
    this.clearTimers();
    this.phase = "podium";
    this.phaseEndsAt = 0;
    this.phaseDurationMs = 0;
    this.drinkers = [];
    this.reveal = null;
    this.onFinish(this);
    this.onChange();
  }

  dispose(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    if (this.stepTimer !== null) this.clock.clearTimeout(this.stepTimer);
    this.timer = null;
    this.stepTimer = null;
  }

  // ---------- players ----------

  join(rawNickname: unknown, avatar?: AvatarChoice | null): CupPlayer {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base));
    if (this.phase !== "countdown") this.stream.deal(player);
    this.onChange();
    return player;
  }

  byToken(token: unknown): CupPlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.onChange();
    if (!connected) {
      this.maybeEndQuizEarly();
      this.maybeEndDrinkEarly();
    }
  }

  kick(playerId: string): CupPlayer | null {
    const p = this.roster.remove(playerId);
    if (!p) return null;
    this.drinkers = this.drinkers.filter((id) => id !== playerId);
    this.onChange();
    this.maybeEndQuizEarly();
    this.maybeEndDrinkEarly();
    return p;
  }

  // ---------- actions ----------

  /** Whether this player is answering questions right now. */
  private answering(p: CupPlayer): boolean {
    if (p.outRound !== null) return this.phase !== "countdown" && this.phase !== "podium";
    return this.phase === "quiz" && !p.safe;
  }

  /** Answer a question. Living players need `target` right this round; poisoned players answer for practice. */
  answer(playerId: string, seq: number, option: AnswerValue): boolean {
    const p = this.players.get(playerId);
    if (!p || !p.current || !this.answering(p)) return false;
    const correct = this.stream.answer(p, seq, option);
    if (correct === null) return false;
    if (correct && p.outRound === null) {
      p.progress++;
      if (p.progress >= p.target) p.safe = true;
    }
    this.onActivity(p.id);
    if (p.safe) this.maybeEndQuizEarly();
    return true;
  }

  /** Pick a cup to drink (drinkers only, drink phase only, once). */
  pick(playerId: string, cup: number): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "drink" || !this.drinkers.includes(p.id) || p.pick !== null) return false;
    if (!Number.isInteger(cup) || cup < 0 || cup >= p.cups) return false;
    p.pick = cup;
    this.onActivity(p.id);
    this.maybeEndDrinkEarly();
    return true;
  }

  // ---------- results ----------

  /** Survivors first, then the latest poisoned; poisoned in the same round share a rank. Ordered by correct answers within a rank. */
  standings(): CupStanding[] {
    const key = (p: CupPlayer) => p.outRound ?? 1e6;
    const sorted = [...this.players.values()].sort((a, b) => key(b) - key(a) || b.correct - a.correct);
    let rank = 0;
    let prev: number | null = null;
    return sorted.map((p, i) => {
      if (key(p) !== prev) {
        rank = i + 1;
        prev = key(p);
      }
      return { id: p.id, nickname: p.nickname, avatar: p.avatar, rank, cups: p.cups, outRound: p.outRound, correct: p.correct };
    });
  }

  awards(): CupAwards {
    const players = [...this.players.values()];
    const best = (value: (p: CupPlayer) => number) => {
      const top = Math.max(0, ...players.map(value));
      return top > 0 ? { value: top, nicknames: players.filter((p) => value(p) === top).map((p) => p.nickname) } : null;
    };
    const unlucky = players.filter((p) => p.poisonedFrom === CUP_CUPS && p.outRound !== null);
    const first = Math.min(...unlucky.map((p) => p.outRound!));
    return {
      mostCorrect: best((p) => p.correct),
      luckiest: best((p) => p.drinksSurvived),
      neverThirsty: best((p) => p.safeRounds),
      unluckiest: unlucky.length > 0 ? { value: first, nicknames: unlucky.filter((p) => p.outRound === first).map((p) => p.nickname) } : null,
    };
  }

  // ---------- views ----------

  private remainingMs(): number {
    return this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.clock.now()) : 0;
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
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      round: this.round,
      phaseRemainingMs: this.remainingMs(),
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
      reveal: this.revealView(),
      playerCount: this.players.size,
      standings: podium ? this.standings() : null,
      awards: podium ? this.awards() : null,
      errors: podium ? this.stream.errors() : null,
      hasResults: podium,
    };
  }

  playerView(playerId: string): PlayerCupView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    let result: PlayerCupView["result"] = null;
    if (this.phase === "podium") {
      const standings = this.standings();
      const mine = standings.find((s) => s.id === p.id)!;
      const aw = this.awards();
      const won = (a: { nicknames: string[] } | null) => !!a?.nicknames.includes(p.nickname);
      result = {
        rank: mine.rank,
        playerCount: standings.length,
        won: mine.rank === 1,
        outRound: p.outRound,
        awards: [
          ...(won(aw.mostCorrect) ? ["Most correct answers"] : []),
          ...(won(aw.luckiest) ? ["Luckiest drinker"] : []),
          ...(won(aw.neverThirsty) ? ["Never thirsty"] : []),
          ...(won(aw.unluckiest) ? ["Unluckiest"] : []),
        ],
      };
    }
    const reveal = this.revealView();
    const mineAt = reveal ? reveal.drinks.findIndex((d) => d.id === p.id) : -1;
    return {
      kind: "cup",
      phase: this.phase,
      title: this.title,
      round: this.round,
      phaseRemainingMs: this.remainingMs(),
      phaseDurationMs: this.phaseDurationMs,
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, cups: p.cups, out: p.outRound !== null, target: p.target, progress: p.progress, safe: p.safe, correct: p.correct },
      question: this.answering(p) ? this.stream.questionView(p) : null,
      feedback: this.stream.feedbackView(p),
      drink: this.phase === "drink" && this.drinkers.includes(p.id) ? { picked: p.pick } : null,
      myDrink: reveal && mineAt >= 0 ? { ...reveal.drinks[mineAt]!, seq: reveal.seq, turn: reveal.current === mineAt, waiting: reveal.current < mineAt } : null,
      alive: this.alive().length,
      result,
    };
  }
}
