import type { AnswerValue } from "../../shared/answer-match.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import {
  GIFT_CORRECT_TO_PLAY,
  GIFT_DUDS,
  GIFT_GOODS,
  GIFT_POINTS,
  GIFT_READY_MS,
  GIFT_ROUND_MS,
  GIFT_TAP_GRACE_MS,
  giftMultiplier,
  type GiftItem,
  type GiftItemKind,
  type GiftPower,
  GIFT_DEFAULT_MINUTES,
  GIFT_MINUTES,
} from "../../shared/gift-rules.ts";
import type { GiftHit, GiftPhase, GiftStanding, HostGiftState, PlayerGiftView } from "../../shared/protocol.ts";
import type { Quiz } from "../../shared/quiz-schema.ts";
import { GameError, realClock, shuffle, type Clock } from "./common.ts";
import type { Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { newStreamPlayer, QuestionStream, type StreamPlayer } from "./stream.ts";
import { answerOf } from "../../shared/answer-match.ts";
import { MODE_NAMES } from "../../shared/mode-names.ts";
import { handoffOptions, unhandled, type ModeEntry } from "./mode-entry.ts";
import { toCsv } from "./results.ts";

const COUNTDOWN_MS = 3_000;

interface Bonus {
  start: number;
  endsAt: number;
  multiplier: number;
  items: GiftItem[];
  hits: Map<number, GiftHit>;
  power: GiftPower | null;
  timer: unknown;
}

interface GiftPlayer extends BasePlayer, StreamPlayer {
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

  return Array.from({ length: GIFT_ROUND_MS / waveMs }, (_, wave) => shuffle([0, 1, 2], rng).map((lane, slot) => {
    const id = wave * 3 + slot;
    const from = wave * waveMs + slot * 65;
    return { id, kind: kinds[id]!, lane, from, until: from + 1_050 };
  })).flat();
}

function newPlayer(base: BasePlayer): GiftPlayer {
  return { ...base, ...newStreamPlayer(), score: 0, rounds: 0, goodTaps: 0, dudTaps: 0, powerups: 0, bonus: null };
}

function compare(a: GiftPlayer, b: GiftPlayer): number {
  return b.score - a.score || b.correct - a.correct;
}

export class GiftGame {
  readonly runningMode = "gift" as const;
  readonly quizId: string;
  readonly title: string;
  readonly roster = new Roster<GiftPlayer>();
  phase: GiftPhase = "countdown";

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream;
  private readonly durationMs: number;
  private readonly onChange: () => void;
  private readonly onActivity: (id: string) => void;
  private readonly onFinish: (game: GiftGame) => void;
  private timer: unknown = null;
  private phaseEndsAt = 0;

  private constructor(private readonly quiz: Quiz, readonly minutes: number, shuffleAnswers: boolean, protect: boolean, opts: GiftOptions) {
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    this.stream = new QuestionStream(quiz.questions, shuffleAnswers, this.rng, this.clock, protect);
    this.durationMs = minutes * 60_000;
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? this.onChange;
    this.onFinish = opts.onFinish ?? (() => {});
  }

  static fromLobby(lobby: Game, opts: GiftOptions = {}, protect = lobby.protect): GiftGame {
    if (!lobby.quiz.questions.length) throw new GameError("This quiz has no questions");
    const game = new GiftGame(lobby.quiz, lobby.settings.gift.minutes, lobby.shuffle.answers, protect, opts);
    for (const player of lobby.players.values()) {
      const { id, nickname, token, connected, avatar } = player;
      game.roster.adopt(newPlayer({ id, nickname, token, connected, avatar }));
    }
    return game;
  }

  get players(): Map<string, GiftPlayer> {
    return this.roster.players;
  }

  start(): void {
    if (!this.players.size) throw new GameError("Wait for at least one player to join");
    this.phaseEndsAt = this.clock.now() + COUNTDOWN_MS;
    this.timer = this.clock.setTimeout(() => {
      this.phase = "playing";
      this.phaseEndsAt = this.clock.now() + this.durationMs;
      for (const player of this.players.values()) this.stream.deal(player);
      this.timer = this.clock.setTimeout(() => this.expire(), this.durationMs);
      this.onChange();
    }, COUNTDOWN_MS);
    this.onChange();
  }

  private expire(): void {
    this.phase = "finishing";
    this.finishIfReady();
    this.onChange();
  }

  private finishIfReady(): void {
    if (this.phase === "finishing" && ![...this.players.values()].some((player) => player.bonus)) this.end();
  }

  end(): void {
    if (this.phase === "podium") return;
    this.dispose();
    this.phase = "podium";
    this.onFinish(this);
    this.onChange();
  }

  dispose(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    for (const player of this.players.values()) this.clearBonus(player);
  }

  private clearBonus(player: GiftPlayer): void {
    if (player.bonus) this.clock.clearTimeout(player.bonus.timer);
    player.bonus = null;
  }

  join(rawNickname: unknown, avatar?: AvatarChoice | null): GiftPlayer {
    if (this.phase === "podium" || this.phase === "finishing") throw new GameError("This game has finished accepting players");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), newPlayer);
    if (this.phase === "playing") this.stream.deal(player);
    this.onChange();
    return player;
  }

  byToken(token: unknown): GiftPlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(id: string, connected: boolean): void {
    const player = this.players.get(id);
    if (!player || player.connected === connected) return;
    player.connected = connected;
    this.onChange();
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
    if (!player || player.bonus || this.phase !== "playing" || this.clock.now() >= this.phaseEndsAt) return false;
    const correct = this.stream.answer(player, seq, answer);
    if (correct === null) return false;
    if (correct && player.correct % GIFT_CORRECT_TO_PLAY === 0) this.earnBonus(player);
    this.onActivity(id);
    return true;
  }

  private earnBonus(player: GiftPlayer): void {
    const start = player.readyAt + GIFT_READY_MS;
    const endsAt = start + GIFT_ROUND_MS;
    const round = ++player.rounds;
    player.bonus = {
      start,
      endsAt,
      multiplier: this.multiplier(),
      items: launchSchedule(round, this.rng),
      hits: new Map(),
      power: null,
      timer: this.clock.setTimeout(() => {
        this.clearBonus(player);
        this.finishIfReady();
        if (this.phase !== "podium") this.onActivity(player.id);
      }, endsAt - this.clock.now()),
    };
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

  private remainingMs(): number {
    if (this.phase === "finishing" || this.phase === "podium") return 0;
    return Math.max(0, this.phaseEndsAt - this.clock.now());
  }

  private multiplier(): number {
    if (this.phase === "countdown") return 1;
    return giftMultiplier(this.durationMs - this.remainingMs(), this.durationMs);
  }

  hostView(): HostGiftState {
    const standings = this.standings();
    const final = this.phase === "podium";
    const value = final ? Math.max(0, ...standings.map((player) => player.correct)) : 0;
    return {
      kind: "gift",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.quiz.questions.length },
      remainingMs: this.remainingMs(),
      standings,
      mostCorrect: value ? { value, nicknames: standings.filter((player) => player.correct === value).map((player) => player.nickname) } : null,
      errors: final ? this.stream.errors() : [],
    };
  }

  playerView(id: string): PlayerGiftView | null {
    const player = this.players.get(id);
    if (!player) return null;
    const bonus = player.bonus;
    return {
      kind: "gift",
      phase: this.phase,
      remainingMs: this.remainingMs(),
      score: player.score,
      correct: player.correct,
      progress: bonus ? GIFT_CORRECT_TO_PLAY : player.correct % GIFT_CORRECT_TO_PLAY,
      rank: this.phase === "podium" ? this.standings().find((standing) => standing.id === id)!.rank : null,
      question: this.phase === "playing" && !bonus ? this.stream.questionView(player) : null,
      feedback: this.phase === "playing" || bonus ? this.stream.feedbackView(player) : null,
      bonus: bonus ? {
        round: player.rounds,
        remainingMs: Math.max(0, bonus.endsAt - this.clock.now()),
        multiplier: bonus.multiplier,
        items: bonus.items,
        hits: [...bonus.hits.values()],
        power: bonus.power,
      } : null,
    };
  }
}

export function buildGiftResultsCsv(game: GiftGame): string {
  const header = ["Rank", "Nickname", "Score", "Correct", "Wrong", "Bonus rounds earned", "Gift taps", "Dud taps", "Power-ups collected"];
  return toCsv([header, ...game.standings().map(({ id, rank }) => {
    const player = game.players.get(id)!;
    return [rank, player.nickname, player.score, player.correct, player.wrong, player.rounds, player.goodTaps, player.dudTaps, player.powerups];
  })]);
}

export const giftMode: ModeEntry<"gift"> = {
  name: MODE_NAMES.gift,
  defaultSettings: { minutes: GIFT_DEFAULT_MINUTES },
  readSettings(raw) {
    const minutes = Number(raw.minutes);
    if (!(GIFT_MINUTES as readonly number[]).includes(minutes)) throw new GameError("Unsupported game length");
    return { minutes };
  },
  start(lobby, ctx) {
    const game = GiftGame.fromLobby(lobby, handoffOptions(ctx), ctx.protect);
    return { game, log: `${this.name} started with ${game.players.size} player(s), ${game.minutes} min` };
  },
  pacing: null,
  teams: () => null,
  lobbyBanner: false,
  resultsCsv: buildGiftResultsCsv,
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
