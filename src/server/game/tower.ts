import type { AnswerValue } from "../../shared/answer-match.ts";
import { answerOf } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { randomAvatar } from "../../shared/avatars.ts";
import type { HostTowerState, MonsterAttack, MonsterEggs, PlayerTowerView, TowerAwards, TowerPhase, TowerSettings } from "../../shared/modes/tower.ts";
import { BLOCKS_PER_BUILD, DROP_ZONES, EGG_LEVELS_ABOVE, MONSTER_DAMAGE, TOWER_MINUTES, towerShared } from "../../shared/modes/tower.ts";
import { MAX_TEAMS } from "../../shared/protocol.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { modeTheme, THEMED_MODES } from "../../shared/themed-modes.ts";
import type { Clock } from "./common.ts";
import { GameError, realClock, teamInfo } from "./common.ts";
import type { LobbyChoices, LobbyFacts } from "./lobby-facts.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, pickTheme, unhandled } from "./mode-entry.ts";
import { GameLengthClock, PhaseTimer } from "./phase-timer.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { accuracy, sheet } from "./results.ts";
import type { BasePlayer } from "./roster.ts";
import { Roster } from "./roster.ts";
import { fewest, most, rankBy } from "./standings.ts";
import type { AnswerTotals } from "./stream.ts";
import { QuestionStream } from "./stream.ts";

export { FEEDBACK_MS } from "./stream.ts";

export const COUNTDOWN_MS = 3000;
export const SWEEP_START_MS = 2500;
export const SWEEP_MIN_MS = 1200;
/** The sliding block speeds up by this much per completed floor. */
export const SWEEP_STEP_MS = 130;
export const DROP_COOLDOWN_MS = 400;
/** Egg announcements, as fractions of the game length. */
export const MONSTER_AT = [1 / 5, 2 / 5, 3 / 5, 4 / 5] as const;

interface TowerTeam {
  index: number;
  name: string;
  color: string;
  /** Blocks stacked in the left, center and right columns. */
  columns: [number, number, number];
}

const floorsOf = (t: TowerTeam) => Math.min(...t.columns);
const placedOf = (t: TowerTeam) => t.columns[0] + t.columns[1] + t.columns[2];
export const sweepMsFor = (floors: number) => Math.max(SWEEP_MIN_MS, SWEEP_START_MS - floors * SWEEP_STEP_MS);

export interface TowerPlayer extends BasePlayer, AnswerTotals {
  team: number;
  blocksHeld: number;
  placed: number;
  missed: number;
  /** Monster eggs this player hatched. */
  hatched: number;
  state: "question" | "build";
  lastDropAt: number;
}

interface TowerOptions {
  clock?: Clock;
  rng?: () => number;
  /** Something everyone may care about changed (phase, roster): push to every screen now. */
  onChange?: () => void;
  /** Only this player's state changed, plus team/host totals: push to them now, others soon. */
  onActivity?: (playerId: string) => void;
  onFinish?: (game: TowerGame) => void;
}

interface TowerGameSettings extends TowerSettings {
  /** Shuffle answer positions per player (the lobby's "Shuffle answer positions"). */
  shuffleAnswers: boolean;
  /** Longer waits for wrong answers in a row (the lobby's "Protect from abuse"). */
  protect?: boolean;
}

/** Tallest Tower: teams answer at their own pace; every 4 correct answers are dropped onto the team tower. */
/** The phase timer slot of the i-th egg announcement. */
const monsterSlot = (i: number): string => `monster-${i}`;

export class TowerGame {
  readonly runningMode = "tower" as const;
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly teams: TowerTeam[];
  readonly settings: TowerGameSettings;
  readonly roster = new Roster<TowerPlayer>();
  dropCount = 0;
  egg: MonsterEggs | null = null;
  lastAttack: MonsterAttack | null = null;
  private monsterSeq = 0;
  private lastMonsterEvent: { seq: number; kind: "egg" | "attack" } | null = null;

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream<TowerPlayer>;
  private readonly phases: PhaseTimer<TowerPhase>;
  private readonly gameLength: GameLengthClock<TowerPhase>;
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
    this.phases = new PhaseTimer(this.clock, "countdown");
    this.gameLength = new GameLengthClock(this.phases, () => this.finish());
    this.rng = opts.rng ?? Math.random;
    this.stream = new QuestionStream(quiz.questions, settings.shuffleAnswers, this.rng, this.clock, {
      penalizeGuessing: settings.protect,
      canAnswer: (p) => this.phase === "playing" && p.state === "question",
    });
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  /** Take over a lobby's players (same ids and tokens), on the teams shown in the lobby. */
  /** What the lobby chose at Start; the next lobby opens with it. */
  choices!: LobbyChoices;

  static fromLobby(lobby: LobbyFacts<"tower">, opts: TowerOptions = {}): TowerGame {
    const game = new TowerGame(lobby.quiz, { ...lobby.settings, shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect }, opts);
    const players = [...lobby.players];
    const teams = lobby.teams;
    game.choices = lobby.choices;
    game.roster.adoptFrom(players, (base) => game.newPlayer(base, teams.get(base.id) ?? 0));
    return game;
  }

  get phase(): TowerPhase {
    return this.phases.phase;
  }

  get players(): Map<string, TowerPlayer> {
    return this.roster.players;
  }

  private newPlayer(base: BasePlayer, team: number): TowerPlayer {
    return this.stream.registerPlayer({
      ...base,
      team,
      blocksHeld: 0,
      placed: 0,
      missed: 0,
      hatched: 0,
      state: "question",
      lastDropAt: -Infinity,
    });
  }

  // ---------- lifecycle ----------

  /** Set by start(); a running game can't be started again. */
  private started = false;

  start(): void {
    if (this.started) throw new GameError("The game has already started");
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    this.started = true;
    this.phases.set("countdown", COUNTDOWN_MS, () => this.beginPlaying());
    this.onChange();
  }

  private beginPlaying(): void {
    if (this.phase !== "countdown") return;
    const ms = this.settings.minutes * 60_000;
    this.gameLength.start("playing", ms);
    for (const p of this.players.values()) this.stream.open(p);
    if (this.monsterEnabled) {
      MONSTER_AT.forEach((frac, i) => this.phases.after(monsterSlot(i), Math.round(ms * frac), () => this.announceMonster()));
    }
    this.onChange();
  }

  /** Time until the next egg announcement, or null if none is coming. */
  private nextMonsterMs(): number | null {
    for (let i = 0; i < MONSTER_AT.length; i++) {
      const ms = this.phases.slotRemainingMs(monsterSlot(i));
      if (ms !== null) return ms;
    }
    return null;
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

  end(): void {
    this.gameLength.end();
  }

  /** Runs once, from the game-length clock: at the deadline or when the host ends the game. */
  private finish(): void {
    this.phases.cancelSlots();
    this.egg = null;
    this.phases.enter("podium");
    this.onFinish(this);
    this.onChange();
  }

  dispose(): void {
    this.phases.dispose();
  }

  // ---------- players ----------

  join(rawNickname: unknown, avatar?: AvatarChoice | null): TowerPlayer {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base, this.smallestTeam()));
    this.stream.openOnJoin(player, this.phase === "playing");
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
    if (this.roster.setConnected(playerId, connected)) this.onChange();
  }

  kick(playerId: string): TowerPlayer | null {
    const p = this.roster.remove(playerId);
    if (p) this.onChange();
    return p;
  }

  // ---------- questions ----------

  answer(playerId: string, seq: number, option: AnswerValue): boolean {
    const p = this.players.get(playerId);
    if (!p) return false;
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
    if (now < this.stream.feedbackEndsAt(p) || now - p.lastDropAt < DROP_COOLDOWN_MS) return null;
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
      this.stream.resume(p, now);
    }
    this.dropCount++;
    this.onActivity(p.id);
    return landed;
  }

  // ---------- results ----------

  /** Teams by floors, then blocks placed; equal teams share a rank. */
  rankedTeams(): (TowerTeam & { rank: number; floors: number; placed: number })[] {
    const withTotals = this.teams.map((t) => ({ ...t, floors: floorsOf(t), placed: placedOf(t) }));
    return rankBy(withTotals, [most((t) => t.floors), most((t) => t.placed)], [fewest((t) => t.index)]);
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

  hostView(): HostTowerState {
    const ranked = new Map(this.rankedTeams().map((t) => [t.index, t.rank]));
    const players = [...this.players.values()];
    return {
      kind: "tower",
      theme: modeTheme("tower", this.settings.theme),
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      remainingMs: this.gameLength.remainingMs(),
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
          .map((p) => ({
            id: p.id,
            nickname: p.nickname,
            avatar: p.avatar,
            connected: p.connected,
            building: p.state === "build" && this.phase === "playing",
          })),
      })),
      playerCount: players.length,
      dropCount: this.dropCount,
      monster: this.monsterEnabled,
      egg: this.egg,
      lastAttack: this.lastAttack,
      nextMonsterMs: this.phase === "playing" ? this.nextMonsterMs() : null,
      awards: this.phase === "podium" ? this.awards() : null,
      errors: this.stream.errorsWhen(this.phase === "podium"),
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
      theme: modeTheme("tower", this.settings.theme),
      phase: this.phase,
      title: this.title,
      remainingMs: this.gameLength.remainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, placed: p.placed },
      team: teamInfo(team.index),
      state: p.state,
      blocksHeld: p.blocksHeld,
      ...this.stream.fragment(p),
      egg: playing && this.egg ? { seq: this.egg.seq, ...this.egg.cells[p.team]! } : null,
      monsterEvent: this.monsterEventFor(p),
      build:
        playing && p.state === "build"
          ? { columns: [...team.columns], floors: floorsOf(team), sweepMs: sweepMsFor(floorsOf(team)), wait: this.stream.afterAnswerWaitView(p) }
          : null,
      result,
    };
  }
}

/** Tallest Tower: one row per player, grouped by team in final team order. */
type TowerResultRow = { team: ReturnType<TowerGame["rankedTeams"]>[number]; p: TowerPlayer };

const TOWER_COLUMNS: Column<TowerResultRow>[] = [
  { header: "Team", value: (r) => r.team.name },
  { header: "Team rank", value: (r) => r.team.rank },
  { header: "Team floors", value: (r) => r.team.floors },
  { header: "Team blocks", value: (r) => r.team.placed },
  { header: "Nickname", value: (r) => r.p.nickname },
  { header: "Correct", value: (r) => r.p.correct },
  { header: "Wrong", value: (r) => r.p.wrong },
  { header: "Accuracy %", value: (r) => accuracy(r.p) },
  { header: "Blocks placed", value: (r) => r.p.placed },
  { header: "Blocks missed", value: (r) => r.p.missed },
  { header: "Monster hatched", value: (r) => r.p.hatched },
];

export function buildTowerResults(game: TowerGame): ResultsSheet {
  const rows = game.rankedTeams().flatMap((team) =>
    [...game.players.values()]
      .filter((p) => p.team === team.index)
      .sort((a, b) => b.placed - a.placed || b.correct - a.correct)
      .map((p) => ({ team, p })),
  );
  return sheet(TOWER_COLUMNS, rows);
}

export const towerMode: ModeEntry<"tower"> = {
  ...towerShared,
  defaultSettings: { teams: 2, minutes: 5, monster: true, theme: THEMED_MODES.tower.default },
  readSettings(raw, current) {
    const teams = Math.trunc(Number(raw.teams));
    const minutes = Number(raw.minutes);
    if (!(teams >= 1 && teams <= MAX_TEAMS)) throw new GameError(`Teams must be between 1 and ${MAX_TEAMS}`);
    if (!(TOWER_MINUTES as readonly number[]).includes(minutes)) throw new GameError("Unsupported game length");
    const theme = pickTheme(raw.theme, modeTheme("tower", current.theme), "tower");
    return { teams, minutes, monster: raw.monster === undefined ? current.monster : !!raw.monster, theme };
  },
  start(lobby, ctx) {
    const game = TowerGame.fromLobby(lobby, handoffOptions(ctx));
    return { game, log: `${this.name} started: ${game.teams.length} team(s), ${game.settings.minutes} min` };
  },
  pacing: null,
  teams: (settings) => settings.teams,
  results: buildTowerResults,
  handle(game, playerId, msg) {
    switch (msg.type) {
      case "tower.answer":
        return game.answer(playerId, Number(msg.seq), answerOf(msg)) ? undefined : "resend";
      case "tower.drop":
        return game.drop(playerId, Number(msg.zone)) === null ? "resend" : undefined;
      default:
        return unhandled(msg);
    }
  },
};
