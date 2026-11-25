import type { AnswerValue } from "../../shared/answer-match.ts";
import { answerOf } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type { LandStart } from "../../shared/land-board.ts";
import { EMPTY, enclosedBy, landBoardSize, placementCost, startTiles } from "../../shared/land-board.ts";
import type {
  HostLandState,
  LandAwardKey,
  LandBoard,
  LandCapture,
  LandPhase,
  LandPlace,
  LandSettings,
  LandState,
  PlayerLandView,
} from "../../shared/modes/land.ts";
import {
  LAND_EMPTY_MS,
  LAND_GUARD_COST,
  LAND_MIN_TEAMS,
  LAND_MINUTES,
  LAND_QUESTIONS_PER_ROUND,
  LAND_STEAL_COST,
  landShared,
} from "../../shared/modes/land.ts";
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
/** When only one team is left, the board stays up this long before the podium. */
export const CONQUEST_MS = 3500;

interface LandTeam {
  index: number;
  name: string;
  color: string;
  start: number;
  out: boolean;
  /** The team that surrounded this one's starting point. */
  conqueredBy: number | null;
  /** 1 for the first team knocked out, 2 for the second, …; 0 while still in the game. */
  outOrder: number;
}

export interface LandPlayer extends BasePlayer, AnswerTotals {
  /** Changes when the player's team is conquered: they join the conquerors. */
  team: number;
  firstTeam: number;
  state: LandState;
  claims: number;
  answered: number;
  emptyEndsAt: number;
  placed: number;
  stolen: number;
  /** Tiles won by closing a ring (not counting the tiles placed). */
  captured: number;
  conquered: { seq: number; from: string; by: string } | null;
}

interface LandOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: LandGame) => void;
}

interface LandGameSettings extends LandSettings {
  shuffleAnswers: boolean;
}

type LandTeamTotals = LandTeam & { tiles: number; correct: number };
type LandPodium = Podium<LandTeamTotals, LandPlayer, LandAwardKey>;
const LAND_ORDER: RankKey<LandTeamTotals>[] = [fewest((t) => Number(t.out)), most((t) => t.outOrder), most((t) => t.tiles), most((t) => t.correct)];
const LAND_THEN: RankKey<LandTeamTotals>[] = [fewest((t) => t.index)];
const LAND_AWARD_VALUES: Record<LandAwardKey, (p: LandPlayer) => number> = {
  mostCorrect: (p) => p.correct,
  topSettler: (p) => p.placed,
  topSurrounder: (p) => p.captured,
};

/** Land Grab: teams answer at their own pace; every 3 answers, the correct ones become tiles on a shared hex board. */
export class LandGame {
  readonly runningMode = "land" as const;
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly teams: LandTeam[];
  readonly settings: LandGameSettings;
  readonly size: number;
  /** owners[tile] is a team index, or EMPTY for grass. */
  readonly owners: number[];
  lastPlace: LandPlace | null = null;
  lastCapture: LandCapture | null = null;
  private eventSeq = 0;
  private outCount = 0;

  private readonly session: StreamedSession<LandPlayer, LandPhase, LandPodium>;

  constructor(quiz: Quiz, settings: LandGameSettings, opts: LandOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.settings = settings;
    this.size = landBoardSize(settings.teams);
    this.owners = Array(this.size * this.size).fill(EMPTY);
    this.teams = startTiles(settings.teams).map((start, i) => ({ ...teamInfo(i), start, out: false, conqueredBy: null, outOrder: 0 }));
    for (const t of this.teams) this.owners[t.start] = t.index;
    this.session = new StreamedSession({
      questions: quiz.questions,
      shuffleAnswers: settings.shuffleAnswers,
      clock: opts.clock,
      rng: opts.rng,
      countdownMs: COUNTDOWN_MS,
      inPlay: (phase) => phase === "playing",
      minutes: settings.minutes,
      canAnswer: (p) => this.phase === "playing" && p.state === "question",
      podium: { build: () => this.buildPodium(), empty: () => emptyPodium(landShared.awards) },
      hub: { onChange: opts.onChange, onActivity: opts.onActivity, onFinish: () => opts.onFinish?.(this) },
    });
  }

  get choices(): LobbyChoices {
    return this.session.choices;
  }

  /** Take over a lobby's players (same ids and tokens), on the teams shown in the lobby. */
  static fromLobby(lobby: LobbyFacts<"land">, opts: LandOptions = {}): LandGame {
    const game = new LandGame(lobby.quiz, { ...lobby.settings, shuffleAnswers: lobby.shuffle.answers }, opts);
    const teams = lobby.teams;
    game.session.adoptLobby(lobby, (base) => game.newPlayer(base, teams.get(base.id) ?? 0));
    return game;
  }

  get phase(): LandPhase {
    return this.session.phase;
  }

  get players(): Map<string, LandPlayer> {
    return this.session.players;
  }

  private newPlayer(base: BasePlayer, team: number): Omit<LandPlayer, keyof AnswerTotals> {
    return {
      ...base,
      team,
      firstTeam: team,
      state: "question",
      claims: 0,
      answered: 0,
      emptyEndsAt: 0,
      placed: 0,
      stolen: 0,
      captured: 0,
      conquered: null,
    };
  }

  get starts(): LandStart[] {
    return this.teams.map((t) => ({ team: t.index, tile: t.start, out: t.out }));
  }

  start(): void {
    this.session.start(() => this.beginPlaying());
  }

  private beginPlaying(): void {
    if (this.phase !== "countdown") return;
    this.session.startGameLength("playing");
    for (const p of this.players.values()) this.session.stream.open(p);
    this.session.changed();
  }

  end(): void {
    this.session.end();
  }

  /** Only one team is left: show the board for a moment, then the podium. */
  private conquer(): void {
    this.session.phases.dispose();
    this.session.phases.set("conquered", CONQUEST_MS, () => this.session.end());
  }

  dispose(): void {
    this.session.dispose();
  }

  /** Each player's cooldown has its own slot on the phase timer. */
  private playerSlot(p: LandPlayer): string {
    return `player:${p.id}`;
  }

  join(rawNickname: unknown, avatar?: AvatarChoice | null): LandPlayer {
    const player = this.session.addPlayer(rawNickname, avatar, (base) => this.newPlayer(base, this.smallestTeam()));
    this.session.changed();
    return player;
  }

  private smallestTeam(): number {
    const sizes = this.teams.map((t) => (t.out ? Infinity : 0));
    for (const p of this.players.values()) sizes[p.team]!++;
    return sizes.indexOf(Math.min(...sizes));
  }

  byToken(token: unknown): LandPlayer | null {
    return this.session.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    this.session.setConnected(playerId, connected);
  }

  kick(playerId: string): LandPlayer | null {
    const p = this.session.removePlayer(playerId);
    if (p) {
      this.session.phases.cancel(this.playerSlot(p));
      this.session.changed();
    }
    return p;
  }

  private backToQuestions(p: LandPlayer): void {
    this.session.phases.cancel(this.playerSlot(p));
    p.state = "question";
    this.session.stream.resume(p);
  }

  answer(playerId: string, seq: number, option: AnswerValue): boolean {
    const answered = this.session.answer(playerId, seq, option);
    if (!answered) return false;
    const { player: p, correct } = answered;
    if (correct) p.claims++;
    if (++p.answered >= LAND_QUESTIONS_PER_ROUND) {
      p.answered = 0;
      if (p.claims === 0) {
        // The message starts once the ✗ flash is over.
        p.state = "empty";
        p.emptyEndsAt = this.session.stream.feedbackEndsAt(p) + LAND_EMPTY_MS;
        this.session.phases.after(this.playerSlot(p), p.emptyEndsAt - this.session.clock.now(), () => this.endEmpty(p.id));
      } else if (this.canPlace(p)) {
        p.state = "claim";
      }
    }
    this.session.activity(p.id);
    return true;
  }

  private endEmpty(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.state !== "empty") return;
    this.backToQuestions(p);
    this.session.activity(p.id);
  }

  costFor(team: number, tile: number): number | null {
    return placementCost(this.owners, this.size, this.starts, team, tile, LAND_STEAL_COST, LAND_GUARD_COST);
  }

  private canPlace(p: LandPlayer): boolean {
    for (let t = 0; t < this.owners.length; t++) {
      const cost = this.costFor(p.team, t);
      if (cost !== null && cost <= p.claims) return true;
    }
    return false;
  }

  /** Put the player's team colour on a tile. Returns whether it was taken. */
  place(playerId: string, tile: number): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "playing" || p.state !== "claim" || this.session.clock.now() < this.session.stream.feedbackEndsAt(p)) return false;
    const cost = this.costFor(p.team, tile);
    if (cost === null || cost > p.claims) return false;
    const stolen = this.owners[tile] !== EMPTY;
    this.owners[tile] = p.team;
    p.claims -= cost;
    p.placed++;
    if (stolen) p.stolen++;
    this.lastPlace = { seq: ++this.eventSeq, tile, team: p.team, stolen };
    this.resolveCaptures(p);
    if (this.teams.filter((t) => !t.out).length <= 1) {
      this.conquer();
      this.session.changed();
      return true;
    }
    if (!this.canPlace(p)) this.backToQuestions(p);
    // A capture changes everyone's board at once.
    if (this.lastCapture?.seq === this.eventSeq) this.session.changed();
    else this.session.activity(p.id);
    return true;
  }

  /** Leave the land early; unused claims are kept. */
  done(playerId: string): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "playing" || p.state !== "claim") return false;
    this.backToQuestions(p);
    this.session.activity(p.id);
    return true;
  }

  /**
   * Everything the player's team has walled in turns its colour. A team whose
   * starting point is inside is knocked out: its land and players go to the
   * conquerors, which can close further rings, so repeat until nothing changes.
   */
  private resolveCaptures(p: LandPlayer): void {
    const team = p.team;
    const tiles: number[] = [];
    const knockedOut: number[] = [];
    for (;;) {
      const enclosed = enclosedBy(this.owners, this.size, team);
      if (enclosed.length === 0) break;
      for (const t of enclosed) this.owners[t] = team;
      tiles.push(...enclosed);
      for (const victim of this.teams) {
        if (victim.out || victim.index === team || this.owners[victim.start] !== team) continue;
        knockedOut.push(victim.index);
        tiles.push(...this.absorb(victim, team));
      }
    }
    if (tiles.length === 0) return;
    p.captured += tiles.length;
    this.lastCapture = { seq: ++this.eventSeq, team, nickname: p.nickname, tiles, knockedOut };
  }

  private absorb(victim: LandTeam, by: number): number[] {
    victim.out = true;
    victim.conqueredBy = by;
    victim.outOrder = ++this.outCount;
    const tiles: number[] = [];
    this.owners.forEach((owner, t) => {
      if (owner !== victim.index) return;
      this.owners[t] = by;
      tiles.push(t);
    });
    for (const q of this.players.values()) {
      if (q.team !== victim.index) continue;
      q.team = by;
      q.conquered = { seq: ++this.eventSeq, from: victim.name, by: this.teams[by]!.name };
    }
    return tiles;
  }

  teamTiles(team: number): number {
    let n = 0;
    for (const o of this.owners) if (o === team) n++;
    return n;
  }

  teamCorrect(team: number): number {
    let n = 0;
    for (const p of this.players.values()) if (p.team === team) n += p.correct;
    return n;
  }

  private teamTotals(): LandTeamTotals[] {
    return this.teams.map((t) => ({ ...t, tiles: this.teamTiles(t.index), correct: this.teamCorrect(t.index) }));
  }

  /** Teams during play: by tiles, then correct answers; equal teams share a rank. Knocked-out teams come last, the first one out at the bottom. */
  rankedTeams(): (LandTeamTotals & { rank: number })[] {
    return rankBy(this.teamTotals(), LAND_ORDER, LAND_THEN);
  }

  /** Teams ranked as in play; a conquered player finishes with the team they started on; players listed by tiles placed, then correct answers. */
  private buildPodium(): LandPodium {
    const entries = this.teamTotals();
    const players = [...this.players.values()].sort((a, b) => b.placed - a.placed || b.correct - a.correct);
    return buildPodium({
      entries,
      order: LAND_ORDER,
      then: LAND_THEN,
      players,
      entryOf: (p) => entries[p.firstTeam]!,
      awards: { labels: landShared.awards, values: LAND_AWARD_VALUES },
    });
  }

  /** The finished game's Podium (GLOSSARY.md), worked out once in Game finish. */
  get podium(): LandPodium {
    return this.session.podium;
  }

  /** A team's totals and place on the Podium. */
  podiumTeam(index: number): (LandTeamTotals & { place: number }) | undefined {
    return this.podium.places.find((t) => t.index === index);
  }

  private boardView(): LandBoard {
    return { size: this.size, owners: [...this.owners], starts: this.starts };
  }

  hostView(): HostLandState {
    const podium = this.phase === "podium";
    const ranked = new Map(podium ? this.podium.places.map((t) => [t.index, { ...t, rank: t.place }]) : this.rankedTeams().map((t) => [t.index, t]));
    const players = [...this.players.values()];
    const playing = this.phase === "playing";
    return {
      kind: "land",
      theme: modeTheme("land", this.settings.theme),
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      remainingMs: this.session.phases.remainingMs(),
      board: this.boardView(),
      teams: this.teams.map((t) => {
        const r = ranked.get(t.index)!;
        return {
          index: t.index,
          name: t.name,
          color: t.color,
          tiles: r.tiles,
          correct: r.correct,
          rank: r.rank,
          out: t.out,
          conqueredBy: t.conqueredBy,
          // At the podium players stand with the team they started on, so a conquered team keeps its players and its place.
          members: players
            .filter((p) => (podium ? p.firstTeam : p.team) === t.index)
            .map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, connected: p.connected, claiming: playing && p.state === "claim" })),
        };
      }),
      lastPlace: this.lastPlace,
      lastCapture: this.lastCapture,
      playerCount: players.length,
      awards: podium ? this.podium.awards : null,
      errors: this.session.stream.errorsWhen(this.phase === "podium"),
    };
  }

  playerView(playerId: string): PlayerLandView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const now = this.session.clock.now();
    const playing = this.phase === "playing";
    const state: LandState = playing ? p.state : "question";
    let result: PlayerLandView["result"] = null;
    if (this.phase === "podium") {
      // A conquered player's result is the place of the team they started on, as on the podium and the results sheet.
      const mine = this.podium.result(p.id);
      const team = this.podiumTeam(p.firstTeam);
      if (mine && team) result = { teamRank: mine.place, teamCount: this.teams.length, tiles: team.tiles, won: mine.place === 1, awards: mine.awards };
    }
    return {
      kind: "land",
      theme: modeTheme("land", this.settings.theme),
      phase: this.phase,
      title: this.title,
      remainingMs: this.session.phases.remainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, placed: p.placed, stolen: p.stolen },
      team: teamInfo(p.team),
      teamTiles: this.teamTiles(p.team),
      state,
      claims: p.claims,
      answered: p.answered,
      emptyRemainingMs: state === "empty" ? Math.max(0, p.emptyEndsAt - now) : 0,
      ...this.session.stream.fragment(p),
      board: state === "claim" ? this.boardView() : null,
      claimWait: state === "claim" ? this.session.stream.afterAnswerWaitView(p) : null,
      conquered: p.conquered,
      result,
    };
  }
}

/** Land Grab: one row per player, grouped by the team they started on, in final team order. */
type LandResultRow = { team: LandTeamTotals & { place: number }; p: LandPlayer };

function landColumns(game: LandGame): Column<LandResultRow>[] {
  return [
    { header: "Team", value: (r) => r.team.name },
    { header: "Team rank", value: (r) => r.team.place },
    { header: "Team tiles", value: (r) => r.team.tiles },
    { header: "Knocked out by", value: (r) => (r.team.conqueredBy === null ? "" : game.teams[r.team.conqueredBy]!.name) },
    { header: "Nickname", value: (r) => r.p.nickname },
    { header: "Correct", value: (r) => r.p.correct },
    { header: "Wrong", value: (r) => r.p.wrong },
    { header: "Accuracy %", value: (r) => accuracy(r.p) },
    { header: "Tiles placed", value: (r) => r.p.placed },
    { header: "Tiles stolen", value: (r) => r.p.stolen },
    { header: "Tiles surrounded", value: (r) => r.p.captured },
  ];
}

export function buildLandResults(game: LandGame): ResultsSheet {
  return sheet(
    landColumns(game),
    game.podium.rows.flatMap((r) => {
      const team = game.podiumTeam(r.player.firstTeam);
      return team ? [{ team, p: r.player }] : [];
    }),
  );
}

export const landMode: ModeEntry<"land"> = {
  ...landShared,
  defaultSettings: { teams: 2, minutes: 5, theme: THEMED_MODES.land.default },
  readSettings(raw, current) {
    const teams = Math.trunc(Number(raw.teams));
    const minutes = Number(raw.minutes);
    if (!(teams >= LAND_MIN_TEAMS && teams <= MAX_TEAMS)) throw new GameError(`Teams must be between ${LAND_MIN_TEAMS} and ${MAX_TEAMS}`);
    if (!(LAND_MINUTES as readonly number[]).includes(minutes)) throw new GameError("Unsupported game length");
    return { teams, minutes, theme: pickTheme(raw.theme, modeTheme("land", current.theme), "Land Grab") };
  },
  start(lobby, ctx) {
    const game = LandGame.fromLobby(lobby, handoffOptions(ctx));
    return { game, log: `${this.name} started: ${game.teams.length} teams, ${game.settings.minutes} min` };
  },
  pacing: null,
  teams: (settings) => settings.teams,
  results: buildLandResults,
  handle(game, playerId, msg) {
    switch (msg.type) {
      case "land.answer":
        return game.answer(playerId, Number(msg.seq), answerOf(msg)) ? undefined : "resend";
      case "land.place":
        return game.place(playerId, Number(msg.tile)) ? undefined : "resend";
      case "land.done":
        return game.done(playerId) ? undefined : "resend";
      default:
        return unhandled(msg);
    }
  },
};
