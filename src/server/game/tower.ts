import {
  BLOCKS_PER_BUILD,
  DROP_ZONES,
  EGG_LEVELS_ABOVE,
  MONSTER_DAMAGE,
  type MonsterAttack,
  type MonsterEggs,
  type HostTowerState,
  type PlayerTowerView,
  type TowerAwards,
  type TowerPhase,
  type TowerSettings,
} from "../../shared/protocol.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { GameError, assignTeams, realClock, teamInfo, type Clock } from "./common.ts";
import type { Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { QuestionStream, newStreamPlayer, type StreamPlayer } from "./stream.ts";

export { FEEDBACK_MS } from "./stream.ts";

export const COUNTDOWN_MS = 3000;
export const SWEEP_START_MS = 2500;
export const SWEEP_MIN_MS = 1200;
/** The sliding block speeds up by this much per completed floor. */
export const SWEEP_STEP_MS = 130;
export const DROP_COOLDOWN_MS = 400;
/** Egg announcements, as fractions of the game length. */
export const MONSTER_AT = [1 / 3, 2 / 3] as const;

export interface TowerTeam {
  index: number;
  name: string;
  color: string;
  /** Blocks stacked in the left, center and right columns. */
  columns: [number, number, number];
}

export const floorsOf = (t: TowerTeam) => Math.min(...t.columns);
export const placedOf = (t: TowerTeam) => t.columns[0] + t.columns[1] + t.columns[2];
export const sweepMsFor = (floors: number) => Math.max(SWEEP_MIN_MS, SWEEP_START_MS - floors * SWEEP_STEP_MS);

export interface TowerPlayer extends BasePlayer, StreamPlayer {
  team: number;
  blocksHeld: number;
  placed: number;
  missed: number;
  /** Monster eggs this player hatched. */
  hatched: number;
  state: "question" | "build";
  lastDropAt: number;
}

export interface TowerOptions {
  clock?: Clock;
  rng?: () => number;
  /** Something everyone may care about changed (phase, roster): push to every screen now. */
  onChange?: () => void;
  /** Only this player's state changed, plus team/host totals: push to them now, others soon. */
  onActivity?: (playerId: string) => void;
  onFinish?: (game: TowerGame) => void;
}

export interface TowerGameSettings extends TowerSettings {
  /** Shuffle answer positions per player (the lobby's "Shuffle answer positions"). */
  shuffleAnswers: boolean;
}

/** Tallest Tower: teams answer at their own pace; every 4 correct answers are dropped onto the team tower. */
export class TowerGame {
  readonly kind = "tower";
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly teams: TowerTeam[];
  readonly settings: TowerGameSettings;
  readonly roster = new Roster<TowerPlayer>();
  readonly startedAt = new Date();
  phase: TowerPhase = "countdown";
  /** When the current phase's countdown ends. */
  phaseEndsAt = 0;
  dropCount = 0;
  egg: MonsterEggs | null = null;
  lastAttack: MonsterAttack | null = null;
  private monsterSeq = 0;
  private lastMonsterEvent: { seq: number; kind: "egg" | "attack" } | null = null;
  /** Absolute clock times of the egg announcements still to come. */
  private monsterAt: number[] = [];
  private monsterTimers: unknown[] = [];

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream;
  private timer: unknown = null;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: TowerGame) => void;

  constructor(quiz: Quiz, settings: TowerGameSettings, opts: TowerOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.settings = settings;
    this.teams = Array.from({ length: settings.teams }, (_, i) => ({ ...teamInfo(i), columns: [0, 0, 0] }));
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    this.stream = new QuestionStream(quiz.questions, settings.shuffleAnswers, this.rng, this.clock);
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  /** Take over a lobby's players (same ids and tokens), assigned to teams by join order. */
  static fromLobby(lobby: Game, opts: TowerOptions = {}): TowerGame {
    const game = new TowerGame(lobby.quiz, { ...lobby.tower, shuffleAnswers: lobby.shuffle.answers }, opts);
    const players = [...lobby.players.values()];
    const teams = assignTeams(players.length, lobby.tower.teams);
    players.forEach((p, i) => {
      game.roster.adopt(game.newPlayer({ id: p.id, nickname: p.nickname, token: p.token, connected: p.connected, avatar: p.avatar }, teams[i]!));
    });
    return game;
  }

  get players(): Map<string, TowerPlayer> {
    return this.roster.players;
  }

  private newPlayer(base: BasePlayer, team: number): TowerPlayer {
    return {
      ...base,
      team,
      ...newStreamPlayer(),
      blocksHeld: 0,
      placed: 0,
      missed: 0,
      hatched: 0,
      state: "question",
      lastDropAt: -Infinity,
    };
  }

  // ---------- lifecycle ----------

  start(): void {
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    this.phase = "countdown";
    this.phaseEndsAt = this.clock.now() + COUNTDOWN_MS;
    this.timer = this.clock.setTimeout(() => this.beginPlaying(), COUNTDOWN_MS);
    this.onChange();
  }

  private beginPlaying(): void {
    if (this.phase !== "countdown") return;
    const ms = this.settings.minutes * 60_000;
    this.phase = "playing";
    this.phaseEndsAt = this.clock.now() + ms;
    for (const p of this.players.values()) if (!p.current) this.deal(p);
    this.timer = this.clock.setTimeout(() => this.finish(), ms);
    if (this.monsterEnabled) {
      for (const frac of MONSTER_AT) {
        const delay = Math.round(ms * frac);
        this.monsterAt.push(this.clock.now() + delay);
        this.monsterTimers.push(this.clock.setTimeout(() => this.announceMonster(), delay));
      }
    }
    this.onChange();
  }

  /** The monster needs another team to attack. */
  get monsterEnabled(): boolean {
    return this.settings.monster && this.teams.length >= 2;
  }

  // ---------- monster ----------

  /**
   * Give every tower its own egg, EGG_LEVELS_ABOVE levels above its highest
   * complete floor (10 floors → level 14), in a random column where that cell
   * is still empty.
   */
  private announceMonster(): void {
    this.monsterAt.shift();
    if (this.phase !== "playing") return;
    if (!this.egg) {
      const seq = ++this.monsterSeq;
      const cells = this.teams.map((t) => {
        const row = floorsOf(t) + EGG_LEVELS_ABOVE - 1;
        // A column is free if it hasn't been stacked up to that row yet (the shortest column always is).
        const free = [0, 1, 2].filter((c) => t.columns[c]! <= row);
        return { col: free[Math.min(free.length - 1, Math.floor(this.rng() * free.length))]!, row };
      });
      this.egg = { seq, cells };
      this.lastMonsterEvent = { seq, kind: "egg" };
    }
    this.onChange();
  }

  /** The first block on the egg hatches it: the monster smashes the tallest other tower. */
  private hatch(p: TowerPlayer, team: TowerTeam): void {
    const target = this.rankedTeams().find((t) => t.index !== team.index);
    this.egg = null;
    p.hatched++;
    if (!target) return;
    const victim = this.teams[target.index]!;
    const before = [...victim.columns];
    const cap = Math.max(0, floorsOf(victim) - MONSTER_DAMAGE);
    victim.columns = victim.columns.map((h) => Math.min(h, cap)) as TowerTeam["columns"];
    this.lastAttack = { seq: ++this.monsterSeq, byTeam: team.index, byNickname: p.nickname, target: victim.index, before, after: [...victim.columns] };
    this.lastMonsterEvent = { seq: this.lastAttack.seq, kind: "attack" };
    this.onChange();
  }

  private clearMonsterTimers(): void {
    for (const t of this.monsterTimers) this.clock.clearTimeout(t);
    this.monsterTimers = [];
    this.monsterAt = [];
  }

  end(): void {
    this.finish();
  }

  private finish(): void {
    if (this.phase === "podium") return;
    this.clearTimer();
    this.clearMonsterTimers();
    this.egg = null;
    this.phase = "podium";
    this.phaseEndsAt = 0;
    this.onFinish(this);
    this.onChange();
  }

  dispose(): void {
    this.clearTimer();
    this.clearMonsterTimers();
  }

  private clearTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  // ---------- players ----------

  join(rawNickname: unknown, avatar?: AvatarChoice | null): TowerPlayer {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base, this.smallestTeam()));
    if (this.phase === "playing") this.deal(player);
    this.onChange();
    return player;
  }

  private smallestTeam(): number {
    const sizes = this.teams.map(() => 0);
    for (const p of this.players.values()) sizes[p.team]!++;
    return sizes.indexOf(Math.min(...sizes));
  }

  byToken(token: unknown): TowerPlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.onChange();
  }

  kick(playerId: string): TowerPlayer | null {
    const p = this.roster.remove(playerId);
    if (p) this.onChange();
    return p;
  }

  // ---------- questions ----------

  private deal(p: TowerPlayer): void {
    this.stream.deal(p);
  }

  answer(playerId: string, seq: number, option: number): boolean {
    const p = this.players.get(playerId);
    const cur = p?.current;
    if (!p || !cur || this.phase !== "playing" || p.state !== "question") return false;
    const correct = this.stream.answer(p, seq, option);
    if (correct === null) return false;
    if (correct) p.blocksHeld++;
    if (p.blocksHeld >= BLOCKS_PER_BUILD) p.state = "build";
    this.onActivity(p.id);
    return true;
  }

  // ---------- building ----------

  /** Drop the player's next block into zone 0–4 (0 and 4 miss the tower). Returns whether it landed. */
  drop(playerId: string, zone: number): boolean | null {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "playing" || p.state !== "build" || p.blocksHeld <= 0) return null;
    if (!Number.isInteger(zone) || zone < 0 || zone >= DROP_ZONES) return null;
    const now = this.clock.now();
    if (now < p.readyAt || now - p.lastDropAt < DROP_COOLDOWN_MS) return null;
    p.lastDropAt = now;
    const team = this.teams[p.team]!;
    const landed = zone >= 1 && zone <= 3;
    if (landed) {
      team.columns[zone - 1]!++;
      p.placed++;
      const egg = this.egg?.cells[team.index];
      if (egg && egg.col === zone - 1 && team.columns[zone - 1] === egg.row + 1) this.hatch(p, team);
    } else {
      p.missed++;
    }
    p.blocksHeld--;
    if (p.blocksHeld === 0) {
      p.state = "question";
      p.readyAt = Math.max(p.readyAt, now);
    }
    this.dropCount++;
    this.onActivity(p.id);
    return landed;
  }

  // ---------- results ----------

  /** Teams by floors, then blocks placed; equal teams share a rank. */
  rankedTeams(): (TowerTeam & { rank: number; floors: number; placed: number })[] {
    const withTotals = this.teams.map((t) => ({ ...t, floors: floorsOf(t), placed: placedOf(t), rank: 0 }));
    const sorted = [...withTotals].sort((a, b) => b.floors - a.floors || b.placed - a.placed || a.index - b.index);
    sorted.forEach((t, i) => {
      const prev = sorted[i - 1];
      t.rank = prev && prev.floors === t.floors && prev.placed === t.placed ? prev.rank : i + 1;
    });
    return sorted;
  }

  awards(): TowerAwards {
    const best = (value: (p: TowerPlayer) => number) => {
      const players = [...this.players.values()];
      const top = Math.max(0, ...players.map(value));
      return top > 0 ? { value: top, nicknames: players.filter((p) => value(p) === top).map((p) => p.nickname) } : null;
    };
    return { mostCorrect: best((p) => p.correct), masterBuilder: best((p) => p.placed) };
  }

  // ---------- views ----------

  private remainingMs(): number {
    return this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.clock.now()) : 0;
  }

  hostView(): HostTowerState {
    const ranked = new Map(this.rankedTeams().map((t) => [t.index, t.rank]));
    const players = [...this.players.values()];
    return {
      kind: "tower",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      remainingMs: this.remainingMs(),
      teams: this.teams.map((t) => ({
        index: t.index,
        name: t.name,
        color: t.color,
        columns: [...t.columns],
        floors: floorsOf(t),
        placed: placedOf(t),
        rank: ranked.get(t.index)!,
        members: players
          .filter((p) => p.team === t.index)
          .map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, connected: p.connected, building: p.state === "build" && this.phase === "playing" })),
      })),
      playerCount: players.length,
      dropCount: this.dropCount,
      monster: this.monsterEnabled,
      egg: this.egg,
      lastAttack: this.lastAttack,
      nextMonsterMs: this.phase === "playing" && this.monsterAt.length ? Math.max(0, this.monsterAt[0]! - this.clock.now()) : null,
      awards: this.phase === "podium" ? this.awards() : null,
      errors: this.phase === "podium" ? this.stream.errors() : null,
      hasResults: this.phase === "podium",
    };
  }

  /** Egg news goes to everyone; an attack only to the hatching team and the team that got smashed. */
  private monsterEventFor(p: TowerPlayer): PlayerTowerView["monsterEvent"] {
    const ev = this.lastMonsterEvent;
    if (!ev) return null;
    if (ev.kind === "egg") return { seq: ev.seq, kind: "egg", byTeam: null, target: null };
    const a = this.lastAttack!;
    const names = { byTeam: this.teams[a.byTeam]!.name, target: this.teams[a.target]!.name };
    if (p.team === a.byTeam) return { seq: ev.seq, kind: "hatched", ...names };
    if (p.team === a.target) return { seq: ev.seq, kind: "smashed", ...names };
    return null;
  }

  playerView(playerId: string): PlayerTowerView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const team = this.teams[p.team]!;
    const playing = this.phase === "playing";
    let result: PlayerTowerView["result"] = null;
    if (this.phase === "podium") {
      const mine = this.rankedTeams().find((t) => t.index === p.team)!;
      const awards = this.awards();
      result = {
        teamRank: mine.rank,
        teamCount: this.teams.length,
        floors: mine.floors,
        placed: mine.placed,
        awards: [
          ...(awards.mostCorrect?.nicknames.includes(p.nickname) ? ["Most correct answers"] : []),
          ...(awards.masterBuilder?.nicknames.includes(p.nickname) ? ["Master builder"] : []),
        ],
      };
    }
    return {
      kind: "tower",
      phase: this.phase,
      title: this.title,
      remainingMs: this.remainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, placed: p.placed },
      team: teamInfo(team.index),
      state: p.state,
      blocksHeld: p.blocksHeld,
      question: playing && p.state === "question" ? this.stream.questionView(p) : null,
      feedback: this.stream.feedbackView(p),
      egg: playing && this.egg ? { seq: this.egg.seq, ...this.egg.cells[p.team]! } : null,
      monsterEvent: this.monsterEventFor(p),
      build: playing && p.state === "build" ? { columns: [...team.columns], floors: floorsOf(team), sweepMs: sweepMsFor(floorsOf(team)) } : null,
      result,
    };
  }
}
