import type { AnswerValue } from "../../shared/answer-match.ts";
import { answerOf } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type { HostRobotState, PlayerRobotView, RobotAttack, RobotAwardKey, RobotDir, RobotPhase, RobotStanding } from "../../shared/modes/robot.ts";
import {
  ROBOT_ATTACK_MS,
  ROBOT_BOARD,
  ROBOT_DIRS,
  ROBOT_HAZARD_FRACTION,
  ROBOT_LIVES,
  ROBOT_MIN_BOARD,
  ROBOT_MOVE_MS,
  ROBOT_SHRINK_EVERY,
  ROBOT_WARN_MS,
  robotInBounds,
  robotQuizMs,
  robotRing,
  robotShared,
} from "../../shared/modes/robot.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { GameError, shuffle } from "./common.ts";
import type { LobbyChoices, LobbyFacts } from "./lobby-facts.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, unhandled } from "./mode-entry.ts";
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
const ROBOT_AWARD_VALUES: Record<RobotAwardKey, (p: RobotPlayer) => number> = { mostCorrect: (p) => p.correct, mostMoves: (p) => p.moves };
const TILES = ROBOT_BOARD * ROBOT_BOARD;
const STEP: Record<RobotDir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export interface RobotPlayer extends BasePlayer, AnswerTotals {
  x: number;
  y: number;
  lives: number;
  outRound: number | null;
  points: number;
  moves: number;
  hits: number;
}

interface RobotOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: RobotGame) => void;
}

interface RobotGameSettings {
  shuffleAnswers: boolean;
  /** why: the lobby's "Protect from abuse" setting: longer waits for wrong answers in a row. */
  protect?: boolean;
}

const tileOf = (x: number, y: number) => y * ROBOT_BOARD + x;
const tileXY = (i: number) => ({ x: i % ROBOT_BOARD, y: Math.floor(i / ROBOT_BOARD) });

/** why: Chebyshev distance; ties go to the earliest tile in `order`, and once every tile is taken the least crowded wins. */
export function spreadTile(taken: { x: number; y: number }[], order: number[], allowed: (i: number) => boolean = () => true): number {
  let best = -1;
  let bestScore = -Infinity;
  for (const i of order) {
    if (!allowed(i)) continue;
    const { x, y } = tileXY(i);
    let near = Infinity;
    let crowd = 0;
    for (const t of taken) {
      const d = Math.max(Math.abs(t.x - x), Math.abs(t.y - y));
      if (d < near) near = d;
      if (d === 0) crowd++;
    }
    const score = near === Infinity ? 0 : near > 0 ? near : -crowd;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best === -1 ? order[0]! : best;
}

export class RobotGame {
  readonly runningMode = "robot" as const;
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  round = 0;
  attacks = 0;
  marked = new Set<number>();
  inset = 0;
  /** why: set with the targets and kept through the attack. */
  collapsing = new Set<number>();
  lastAttack: RobotAttack | null = null;

  private readonly session: StreamedSession<RobotPlayer, RobotPhase, Podium<RobotPlayer, RobotPlayer, RobotAwardKey>>;

  constructor(quiz: Quiz, settings: RobotGameSettings, opts: RobotOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.session = new StreamedSession({
      questions: quiz.questions,
      shuffleAnswers: settings.shuffleAnswers,
      protect: settings.protect,
      clock: opts.clock,
      rng: opts.rng,
      countdownMs: COUNTDOWN_MS,
      inPlay: (phase) => phase !== "countdown",
      // why: only in the quiz phase, so a wrong-answer wait never covers the arrows in the move phase.
      canAnswer: () => this.phase === "quiz",
      cleanup: () => {
        this.marked = new Set();
        this.collapsing = new Set();
      },
      podium: { build: () => this.buildPodium(), empty: () => emptyPodium(robotShared.awards) },
      hub: { onChange: opts.onChange, onActivity: opts.onActivity, onFinish: () => opts.onFinish?.(this) },
    });
  }

  get choices(): LobbyChoices {
    return this.session.choices;
  }

  static fromLobby(lobby: LobbyFacts<"robot">, opts: RobotOptions = {}): RobotGame {
    const game = new RobotGame(lobby.quiz, { shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect }, opts);
    game.session.adoptLobby(lobby, (base) => game.newPlayer(base));
    return game;
  }

  get phase(): RobotPhase {
    return this.session.phase;
  }

  get phaseEndsAt(): number {
    return this.session.phases.endsAt;
  }

  get phaseDurationMs(): number {
    return this.session.phases.durationMs;
  }

  get players(): Map<string, RobotPlayer> {
    return this.session.players;
  }

  private alive(): RobotPlayer[] {
    return [...this.players.values()].filter((p) => p.outRound === null);
  }

  private newPlayer(base: BasePlayer): Omit<RobotPlayer, keyof AnswerTotals> {
    // why: late joiners can't earn a way off the red Xs any more, and must never start on a collapsing tile.
    const lateInDanger = this.phase === "move" || this.phase === "attack";
    const tile = spreadTile(this.alive(), this.shuffledTiles(), (i) => !this.collapsing.has(i) && !(lateInDanger && this.marked.has(i)));
    const { x, y } = tileXY(tile);
    if (this.phase === "quiz" && this.marked.size > 0) this.marked.add(tile);
    return { ...base, x, y, lives: ROBOT_LIVES, outRound: null, points: 0, moves: 0, hits: 0 };
  }

  private playableTiles(): number[] {
    return Array.from({ length: TILES }, (_, i) => i).filter((i) => robotRing(i) >= this.inset);
  }

  private shuffledTiles(): number[] {
    return shuffle(this.playableTiles(), this.session.rng);
  }

  start(): void {
    this.session.start(() => this.beginRound());
  }

  private beginRound(): void {
    this.round++;
    this.marked = new Set();
    this.collapsing = new Set();
    const ms = robotQuizMs(this.round);
    this.session.phases.set("quiz", ms, () => this.beginMove());
    for (const p of this.players.values()) this.session.stream.open(p);
    if (ms <= ROBOT_WARN_MS) this.markTargets();
    else this.session.phases.after("warn", ms - ROBOT_WARN_MS, () => this.markTargets());
    this.session.changed();
  }

  /** why: occupied tiles count toward the 3/4 first, so a quarter of the board stays safe however small it shrinks. */
  private markTargets(): void {
    this.session.phases.cancel("warn");
    if (this.phase !== "quiz") return;
    const shrink = this.round % ROBOT_SHRINK_EVERY === 0 && ROBOT_BOARD - 2 * this.inset > ROBOT_MIN_BOARD;
    this.collapsing = new Set(shrink ? this.playableTiles().filter((i) => robotRing(i) === this.inset) : []);
    const occupied = new Set(this.alive().map((p) => tileOf(p.x, p.y)));
    const staying = this.shuffledTiles().filter((i) => !this.collapsing.has(i));
    const count = Math.round(staying.length * ROBOT_HAZARD_FRACTION);
    const free = staying.filter((i) => !occupied.has(i));
    const inside = staying.filter((i) => occupied.has(i)).length;
    this.marked = new Set([...occupied, ...this.collapsing, ...free.slice(0, Math.max(0, count - inside))]);
    this.session.changed();
  }

  private beginMove(): void {
    if (this.marked.size === 0) this.markTargets();
    this.session.phases.set("move", ROBOT_MOVE_MS, () => this.fire());
    this.session.changed();
  }

  private fire(): void {
    this.attacks++;
    const hit: string[] = [];
    const eliminated: string[] = [];
    for (const p of this.players.values()) {
      p.points = 0;
      if (p.outRound !== null || !this.marked.has(tileOf(p.x, p.y))) continue;
      p.lives--;
      p.hits++;
      hit.push(p.id);
      if (p.lives <= 0) {
        p.lives = 0;
        p.outRound = this.round;
        eliminated.push(p.id);
      }
    }
    if (this.collapsing.size > 0) {
      this.inset++;
      for (const p of this.alive()) if (!robotInBounds(p.x, p.y, this.inset)) this.relocate(p);
    }
    this.lastAttack = { seq: this.attacks, round: this.round, hit, eliminated };
    this.session.phases.set("attack", ROBOT_ATTACK_MS, () => (this.isOver() ? this.session.end() : this.beginRound()));
    this.session.changed();
  }

  /** why: closest free tile in steps; the least crowded one once the board is full. */
  private relocate(p: RobotPlayer): void {
    const others = this.alive().filter((o) => o !== p);
    let best = -1;
    let bestCrowd = Infinity;
    let bestDist = Infinity;
    for (const i of this.playableTiles()) {
      const { x, y } = tileXY(i);
      const crowd = others.filter((o) => o.x === x && o.y === y).length;
      const dist = Math.abs(x - p.x) + Math.abs(y - p.y);
      if (crowd < bestCrowd || (crowd === bestCrowd && dist < bestDist)) {
        best = i;
        bestCrowd = crowd;
        bestDist = dist;
      }
    }
    const to = tileXY(best);
    p.x = to.x;
    p.y = to.y;
  }

  /** why: a solo game runs until its player is out. */
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

  join(rawNickname: unknown, avatar?: AvatarChoice | null): RobotPlayer {
    const player = this.session.addPlayer(rawNickname, avatar, (base) => this.newPlayer(base));
    this.session.changed();
    return player;
  }

  byToken(token: unknown): RobotPlayer | null {
    return this.session.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    this.session.setConnected(playerId, connected);
  }

  kick(playerId: string): RobotPlayer | null {
    const p = this.session.removePlayer(playerId);
    if (p) this.session.changed();
    return p;
  }

  answer(playerId: string, seq: number, option: AnswerValue): boolean {
    const answered = this.session.answer(playerId, seq, option);
    if (!answered) return false;
    const { player: p, correct } = answered;
    if (correct && p.outRound === null) p.points++;
    this.session.activity(p.id);
    return true;
  }

  move(playerId: string, dir: RobotDir): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "move" || p.outRound !== null || p.points <= 0 || !ROBOT_DIRS.includes(dir)) return false;
    const [dx, dy] = STEP[dir];
    const x = p.x + dx;
    const y = p.y + dy;
    if (!robotInBounds(x, y, this.inset)) return false;
    // why: one player per tile, so others can block the way to a safe spot.
    if (this.alive().some((o) => o !== p && o.x === x && o.y === y)) return false;
    p.x = x;
    p.y = y;
    p.points--;
    p.moves++;
    this.session.activity(p.id);
    return true;
  }

  /** why: survivors first, then the latest knocked out; lives break ties, correct answers order within a shared place. */
  private buildPodium(): Podium<RobotPlayer, RobotPlayer, RobotAwardKey> {
    const players = [...this.players.values()];
    return buildPodium({
      entries: players,
      order: [most((p) => p.outRound ?? Infinity), most((p) => p.lives)],
      then: [most((p) => p.correct)],
      players,
      entryOf: (p) => p,
      awards: { labels: robotShared.awards, values: ROBOT_AWARD_VALUES },
    });
  }

  get podium(): Podium<RobotPlayer, RobotPlayer, RobotAwardKey> {
    return this.session.podium;
  }

  private standings(): RobotStanding[] {
    return this.podium.places.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      rank: p.place,
      lives: p.lives,
      outRound: p.outRound,
      correct: p.correct,
    }));
  }

  hostView(): HostRobotState {
    const podium = this.phase === "podium";
    return {
      kind: "robot",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      round: this.round,
      phaseRemainingMs: this.session.phases.remainingMs(),
      phaseDurationMs: this.phaseDurationMs,
      marked: [...this.marked].sort((a, b) => a - b),
      inset: this.inset,
      collapsing: [...this.collapsing].sort((a, b) => a - b),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        connected: p.connected,
        x: p.x,
        y: p.y,
        lives: p.lives,
        out: p.outRound !== null,
        points: p.points,
      })),
      lastAttack: this.lastAttack,
      playerCount: this.players.size,
      standings: podium ? this.standings() : null,
      awards: podium ? this.podium.awards : null,
      errors: this.session.stream.errorsWhen(podium),
    };
  }

  playerView(playerId: string): PlayerRobotView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const onBoard = this.phase === "move" || this.phase === "attack";
    const a = this.lastAttack;
    let result: PlayerRobotView["result"] = null;
    if (this.phase === "podium") {
      const mine = this.podium.result(p.id);
      result = mine && { rank: mine.place, playerCount: mine.playerCount, won: mine.place === 1, outRound: p.outRound, awards: mine.awards };
    }
    return {
      kind: "robot",
      phase: this.phase,
      title: this.title,
      round: this.round,
      phaseRemainingMs: this.session.phases.remainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, lives: p.lives, out: p.outRound !== null, points: p.points, correct: p.correct, x: p.x, y: p.y },
      ...this.session.stream.fragment(p),
      board: onBoard
        ? {
            marked: [...this.marked].sort((x, y) => x - y),
            inset: this.inset,
            collapsing: [...this.collapsing].sort((x, y) => x - y),
            others: this.alive()
              .filter((o) => o.id !== p.id)
              .map((o) => ({ x: o.x, y: o.y })),
          }
        : null,
      lastAttack: a ? { seq: a.seq, hit: a.hit.includes(p.id), eliminated: a.eliminated.includes(p.id) } : null,
      result,
    };
  }
}

function robotColumns(game: RobotGame): Column<{ rank: number; p: RobotPlayer }>[] {
  return [
    { header: "Rank", value: (r) => r.rank },
    { header: "Nickname", value: (r) => r.p.nickname },
    { header: "Status", value: (r) => (r.rank === 1 ? "Winner" : r.p.outRound === null ? "Survived" : `Out in round ${r.p.outRound}`) },
    { header: "Lives left", value: (r) => r.p.lives },
    { header: "Rounds survived", value: (r) => (r.p.outRound === null ? game.attacks : r.p.outRound - 1) },
    { header: "Correct", value: (r) => r.p.correct },
    { header: "Wrong", value: (r) => r.p.wrong },
    { header: "Accuracy %", value: (r) => accuracy(r.p) },
    { header: "Moves", value: (r) => r.p.moves },
    { header: "Laser hits", value: (r) => r.p.hits },
  ];
}

export function buildRobotResults(game: RobotGame): ResultsSheet {
  return sheet(
    robotColumns(game),
    game.podium.rows.map((r) => ({ rank: r.place, p: r.player })),
  );
}

export const robotMode: ModeEntry<"robot"> = {
  ...robotShared,
  defaultSettings: {},
  readSettings: () => ({}),
  start(lobby, ctx) {
    const game = RobotGame.fromLobby(lobby, handoffOptions(ctx));
    return { game, log: `${this.name} started with ${game.players.size} player(s)` };
  },
  pacing: null,
  teams: () => null,
  results: buildRobotResults,
  handle(game, playerId, msg) {
    switch (msg.type) {
      case "robot.answer":
        return game.answer(playerId, Number(msg.seq), answerOf(msg)) ? undefined : "resend";
      case "robot.move":
        return game.move(playerId, msg.dir) ? undefined : "resend";
      default:
        return unhandled(msg);
    }
  },
};
