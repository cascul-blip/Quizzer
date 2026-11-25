import type { AnswerValue } from "../../shared/answer-match.ts";
import { answerOf } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type { HostTowerState, MonsterAttack, MonsterEggs, PlayerTowerView, TowerAwardKey, TowerPhase, TowerSettings } from "../../shared/modes/tower.ts";
import { BLOCKS_PER_BUILD, DROP_ZONES, EGG_LEVELS_ABOVE, MONSTER_DAMAGE, TOWER_MINUTES, towerShared } from "../../shared/modes/tower.ts";
import { MAX_TEAMS } from "../../shared/protocol.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { modeTheme, THEMED_MODES } from "../../shared/themed-modes.ts";
import type { Clock } from "./common.ts";
import { GameError, teamInfo } from "./common.ts";
import type { LobbyChoices, LobbyFacts } from "./lobby-facts.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, pickTheme, unhandled } from "./mode-entry.ts";
import type { Podium } from "./podium.ts";
import { buildPodium, emptyPodium } from "./podium.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { accuracy, sheet } from "./results.ts";
import type { BasePlayer } from "./roster.ts";
import type { RankKey } from "./standings.ts";
import { fewest, most, rankBy } from "./standings.ts";
import type { AnswerTotals } from "./stream.ts";
import { StreamedSession } from "./streamed-session.ts";

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

type TowerTeamTotals = TowerTeam & { floors: number; placed: number };
type TowerPodium = Podium<TowerTeamTotals, TowerPlayer, TowerAwardKey>;
const TOWER_ORDER: RankKey<TowerTeamTotals>[] = [most((t) => t.floors), most((t) => t.placed)];
const TOWER_THEN: RankKey<TowerTeamTotals>[] = [fewest((t) => t.index)];
const TOWER_AWARD_VALUES: Record<TowerAwardKey, (p: TowerPlayer) => number> = { mostCorrect: (p) => p.correct, masterBuilder: (p) => p.placed };

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
  dropCount = 0;
  egg: MonsterEggs | null = null;
  lastAttack: MonsterAttack | null = null;
  private monsterSeq = 0;
  private lastMonsterEvent: { seq: number; kind: "egg" | "attack" } | null = null;

  private readonly session: StreamedSession<TowerPlayer, TowerPhase, TowerPodium>;

  constructor(quiz: Quiz, settings: TowerGameSettings, opts: TowerOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.settings = settings;
    this.teams = Array.from({ length: settings.teams }, (_, i) => ({ ...teamInfo(i), columns: [0, 0, 0] }));
    this.session = new StreamedSession({
      questions: quiz.questions,
      shuffleAnswers: settings.shuffleAnswers,
      protect: settings.protect,
      clock: opts.clock,
      rng: opts.rng,
      countdownMs: COUNTDOWN_MS,
      inPlay: (phase) => phase === "playing",
      minutes: settings.minutes,
      canAnswer: (p) => this.phase === "playing" && p.state === "question",
      cleanup: () => {
        this.egg = null;
      },
      podium: { build: () => this.buildPodium(), empty: () => emptyPodium(towerShared.awards) },
      hub: { onChange: opts.onChange, onActivity: opts.onActivity, onFinish: () => opts.onFinish?.(this) },
    });
  }

  static fromLobby(lobby: LobbyFacts<"tower">, opts: TowerOptions = {}): TowerGame {
    const game = new TowerGame(lobby.quiz, { ...lobby.settings, shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect }, opts);
    game.session.adoptLobby(lobby, (base) => game.newPlayer(base, lobby.teams.get(base.id) ?? 0));
    return game;
  }

  get choices(): LobbyChoices {
    return this.session.choices;
  }

  get phase(): TowerPhase {
    return this.session.phase;
  }

  get players(): Map<string, TowerPlayer> {
    return this.session.players;
  }

  private newPlayer(base: BasePlayer, team: number): Omit<TowerPlayer, keyof AnswerTotals> {
    return {
      ...base,
      team,
      blocksHeld: 0,
      placed: 0,
      missed: 0,
      hatched: 0,
      state: "question",
      lastDropAt: -Infinity,
    };
  }

  start(): void {
    this.session.start(() => this.beginPlaying());
  }

  private beginPlaying(): void {
    if (this.phase !== "countdown") return;
    const ms = this.settings.minutes * 60_000;
    this.session.startGameLength("playing");
    for (const p of this.players.values()) this.session.stream.open(p);
    if (this.monsterEnabled) {
      MONSTER_AT.forEach((frac, i) => this.session.phases.after(monsterSlot(i), Math.round(ms * frac), () => this.announceMonster()));
    }
    this.session.changed();
  }

  /** Time until the next egg announcement, or null if none is coming. */
  private nextMonsterRemainingMs(): number | null {
    for (let i = 0; i < MONSTER_AT.length; i++) {
      const ms = this.session.phases.slotRemainingMs(monsterSlot(i));
      if (ms !== null) return ms;
    }
    return null;
  }

  get monsterEnabled(): boolean {
    return this.settings.monster && this.hasAttackTarget;
  }

  private get hasAttackTarget(): boolean {
    return this.teams.length >= 2;
  }

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
        return { col: free[Math.min(free.length - 1, Math.floor(this.session.rng() * free.length))]!, row };
      });
      this.egg = { seq, cells };
      this.lastMonsterEvent = { seq, kind: "egg" };
    }
    this.session.changed();
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
    this.session.changed();
  }

  end(): void {
    this.session.end();
  }

  dispose(): void {
    this.session.dispose();
  }

  join(rawNickname: unknown, avatar?: AvatarChoice | null): TowerPlayer {
    const player = this.session.addPlayer(rawNickname, avatar, (base) => this.newPlayer(base, this.smallestTeam()));
    this.session.changed();
    return player;
  }

  private smallestTeam(): number {
    const sizes = this.teams.map(() => 0);
    for (const p of this.players.values()) sizes[p.team]!++;
    return sizes.indexOf(Math.min(...sizes));
  }

  byToken(token: unknown): TowerPlayer | null {
    return this.session.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    this.session.setConnected(playerId, connected);
  }

  kick(playerId: string): TowerPlayer | null {
    const p = this.session.removePlayer(playerId);
    if (p) this.session.changed();
    return p;
  }

  answer(playerId: string, seq: number, option: AnswerValue): boolean {
    const answered = this.session.answer(playerId, seq, option);
    if (!answered) return false;
    const p = answered.player;
    if (answered.correct) p.blocksHeld++;
    if (p.blocksHeld >= BLOCKS_PER_BUILD) p.state = "build";
    this.session.activity(p.id);
    return true;
  }

  /** Drop the player's next block into zone 0–4 (0 and 4 miss the tower). Returns whether it landed. */
  drop(playerId: string, zone: number): boolean | null {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "playing" || p.state !== "build" || p.blocksHeld <= 0) return null;
    if (!Number.isInteger(zone) || zone < 0 || zone >= DROP_ZONES) return null;
    const now = this.session.clock.now();
    if (now < this.session.stream.feedbackEndsAt(p) || now - p.lastDropAt < DROP_COOLDOWN_MS) return null;
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
      this.session.stream.resume(p, now);
    }
    this.dropCount++;
    this.session.activity(p.id);
    return landed;
  }

  private teamTotals(): TowerTeamTotals[] {
    return this.teams.map((t) => ({ ...t, floors: floorsOf(t), placed: placedOf(t) }));
  }

  /** Teams during play: by floors, then blocks placed; equal teams share a rank. */
  rankedTeams(): (TowerTeamTotals & { rank: number })[] {
    return rankBy(this.teamTotals(), TOWER_ORDER, TOWER_THEN);
  }

  /** Teams ranked as in play; each player finishes with their team; players listed by blocks placed, then correct answers. */
  private buildPodium(): TowerPodium {
    const entries = this.teamTotals();
    const players = [...this.players.values()].sort((a, b) => b.placed - a.placed || b.correct - a.correct);
    return buildPodium({
      entries,
      order: TOWER_ORDER,
      then: TOWER_THEN,
      players,
      entryOf: (p) => entries[p.team]!,
      awards: { labels: towerShared.awards, values: TOWER_AWARD_VALUES },
    });
  }

  /** The finished game's Podium (GLOSSARY.md), worked out once in Game finish. */
  get podium(): TowerPodium {
    return this.session.podium;
  }

  /** A team's totals and place on the Podium. */
  podiumTeam(index: number): (TowerTeamTotals & { place: number }) | undefined {
    return this.podium.places.find((t) => t.index === index);
  }

  hostView(): HostTowerState {
    const podium = this.phase === "podium";
    const ranked = new Map(podium ? this.podium.places.map((t) => [t.index, t.place]) : this.rankedTeams().map((t) => [t.index, t.rank]));
    const players = [...this.players.values()];
    return {
      kind: "tower",
      theme: modeTheme("tower", this.settings.theme),
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      remainingMs: this.session.phases.remainingMs(),
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
      nextMonsterRemainingMs: this.phase === "playing" ? this.nextMonsterRemainingMs() : null,
      awards: podium ? this.podium.awards : null,
      errors: this.session.stream.errorsWhen(this.phase === "podium"),
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
      const mine = this.podium.result(p.id);
      const t = this.podiumTeam(p.team);
      if (mine && t) result = { teamRank: mine.place, teamCount: this.teams.length, floors: t.floors, placed: t.placed, awards: mine.awards };
    }
    return {
      kind: "tower",
      theme: modeTheme("tower", this.settings.theme),
      phase: this.phase,
      title: this.title,
      remainingMs: this.session.phases.remainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, placed: p.placed },
      team: teamInfo(team.index),
      state: p.state,
      blocksHeld: p.blocksHeld,
      ...this.session.stream.fragment(p),
      egg: playing && this.egg ? { seq: this.egg.seq, ...this.egg.cells[p.team]! } : null,
      monsterEvent: this.monsterEventFor(p),
      build:
        playing && p.state === "build"
          ? {
              columns: [...team.columns],
              floors: floorsOf(team),
              sweepDurationMs: sweepMsFor(floorsOf(team)),
              wait: this.session.stream.afterAnswerWaitView(p),
            }
          : null,
      result,
    };
  }
}

/** Tallest Tower: one row per player, grouped by team in final team order. */
type TowerResultRow = { team: TowerTeamTotals & { place: number }; p: TowerPlayer };

const TOWER_COLUMNS: Column<TowerResultRow>[] = [
  { header: "Team", value: (r) => r.team.name },
  { header: "Team rank", value: (r) => r.team.place },
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
  return sheet(
    TOWER_COLUMNS,
    game.podium.rows.flatMap((r) => {
      const team = game.podiumTeam(r.player.team);
      return team ? [{ team, p: r.player }] : [];
    }),
  );
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
