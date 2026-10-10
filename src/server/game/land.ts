import {
  LAND_EMPTY_MS,
  LAND_GUARD_COST,
  LAND_QUESTIONS_PER_ROUND,
  LAND_STEAL_COST,
  type HostLandState,
  type LandAwards,
  type LandBoard,
  type LandCapture,
  type LandPhase,
  type LandPlace,
  type LandSettings,
  type LandState,
  type PlayerLandView,
} from "../../shared/protocol.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import { EMPTY, enclosedBy, landBoardSize, placementCost, startTiles, type LandStart } from "../../shared/land-board.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { GameError, realClock, teamInfo, type Clock } from "./common.ts";
import type { Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { QuestionStream, newStreamPlayer, type StreamPlayer } from "./stream.ts";

export { FEEDBACK_MS } from "./stream.ts";

export const COUNTDOWN_MS = 3000;
/** When only one team is left, the board stays up this long before the podium. */
export const CONQUEST_MS = 3500;

export interface LandTeam {
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

export interface LandPlayer extends BasePlayer, StreamPlayer {
  /** Changes when the player's team is conquered: they join the conquerors. */
  team: number;
  firstTeam: number;
  state: LandState;
  claims: number;
  /** Answers given in the current round of questions. */
  answered: number;
  emptyEndsAt: number;
  placed: number;
  stolen: number;
  /** Tiles won by closing a ring (not counting the tiles placed). */
  captured: number;
  conquered: { seq: number; from: string; by: string } | null;
  timer: unknown;
}

export interface LandOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: LandGame) => void;
}

export interface LandGameSettings extends LandSettings {
  shuffleAnswers: boolean;
}

/** Land Grab: teams answer at their own pace; every 3 answers, the correct ones become tiles on a shared hex board. */
export class LandGame {
  readonly kind = "land";
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly teams: LandTeam[];
  readonly settings: LandGameSettings;
  readonly size: number;
  /** owners[tile] is a team index, or EMPTY for grass. */
  readonly owners: number[];
  readonly roster = new Roster<LandPlayer>();
  readonly startedAt = new Date();
  phase: LandPhase = "countdown";
  phaseEndsAt = 0;
  lastPlace: LandPlace | null = null;
  lastCapture: LandCapture | null = null;
  private eventSeq = 0;
  private outCount = 0;

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream;
  private timer: unknown = null;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: LandGame) => void;

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
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    this.stream = new QuestionStream(quiz.questions, settings.shuffleAnswers, this.rng, this.clock);
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  /** Take over a lobby's players (same ids and tokens), on the teams shown in the lobby. */
  static fromLobby(lobby: Game, opts: LandOptions = {}): LandGame {
    const game = new LandGame(lobby.quiz, { ...lobby.land, shuffleAnswers: lobby.shuffle.answers }, opts);
    const players = [...lobby.players.values()];
    const teams = lobby.teamAssignment();
    players.forEach((p) => {
      game.roster.adopt(game.newPlayer({ id: p.id, nickname: p.nickname, token: p.token, connected: p.connected, avatar: p.avatar }, teams.get(p.id) ?? 0));
    });
    return game;
  }

  get players(): Map<string, LandPlayer> {
    return this.roster.players;
  }

  private newPlayer(base: BasePlayer, team: number): LandPlayer {
    return {
      ...base,
      team,
      firstTeam: team,
      ...newStreamPlayer(),
      state: "question",
      claims: 0,
      answered: 0,
      emptyEndsAt: 0,
      placed: 0,
      stolen: 0,
      captured: 0,
      conquered: null,
      timer: null,
    };
  }

  get starts(): LandStart[] {
    return this.teams.map((t) => ({ team: t.index, tile: t.start, out: t.out }));
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
    for (const p of this.players.values()) if (!p.current) this.stream.deal(p);
    this.timer = this.clock.setTimeout(() => this.finish(), ms);
    this.onChange();
  }

  end(): void {
    this.finish();
  }

  /** Only one team is left: show the board for a moment, then the podium. */
  private conquer(): void {
    this.clearTimers();
    this.phase = "conquered";
    this.phaseEndsAt = this.clock.now() + CONQUEST_MS;
    this.timer = this.clock.setTimeout(() => this.finish(), CONQUEST_MS);
  }

  private finish(): void {
    if (this.phase === "podium") return;
    this.clearTimers();
    this.phase = "podium";
    this.phaseEndsAt = 0;
    this.onFinish(this);
    this.onChange();
  }

  dispose(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    for (const p of this.players.values()) this.clearPlayerTimer(p);
  }

  private clearPlayerTimer(p: LandPlayer): void {
    if (p.timer !== null) this.clock.clearTimeout(p.timer);
    p.timer = null;
  }

  // ---------- players ----------

  join(rawNickname: unknown, avatar?: AvatarChoice | null): LandPlayer {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base, this.smallestTeam()));
    if (this.phase === "playing") this.stream.deal(player);
    this.onChange();
    return player;
  }

  /** The smallest team still in the game. */
  private smallestTeam(): number {
    const sizes = this.teams.map((t) => (t.out ? Infinity : 0));
    for (const p of this.players.values()) sizes[p.team]!++;
    return sizes.indexOf(Math.min(...sizes));
  }

  byToken(token: unknown): LandPlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.onChange();
  }

  kick(playerId: string): LandPlayer | null {
    const p = this.roster.remove(playerId);
    if (p) {
      this.clearPlayerTimer(p);
      this.onChange();
    }
    return p;
  }

  private backToQuestions(p: LandPlayer): void {
    this.clearPlayerTimer(p);
    p.state = "question";
    p.readyAt = Math.max(p.readyAt, this.clock.now());
  }

  // ---------- questions ----------

  answer(playerId: string, seq: number, option: number): boolean {
    const p = this.players.get(playerId);
    if (!p || !p.current || this.phase !== "playing" || p.state !== "question") return false;
    const correct = this.stream.answer(p, seq, option);
    if (correct === null) return false;
    if (correct) p.claims++;
    if (++p.answered >= LAND_QUESTIONS_PER_ROUND) {
      p.answered = 0;
      if (p.claims === 0) {
        // The message starts once the ✗ flash is over.
        p.state = "empty";
        p.emptyEndsAt = p.readyAt + LAND_EMPTY_MS;
        p.timer = this.clock.setTimeout(() => this.endEmpty(p.id), p.emptyEndsAt - this.clock.now());
      } else if (this.canPlace(p)) {
        p.state = "claim";
      }
    }
    this.onActivity(p.id);
    return true;
  }

  private endEmpty(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.timer = null;
    if (p.state !== "empty") return;
    this.backToQuestions(p);
    this.onActivity(p.id);
  }

  // ---------- the land ----------

  costFor(team: number, tile: number): number | null {
    return placementCost(this.owners, this.size, this.starts, team, tile, LAND_STEAL_COST, LAND_GUARD_COST);
  }

  /** Whether the player can afford any tile at all. */
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
    if (!p || this.phase !== "playing" || p.state !== "claim" || this.clock.now() < p.readyAt) return false;
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
      this.onChange();
      return true;
    }
    if (!this.canPlace(p)) this.backToQuestions(p);
    // A capture changes everyone's board at once.
    if (this.lastCapture?.seq === this.eventSeq) this.onChange();
    else this.onActivity(p.id);
    return true;
  }

  /** Leave the land early; unused claims are kept. */
  done(playerId: string): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "playing" || p.state !== "claim") return false;
    this.backToQuestions(p);
    this.onActivity(p.id);
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

  /** Returns the tiles that changed hands. */
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

  // ---------- results ----------

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

  /** Teams by tiles, then correct answers; equal teams share a rank. Knocked-out teams come last, the first one out at the bottom. */
  rankedTeams(): (LandTeam & { rank: number; tiles: number; correct: number })[] {
    const withTotals = this.teams.map((t) => ({ ...t, tiles: this.teamTiles(t.index), correct: this.teamCorrect(t.index), rank: 0 }));
    const sorted = [...withTotals].sort(
      (a, b) => Number(a.out) - Number(b.out) || b.outOrder - a.outOrder || b.tiles - a.tiles || b.correct - a.correct || a.index - b.index,
    );
    sorted.forEach((t, i) => {
      const prev = sorted[i - 1];
      t.rank = prev && !t.out && !prev.out && prev.tiles === t.tiles && prev.correct === t.correct ? prev.rank : i + 1;
    });
    return sorted;
  }

  awards(): LandAwards {
    const best = (value: (p: LandPlayer) => number) => {
      const players = [...this.players.values()];
      const top = Math.max(0, ...players.map(value));
      return top > 0 ? { value: top, nicknames: players.filter((p) => value(p) === top).map((p) => p.nickname) } : null;
    };
    return { mostCorrect: best((p) => p.correct), topSettler: best((p) => p.placed), topSurrounder: best((p) => p.captured) };
  }

  // ---------- views ----------

  private remainingMs(): number {
    return this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.clock.now()) : 0;
  }

  private boardView(): LandBoard {
    return { size: this.size, owners: [...this.owners], starts: this.starts };
  }

  hostView(): HostLandState {
    const ranked = new Map(this.rankedTeams().map((t) => [t.index, t]));
    const players = [...this.players.values()];
    const playing = this.phase === "playing";
    return {
      kind: "land",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      remainingMs: this.remainingMs(),
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
          members: players
            .filter((p) => p.team === t.index)
            .map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, connected: p.connected, claiming: playing && p.state === "claim" })),
        };
      }),
      lastPlace: this.lastPlace,
      lastCapture: this.lastCapture,
      playerCount: players.length,
      awards: this.phase === "podium" ? this.awards() : null,
      errors: this.phase === "podium" ? this.stream.errors() : null,
      hasResults: this.phase === "podium",
    };
  }

  playerView(playerId: string): PlayerLandView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const now = this.clock.now();
    const playing = this.phase === "playing";
    const state: LandState = playing ? p.state : "question";
    let result: PlayerLandView["result"] = null;
    if (this.phase === "podium") {
      const mine = this.rankedTeams().find((t) => t.index === p.team)!;
      const a = this.awards();
      result = {
        teamRank: mine.rank,
        teamCount: this.teams.length,
        tiles: mine.tiles,
        won: mine.rank === 1,
        awards: [
          ...(a.mostCorrect?.nicknames.includes(p.nickname) ? ["Most correct answers"] : []),
          ...(a.topSettler?.nicknames.includes(p.nickname) ? ["Top settler"] : []),
          ...(a.topSurrounder?.nicknames.includes(p.nickname) ? ["Master surrounder"] : []),
        ],
      };
    }
    return {
      kind: "land",
      phase: this.phase,
      title: this.title,
      remainingMs: this.remainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, placed: p.placed, stolen: p.stolen },
      team: teamInfo(p.team),
      teamTiles: this.teamTiles(p.team),
      state,
      claims: p.claims,
      answered: p.answered,
      emptyMs: state === "empty" ? Math.max(0, p.emptyEndsAt - now) : 0,
      question: playing && state === "question" ? this.stream.questionView(p) : null,
      feedback: this.stream.feedbackView(p),
      board: playing && state === "claim" ? this.boardView() : null,
      conquered: p.conquered,
      result,
    };
  }
}
