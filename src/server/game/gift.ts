import type { AnswerValue } from "../../shared/answer-match.ts";
import { answerOf } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
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
import type { GiftAwardKey, GiftHit, GiftPhase, GiftStanding, HostGiftState, PlayerGiftView } from "../../shared/modes/gift.ts";
import { giftShared } from "../../shared/modes/gift.ts";
import type { Quiz } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { GameError, shuffle } from "./common.ts";
import type { LobbyChoices, LobbyFacts } from "./lobby-facts.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, unhandled } from "./mode-entry.ts";
import type { Podium } from "./podium.ts";
import { buildPodium, emptyPodium } from "./podium.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { sheet } from "./results.ts";
import type { BasePlayer } from "./roster.ts";
import { most, rankBy } from "./standings.ts";
import type { AnswerTotals } from "./stream.ts";
import { StreamedSession } from "./streamed-session.ts";

const COUNTDOWN_MS = 3_000;
const GIFT_ORDER = [most((p: GiftPlayer) => p.score), most((p: GiftPlayer) => p.correct)];
const GIFT_AWARD_VALUES: Record<GiftAwardKey, (p: GiftPlayer) => number> = { mostCorrect: (p) => p.correct };

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
  const giftMixBatchMs = 5_000;
  const kinds = Array.from({ length: GIFT_ROUND_MS / giftMixBatchMs }, (_, batch) => {
    const goods = [...GIFT_GOODS, ...shuffle([...GIFT_GOODS], rng).slice(0, 3)];
    const duds = shuffle([...GIFT_DUDS], rng);
    const power = batch === 0 && round % 3 === 0;
    if (power) duds.shift();

    const batchItems = shuffle<GiftItemKind>([...goods, ...duds], rng);
    // why: a power-up launches in the first wave so there is time to use it.
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

export class GiftGame {
  readonly runningMode = "gift" as const;
  readonly quizId: string;
  readonly title: string;
  private readonly durationMs: number;
  private readonly session: StreamedSession<GiftPlayer, GiftPhase, Podium<GiftPlayer, GiftPlayer, GiftAwardKey>>;

  private constructor(
    private readonly quiz: Quiz,
    readonly minutes: number,
    shuffleAnswers: boolean,
    protect: boolean,
    opts: GiftOptions,
  ) {
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.durationMs = minutes * 60_000;
    this.session = new StreamedSession({
      questions: quiz.questions,
      shuffleAnswers,
      protect,
      clock: opts.clock,
      rng: opts.rng,
      countdownMs: COUNTDOWN_MS,
      inPlay: (phase) => phase === "playing",
      minutes,
      canAnswer: (player) => !player.bonus && this.phase === "playing" && this.session.phases.remainingMs() > 0,
      cleanup: () => {
        for (const player of this.players.values()) player.bonus = null;
      },
      podium: { build: () => this.buildPodium(), empty: () => emptyPodium(giftShared.awards) },
      hub: { onChange: opts.onChange, onActivity: opts.onActivity, onFinish: () => opts.onFinish?.(this) },
    });
  }

  private newPlayer(base: BasePlayer): Omit<GiftPlayer, keyof AnswerTotals> {
    return { ...base, score: 0, rounds: 0, goodTaps: 0, dudTaps: 0, powerups: 0, bonus: null };
  }

  static fromLobby(lobby: LobbyFacts<"gift">, opts: GiftOptions = {}): GiftGame {
    if (!lobby.quiz.questions.length) throw new GameError("This quiz has no questions");
    const game = new GiftGame(lobby.quiz, lobby.settings.minutes, lobby.shuffle.answers, lobby.protect, opts);
    game.session.adoptLobby(lobby, (base) => game.newPlayer(base));
    return game;
  }

  get choices(): LobbyChoices {
    return this.session.choices;
  }

  get phase(): GiftPhase {
    return this.session.phase;
  }

  get players(): Map<string, GiftPlayer> {
    return this.session.players;
  }

  start(): void {
    this.session.start(() => this.beginPlaying());
  }

  private beginPlaying(): void {
    this.session.startGameLength("playing", () => this.expire());
    for (const player of this.players.values()) this.session.stream.open(player);
    this.session.changed();
  }

  /** why: the last bonus rounds play out before the game finishes. */
  private expire(): void {
    this.session.phases.enter("finishing");
    this.finishIfReady();
    this.session.changed();
  }

  private finishIfReady(): void {
    if (this.phase === "finishing" && ![...this.players.values()].some((player) => player.bonus)) this.end();
  }

  end(): void {
    this.session.end();
  }

  dispose(): void {
    this.session.dispose();
    for (const player of this.players.values()) player.bonus = null;
  }

  private clearBonus(player: GiftPlayer): void {
    this.session.phases.cancel(`bonus:${player.id}`);
    player.bonus = null;
  }

  join(rawNickname: unknown, avatar?: AvatarChoice | null): GiftPlayer {
    if (this.phase === "podium" || this.phase === "finishing") throw new GameError("This game has finished accepting players");
    const player = this.session.addPlayer(rawNickname, avatar, (base) => this.newPlayer(base));
    this.session.changed();
    return player;
  }

  byToken(token: unknown): GiftPlayer | null {
    return this.session.byToken(token);
  }

  setConnected(id: string, connected: boolean): void {
    this.session.setConnected(id, connected);
  }

  kick(id: string): GiftPlayer | null {
    const player = this.session.removePlayer(id);
    if (player) {
      this.clearBonus(player);
      this.finishIfReady();
      this.session.changed();
    }
    return player;
  }

  answer(id: string, seq: number, answer: AnswerValue): boolean {
    const answered = this.session.answer(id, seq, answer);
    if (!answered) return false;
    const { player, correct } = answered;
    if (correct && player.correct % GIFT_CORRECT_TO_PLAY === 0) this.earnBonus(player);
    this.session.activity(id);
    return true;
  }

  private earnBonus(player: GiftPlayer): void {
    const start = this.session.stream.feedbackEndsAt(player) + GIFT_READY_MS;
    const endsAt = start + GIFT_ROUND_MS;
    const round = ++player.rounds;
    player.bonus = {
      start,
      endsAt,
      multiplier: this.multiplier(),
      items: launchSchedule(round, this.session.rng),
      hits: new Map(),
      power: null,
    };
    this.session.phases.after(`bonus:${player.id}`, endsAt - this.session.clock.now(), () => {
      this.clearBonus(player);
      this.finishIfReady();
      if (this.phase !== "podium") this.session.activity(player.id);
    });
  }

  tap(id: string, round: number, itemId: number): boolean {
    const player = this.players.get(id);
    const bonus = player?.bonus;
    if (!player || !bonus || player.rounds !== round || !Number.isInteger(itemId) || bonus.hits.has(itemId)) return false;
    const item = bonus.items[itemId];
    const now = this.session.clock.now();
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
    this.session.activity(id);
    return true;
  }

  private buildPodium(): Podium<GiftPlayer, GiftPlayer, GiftAwardKey> {
    const players = [...this.players.values()];
    return buildPodium({
      entries: players,
      order: GIFT_ORDER,
      players,
      entryOf: (p) => p,
      awards: { labels: giftShared.awards, values: GIFT_AWARD_VALUES },
    });
  }

  get podium(): Podium<GiftPlayer, GiftPlayer, GiftAwardKey> {
    return this.session.podium;
  }

  private standings(): GiftStanding[] {
    const ranked = this.phase === "podium" ? this.podium.places.map((p) => ({ ...p, rank: p.place })) : rankBy([...this.players.values()], GIFT_ORDER);
    return ranked.map((player) => {
      const { id, nickname, avatar, rank, score, correct } = player;
      const live = this.players.get(id);
      return { id, nickname, avatar, rank, score, correct, connected: live?.connected ?? false, inBonus: !!live?.bonus };
    });
  }

  private multiplier(): number {
    if (this.phase === "countdown") return 1;
    return giftMultiplier(this.durationMs - this.session.phases.remainingMs(), this.durationMs);
  }

  hostView(): HostGiftState {
    const standings = this.standings();
    const final = this.phase === "podium";
    return {
      kind: "gift",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.quiz.questions.length },
      remainingMs: this.session.phases.remainingMs(),
      standings,
      mostCorrect: final ? this.podium.awards.mostCorrect : null,
      errors: this.session.stream.errorsWhen(final) ?? [],
    };
  }

  playerView(id: string): PlayerGiftView | null {
    const player = this.players.get(id);
    if (!player) return null;
    const bonus = player.bonus;
    return {
      kind: "gift",
      phase: this.phase,
      remainingMs: this.session.phases.remainingMs(),
      score: player.score,
      correct: player.correct,
      progress: bonus ? GIFT_CORRECT_TO_PLAY : player.correct % GIFT_CORRECT_TO_PLAY,
      rank: this.phase === "podium" ? (this.podium.result(id)?.place ?? null) : null,
      ...this.session.stream.fragment(player),
      bonus: bonus
        ? {
            round: player.rounds,
            remainingMs: Math.max(0, bonus.endsAt - this.session.clock.now()),
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
    game.podium.rows.map((r) => ({ rank: r.place, p: r.player })),
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
