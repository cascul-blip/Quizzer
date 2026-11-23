import type { AnswerValue } from "../../shared/answer-match.ts";
import { answerOf } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { randomAvatar } from "../../shared/avatars.ts";
import type { GiftItem, GiftItemKind, GiftPower } from "../../shared/gift-rules.ts";
import {
  GIFT_CORRECT_TO_PLAY,
  GIFT_DEFAULT_MINUTES,
  GIFT_DUDS,
  GIFT_GOODS,
  GIFT_MINUTES,
  GIFT_POINTS,
  GIFT_READY_MS,
  GIFT_ROUND_MS,
  GIFT_TAP_GRACE_MS,
  giftMultiplier,
} from "../../shared/gift-rules.ts";
import type { GiftHit, GiftPhase, GiftStanding, HostGiftState, PlayerGiftView } from "../../shared/modes/gift.ts";
import { giftShared } from "../../shared/modes/gift.ts";
import type { Quiz } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { GameError, realClock, shuffle } from "./common.ts";
import type { LobbyChoices, LobbyFacts } from "./lobby-facts.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, unhandled } from "./mode-entry.ts";
import { GameLengthClock, PhaseTimer } from "./phase-timer.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { sheet } from "./results.ts";
import type { BasePlayer } from "./roster.ts";
import { Roster } from "./roster.ts";
import type { AnswerTotals } from "./stream.ts";
import { QuestionStream } from "./stream.ts";

const COUNTDOWN_MS = 3_000;

interface Bonus {
  start: number;
  endsAt: number;
  multiplier: number;
  items: GiftItem[];
  hits: Map<number, GiftHit>;
  power: GiftPower | null;
}

interface GiftPlayer extends BasePlayer, AnswerTotals {
  score: number;
  rounds: number;
  goodTaps: number;
  dudTaps: number;
  powerups: number;
  bonus: Bonus | null;
}

interface GiftOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (id: string) => void;
  onFinish?: (game: GiftGame) => void;
}

function launchSchedule(round: number, rng: () => number): GiftItem[] {
  const waveMs = 1_250;
  // Each five-second batch keeps the same mix of gifts and duds.
  const kinds = Array.from({ length: GIFT_ROUND_MS / 5_000 }, (_, batch) => {
    const goods = [...GIFT_GOODS, ...shuffle([...GIFT_GOODS], rng).slice(0, 3)];
    const duds = shuffle([...GIFT_DUDS], rng);
    const power = batch === 0 && round % 3 === 0;
    if (power) duds.shift();

    const batchItems = shuffle<GiftItemKind>([...goods, ...duds], rng);
    // A power-up launches in the first wave so there is time to use it.
    if (power) batchItems.splice(Math.floor(rng() * 3), 0, round % 6 === 3 ? "shield" : "star");
    return batchItems;
  }).flat();

  return Array.from({ length: GIFT_ROUND_MS / waveMs }, (_, wave) =>
    shuffle([0, 1, 2], rng).map((lane, slot) => {
      const id = wave * 3 + slot;
      const from = wave * waveMs + slot * 65;
      return { id, kind: kinds[id]!, lane, from, until: from + 1_050 };
    }),
  ).flat();
}

function compare(a: GiftPlayer, b: GiftPlayer): number {
  return b.score - a.score || b.correct - a.correct;
}

export class GiftGame {
  readonly runningMode = "gift" as const;
  readonly quizId: string;
  readonly title: string;
  readonly roster = new Roster<GiftPlayer>();

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream<GiftPlayer>;
  private readonly durationMs: number;
  private readonly onChange: () => void;
  private readonly onActivity: (id: string) => void;
  private readonly onFinish: (game: GiftGame) => void;
  private readonly phases: PhaseTimer<GiftPhase>;
  private readonly gameLength: GameLengthClock<GiftPhase>;

  private constructor(
    private readonly quiz: Quiz,
    readonly minutes: number,
    shuffleAnswers: boolean,
    protect: boolean,
    opts: GiftOptions,
  ) {
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.clock = opts.clock ?? realClock;
    this.phases = new PhaseTimer(this.clock, "countdown");
    this.gameLength = new GameLengthClock(this.phases, () => this.finish());
    this.rng = opts.rng ?? Math.random;
    this.stream = new QuestionStream(quiz.questions, shuffleAnswers, this.rng, this.clock, {
      penalizeGuessing: protect,
      canAnswer: (player) => !player.bonus && this.phase === "playing" && this.phases.remainingMs() > 0,
    });
    this.durationMs = minutes * 60_000;
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? this.onChange;
    this.onFinish = opts.onFinish ?? (() => {});
  }

  private newPlayer(base: BasePlayer): GiftPlayer {
    return this.stream.registerPlayer({ ...base, score: 0, rounds: 0, goodTaps: 0, dudTaps: 0, powerups: 0, bonus: null });
  }

  /** What the lobby chose at Start; the next lobby opens with it. */
  choices!: LobbyChoices;

  static fromLobby(lobby: LobbyFacts<"gift">, opts: GiftOptions = {}): GiftGame {
    if (!lobby.quiz.questions.length) throw new GameError("This quiz has no questions");
    const game = new GiftGame(lobby.quiz, lobby.settings.minutes, lobby.shuffle.answers, lobby.protect, opts);
    game.choices = lobby.choices;
    game.roster.adoptFrom(lobby.players, (base) => game.newPlayer(base));
    return game;
  }

  get phase(): GiftPhase {
    return this.phases.phase;
  }

  get players(): Map<string, GiftPlayer> {
    return this.roster.players;
  }

  /** Set by start(); a running game can't be started again. */
  private started = false;

  start(): void {
    if (this.started) throw new GameError("The game has already started");
    if (!this.players.size) throw new GameError("Wait for at least one player to join");
    this.started = true;
    this.phases.set("countdown", COUNTDOWN_MS, () => this.beginPlaying());
    this.onChange();
  }

  private beginPlaying(): void {
    this.gameLength.start("playing", this.durationMs, () => this.expire());
    for (const player of this.players.values()) this.stream.open(player);
    this.onChange();
  }

  /** The deadline: the last bonus rounds play out before the game finishes. */
  private expire(): void {
    this.phases.enter("finishing");
    this.finishIfReady();
    this.onChange();
  }

  private finishIfReady(): void {
    if (this.phase === "finishing" && ![...this.players.values()].some((player) => player.bonus)) this.end();
  }

  end(): void {
    this.gameLength.end();
  }

  /** Runs once, from the game-length clock: when the last bonus round after the deadline ends, or when the host ends the game. */
  private finish(): void {
    this.dispose();
    this.phases.enter("podium");
    this.onFinish(this);
    this.onChange();
  }

  dispose(): void {
    this.phases.dispose();
    for (const player of this.players.values()) player.bonus = null;
  }

  private clearBonus(player: GiftPlayer): void {
    this.phases.cancel(`bonus:${player.id}`);
    player.bonus = null;
  }

  join(rawNickname: unknown, avatar?: AvatarChoice | null): GiftPlayer {
    if (this.phase === "podium" || this.phase === "finishing") throw new GameError("This game has finished accepting players");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base));
    this.stream.openOnJoin(player, this.phase === "playing");
    this.onChange();
    return player;
  }

  byToken(token: unknown): GiftPlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(id: string, connected: boolean): void {
    if (this.roster.setConnected(id, connected)) this.onChange();
  }

  kick(id: string): GiftPlayer | null {
    const player = this.roster.remove(id);
    if (player) {
      this.clearBonus(player);
      this.finishIfReady();
      this.onChange();
    }
    return player;
  }

  answer(id: string, seq: number, answer: AnswerValue): boolean {
    const player = this.players.get(id);
    if (!player) return false;
    const correct = this.stream.answer(player, seq, answer);
    if (correct === null) return false;
    if (correct && player.correct % GIFT_CORRECT_TO_PLAY === 0) this.earnBonus(player);
    this.onActivity(id);
    return true;
  }

  private earnBonus(player: GiftPlayer): void {
    const start = this.stream.feedbackEndsAt(player) + GIFT_READY_MS;
    const endsAt = start + GIFT_ROUND_MS;
    const round = ++player.rounds;
    player.bonus = {
      start,
      endsAt,
      multiplier: this.multiplier(),
      items: launchSchedule(round, this.rng),
      hits: new Map(),
      power: null,
    };
    this.phases.after(`bonus:${player.id}`, endsAt - this.clock.now(), () => {
      this.clearBonus(player);
      this.finishIfReady();
      if (this.phase !== "podium") this.onActivity(player.id);
    });
  }

  tap(id: string, round: number, itemId: number): boolean {
    const player = this.players.get(id);
    const bonus = player?.bonus;
    if (!player || !bonus || player.rounds !== round || !Number.isInteger(itemId) || bonus.hits.has(itemId)) return false;
    const item = bonus.items[itemId];
    const now = this.clock.now();
    const elapsed = now - bonus.start;
    if (!item || now >= bonus.endsAt || elapsed < item.from || elapsed >= item.until + GIFT_TAP_GRACE_MS) return false;

    const before = player.score;
    const points = GIFT_POINTS * bonus.multiplier;
    let effect: GiftHit["effect"] = null;
    if (item.kind === "shield" || item.kind === "star") {
      bonus.power = effect = item.kind;
      player.powerups++;
    } else if (GIFT_DUDS.some((kind) => kind === item.kind)) {
      player.dudTaps++;
      if (bonus.power === "shield") {
        bonus.power = null;
        effect = "blocked";
      } else player.score = Math.max(0, player.score - points);
    } else {
      player.goodTaps++;
      player.score += bonus.power === "star" ? points * 2 : points;
      if (bonus.power === "star") bonus.power = null;
    }
    bonus.hits.set(itemId, { item: itemId, delta: player.score - before, effect });
    this.onActivity(id);
    return true;
  }

  standings(): GiftStanding[] {
    const sorted = [...this.players.values()].sort(compare);
    let rank = 0;
    return sorted.map((player, i) => {
      if (i === 0 || compare(sorted[i - 1]!, player) !== 0) rank = i + 1;
      const { id, nickname, avatar, score, correct, connected } = player;
      return { id, nickname, avatar, rank, score, correct, connected, inBonus: player.bonus !== null };
    });
  }

  private multiplier(): number {
    if (this.phase === "countdown") return 1;
    return giftMultiplier(this.durationMs - this.phases.remainingMs(), this.durationMs);
  }

  hostView(): HostGiftState {
    const standings = this.standings();
    const final = this.phase === "podium";
    const value = final ? Math.max(0, ...standings.map((player) => player.correct)) : 0;
    return {
      kind: "gift",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.quiz.questions.length },
      remainingMs: this.phases.remainingMs(),
      standings,
      mostCorrect: value ? { value, nicknames: standings.filter((player) => player.correct === value).map((player) => player.nickname) } : null,
      // Gift's host view always carries a list, empty until the podium.
      errors: this.stream.errorsWhen(final) ?? [],
    };
  }

  playerView(id: string): PlayerGiftView | null {
    const player = this.players.get(id);
    if (!player) return null;
    const bonus = player.bonus;
    return {
      kind: "gift",
      phase: this.phase,
      remainingMs: this.phases.remainingMs(),
      score: player.score,
      correct: player.correct,
      progress: bonus ? GIFT_CORRECT_TO_PLAY : player.correct % GIFT_CORRECT_TO_PLAY,
      rank: this.phase === "podium" ? this.standings().find((standing) => standing.id === id)!.rank : null,
      ...this.stream.fragment(player),
      bonus: bonus
        ? {
            round: player.rounds,
            remainingMs: Math.max(0, bonus.endsAt - this.clock.now()),
            multiplier: bonus.multiplier,
            items: bonus.items,
            hits: [...bonus.hits.values()],
            power: bonus.power,
          }
        : null,
    };
  }
}

const GIFT_COLUMNS: Column<{ rank: number; p: GiftPlayer }>[] = [
  { header: "Rank", value: (r) => r.rank },
  { header: "Nickname", value: (r) => r.p.nickname },
  { header: "Score", value: (r) => r.p.score },
  { header: "Correct", value: (r) => r.p.correct },
  { header: "Wrong", value: (r) => r.p.wrong },
  { header: "Bonus rounds earned", value: (r) => r.p.rounds },
  { header: "Gift taps", value: (r) => r.p.goodTaps },
  { header: "Dud taps", value: (r) => r.p.dudTaps },
  { header: "Power-ups collected", value: (r) => r.p.powerups },
];

export function buildGiftResults(game: GiftGame): ResultsSheet {
  return sheet(
    GIFT_COLUMNS,
    game.standings().map(({ id, rank }) => ({ rank, p: game.players.get(id)! })),
  );
}

export const giftMode: ModeEntry<"gift"> = {
  ...giftShared,
  defaultSettings: { minutes: GIFT_DEFAULT_MINUTES },
  readSettings(raw) {
    const minutes = Number(raw.minutes);
    if (!(GIFT_MINUTES as readonly number[]).includes(minutes)) throw new GameError("Unsupported game length");
    return { minutes };
  },
  start(lobby, ctx) {
    const game = GiftGame.fromLobby(lobby, handoffOptions(ctx));
    return { game, log: `${this.name} started with ${game.players.size} player(s), ${game.minutes} min` };
  },
  pacing: null,
  teams: () => null,
  results: buildGiftResults,
  handle(game, playerId, msg) {
    switch (msg.type) {
      case "gift.answer":
        return game.answer(playerId, Number(msg.seq), answerOf(msg)) ? undefined : "resend";
      case "gift.tap":
        game.tap(playerId, msg.round, msg.item);
        return;
      default:
        return unhandled(msg);
    }
  },
};
