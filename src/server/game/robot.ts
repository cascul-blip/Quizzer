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
  type HostRobotState,
  type PlayerRobotView,
  type RobotAttack,
  type RobotAwards,
  type RobotDir,
  type RobotPhase,
  type RobotStanding,
} from "../../shared/protocol.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { GameError, realClock, shuffle, type Clock } from "./common.ts";
import type { Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { QuestionStream, newStreamPlayer, type StreamPlayer } from "./stream.ts";

export { FEEDBACK_MS } from "./stream.ts";

export const COUNTDOWN_MS = 3000;
const TILES = ROBOT_BOARD * ROBOT_BOARD;
const STEP: Record<RobotDir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export interface RobotPlayer extends BasePlayer, StreamPlayer {
  x: number;
  y: number;
  lives: number;
  /** Round this player lost their last life in, or null while still in the game. */
  outRound: number | null;
  /** Movement points to spend this round. */
  points: number;
  moves: number;
  /** Laser hits taken. */
  hits: number;
}

export interface RobotOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: RobotGame) => void;
}

export interface RobotGameSettings {
  shuffleAnswers: boolean;
  /** Longer waits for wrong answers in a row (the lobby's "Protect from abuse"). */
  protect?: boolean;
}

const tileOf = (x: number, y: number) => y * ROBOT_BOARD + x;
const tileXY = (i: number) => ({ x: i % ROBOT_BOARD, y: Math.floor(i / ROBOT_BOARD) });

/**
 * Pick a tile as far as possible from the taken ones (Chebyshev distance),
 * among `allowed` tiles; ties go to the earliest tile in the shuffled order.
 * Once every tile is taken, the least crowded tile wins.
 */
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

/** Robot Attack: answer questions for movement points, then dodge the robot's lasers. Last one standing wins. */
export class RobotGame {
  readonly kind = "robot";
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly roster = new Roster<RobotPlayer>();
  readonly startedAt = new Date();
  phase: RobotPhase = "countdown";
  round = 0;
  /** Laser attacks fired so far. */
  attacks = 0;
  phaseEndsAt = 0;
  phaseDurationMs = COUNTDOWN_MS;
  marked = new Set<number>();
  /** Rings of tiles destroyed so far. */
  inset = 0;
  /** The ring being destroyed this round; set with the targets, kept through the attack. */
  collapsing = new Set<number>();
  lastAttack: RobotAttack | null = null;

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream;
  private timer: unknown = null;
  private warnTimer: unknown = null;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: RobotGame) => void;

  constructor(quiz: Quiz, settings: RobotGameSettings, opts: RobotOptions = {}) {
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

  /** Take over a lobby's players (same ids and tokens), spread out across the board. */
  static fromLobby(lobby: Game, opts: RobotOptions = {}): RobotGame {
    const game = new RobotGame(lobby.quiz, { shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect }, opts);
    for (const p of lobby.players.values()) {
      game.roster.adopt(game.newPlayer({ id: p.id, nickname: p.nickname, token: p.token, connected: p.connected, avatar: p.avatar }));
    }
    return game;
  }

  get players(): Map<string, RobotPlayer> {
    return this.roster.players;
  }

  private alive(): RobotPlayer[] {
    return [...this.players.values()].filter((p) => p.outRound === null);
  }

  private newPlayer(base: BasePlayer): RobotPlayer {
    // Late joiners stay off the red Xs while there's no chance left to earn a way off them, and never start on a collapsing tile.
    const lateInDanger = this.phase === "move" || this.phase === "attack";
    const tile = spreadTile(this.alive(), this.shuffledTiles(), (i) => !this.collapsing.has(i) && !(lateInDanger && this.marked.has(i)));
    const { x, y } = tileXY(tile);
    if (this.phase === "quiz" && this.marked.size > 0) this.marked.add(tile);
    return { ...base, ...newStreamPlayer(), x, y, lives: ROBOT_LIVES, outRound: null, points: 0, moves: 0, hits: 0 };
  }

  /** The tiles still on the board. */
  private playableTiles(): number[] {
    return Array.from({ length: TILES }, (_, i) => i).filter((i) => robotRing(i) >= this.inset);
  }

  private shuffledTiles(): number[] {
    return shuffle(this.playableTiles(), this.rng);
  }

  // ---------- lifecycle ----------

  start(): void {
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    this.setPhase("countdown", COUNTDOWN_MS, () => this.beginRound());
    this.onChange();
  }

  private setPhase(phase: RobotPhase, ms: number, then: () => void): void {
    this.phase = phase;
    this.phaseDurationMs = ms;
    this.phaseEndsAt = this.clock.now() + ms;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      then();
    }, ms);
  }

  private beginRound(): void {
    this.round++;
    this.marked = new Set();
    this.collapsing = new Set();
    const ms = robotQuizMs(this.round);
    this.setPhase("quiz", ms, () => this.beginMove());
    for (const p of this.players.values()) if (!p.current) this.stream.deal(p);
    if (ms <= ROBOT_WARN_MS) this.markTargets();
    else this.warnTimer = this.clock.setTimeout(() => this.markTargets(), ms - ROBOT_WARN_MS);
    this.onChange();
  }

  /**
   * The robot picks its targets: a random 3/4 of the board plus every tile someone stands on.
   * Every ROBOT_SHRINK_EVERY rounds the outer ring goes too, and the 3/4 is of the board left inside it.
   * Occupied tiles count toward the 3/4 first, so a quarter of the board stays safe however small it gets.
   */
  private markTargets(): void {
    this.warnTimer = null;
    if (this.phase !== "quiz") return;
    const shrink = this.round % ROBOT_SHRINK_EVERY === 0 && ROBOT_BOARD - 2 * this.inset > ROBOT_MIN_BOARD;
    this.collapsing = new Set(shrink ? this.playableTiles().filter((i) => robotRing(i) === this.inset) : []);
    const occupied = new Set(this.alive().map((p) => tileOf(p.x, p.y)));
    const staying = this.shuffledTiles().filter((i) => !this.collapsing.has(i));
    const count = Math.round(staying.length * ROBOT_HAZARD_FRACTION);
    const free = staying.filter((i) => !occupied.has(i));
    const inside = staying.filter((i) => occupied.has(i)).length;
    this.marked = new Set([...occupied, ...this.collapsing, ...free.slice(0, Math.max(0, count - inside))]);
    this.onChange();
  }

  private beginMove(): void {
    if (this.marked.size === 0) this.markTargets();
    this.setPhase("move", ROBOT_MOVE_MS, () => this.fire());
    this.onChange();
  }

  /** Lasers hit every marked tile: anyone standing on one loses a life. */
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
    this.setPhase("attack", ROBOT_ATTACK_MS, () => (this.isOver() ? this.finish() : this.beginRound()));
    this.onChange();
  }

  /** Their tile is gone: put the player on the closest free tile (in steps), or the least crowded one once the board is full. */
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

  /** Last one standing: a solo game runs until its player is out. */
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
    this.clearTimers();
    this.phase = "podium";
    this.phaseEndsAt = 0;
    this.phaseDurationMs = 0;
    this.marked = new Set();
    this.collapsing = new Set();
    this.onFinish(this);
    this.onChange();
  }

  dispose(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    if (this.warnTimer !== null) this.clock.clearTimeout(this.warnTimer);
    this.timer = null;
    this.warnTimer = null;
  }

  // ---------- players ----------

  join(rawNickname: unknown, avatar?: AvatarChoice | null): RobotPlayer {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base));
    if (this.phase !== "countdown") this.stream.deal(player);
    this.onChange();
    return player;
  }

  byToken(token: unknown): RobotPlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.onChange();
  }

  kick(playerId: string): RobotPlayer | null {
    const p = this.roster.remove(playerId);
    if (p) this.onChange();
    return p;
  }

  // ---------- actions ----------

  /** Answer during the quiz phase; a correct answer earns a movement point (players still in the game only). */
  answer(playerId: string, seq: number, option: number): boolean {
    const p = this.players.get(playerId);
    if (!p || !p.current || this.phase !== "quiz") return false;
    const correct = this.stream.answer(p, seq, option);
    if (correct === null) return false;
    if (correct && p.outRound === null) p.points++;
    this.onActivity(p.id);
    return true;
  }

  /** Step one tile for one point, unless the edge or another player in the game is in the way. Returns whether the move was made. */
  move(playerId: string, dir: RobotDir): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "move" || p.outRound !== null || p.points <= 0 || !ROBOT_DIRS.includes(dir)) return false;
    const [dx, dy] = STEP[dir];
    const x = p.x + dx;
    const y = p.y + dy;
    if (!robotInBounds(x, y, this.inset)) return false;
    // One player per tile: others can block the way to a safe spot.
    if (this.alive().some((o) => o !== p && o.x === x && o.y === y)) return false;
    p.x = x;
    p.y = y;
    p.points--;
    p.moves++;
    this.onActivity(p.id);
    return true;
  }

  // ---------- results ----------

  /** Survivors first, then the latest knocked out; lives break ties. Equal standing shares a rank, ordered by correct answers. */
  standings(): RobotStanding[] {
    const key = (p: RobotPlayer) => (p.outRound ?? 1e6) * 10 + p.lives;
    const sorted = [...this.players.values()].sort((a, b) => key(b) - key(a) || b.correct - a.correct);
    let rank = 0;
    let prev: number | null = null;
    return sorted.map((p, i) => {
      if (key(p) !== prev) {
        rank = i + 1;
        prev = key(p);
      }
      return { id: p.id, nickname: p.nickname, avatar: p.avatar, rank, lives: p.lives, outRound: p.outRound, correct: p.correct };
    });
  }

  awards(): RobotAwards {
    const best = (value: (p: RobotPlayer) => number) => {
      const players = [...this.players.values()];
      const top = Math.max(0, ...players.map(value));
      return top > 0 ? { value: top, nicknames: players.filter((p) => value(p) === top).map((p) => p.nickname) } : null;
    };
    return { mostCorrect: best((p) => p.correct), mostMoves: best((p) => p.moves) };
  }

  // ---------- views ----------

  private remainingMs(): number {
    return this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.clock.now()) : 0;
  }

  hostView(): HostRobotState {
    const podium = this.phase === "podium";
    return {
      kind: "robot",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      round: this.round,
      phaseRemainingMs: this.remainingMs(),
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
      awards: podium ? this.awards() : null,
      errors: podium ? this.stream.errors() : null,
      hasResults: podium,
    };
  }

  playerView(playerId: string): PlayerRobotView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const onBoard = this.phase === "move" || this.phase === "attack";
    const a = this.lastAttack;
    let result: PlayerRobotView["result"] = null;
    if (this.phase === "podium") {
      const standings = this.standings();
      const mine = standings.find((s) => s.id === p.id)!;
      const aw = this.awards();
      result = {
        rank: mine.rank,
        playerCount: standings.length,
        won: mine.rank === 1,
        outRound: p.outRound,
        awards: [
          ...(aw.mostCorrect?.nicknames.includes(p.nickname) ? ["Most correct answers"] : []),
          ...(aw.mostMoves?.nicknames.includes(p.nickname) ? ["Fancy footwork"] : []),
        ],
      };
    }
    return {
      kind: "robot",
      phase: this.phase,
      title: this.title,
      round: this.round,
      phaseRemainingMs: this.remainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, lives: p.lives, out: p.outRound !== null, points: p.points, correct: p.correct, x: p.x, y: p.y },
      question: this.phase === "quiz" ? this.stream.questionView(p) : null,
      feedback: this.stream.feedbackView(p),
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
