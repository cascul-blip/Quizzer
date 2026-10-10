import {
  CORRECT_PER_DECISION,
  DECISION_MS,
  REPAIR_MS,
  TOWER_MAX_DAMAGE,
  type FightAwards,
  type FightEvent,
  type FightOutcome,
  type FightPhase,
  type FightSettings,
  type FightShot,
  type FightState,
  type HostFightState,
  type PlayerFightView,
} from "../../shared/protocol.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import { HILL_HEIGHTS, carve, launchVector, makeTerrain, simulate, type HillHeight, type ShotImpact } from "../../shared/fight-physics.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { GameError, realClock, teamInfo, type Clock } from "./common.ts";
import type { Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { QuestionStream, newStreamPlayer, type StreamPlayer } from "./stream.ts";

export { FEEDBACK_MS } from "./stream.ts";

export const COUNTDOWN_MS = 3000;
/** Late choices (sent right at the deadline) are still accepted this long after it. */
export const DECISION_GRACE_MS = 500;
/** After a shot lands, the thrower sees the result this long before questions come back. */
export const RESULT_MS = 1500;
/** The destroyed tower's collapse plays this long before the podium. */
export const COLLAPSE_MS = 3500;
/** Landed shots stay in the host view this long, for impact effects. */
const SHOT_LINGER_MS = 1500;
const MAX_EVENTS = 6;
const TEAM_COUNT = 2;

export interface FightTeam {
  index: number;
  name: string;
  color: string;
  damage: number;
}

export interface FightPlayer extends BasePlayer, StreamPlayer {
  team: number;
  towardDecision: number;
  state: FightState;
  /** When the current attack-or-rebuild choice runs out (aiming has no time limit). */
  deadline: number;
  shots: number;
  hits: number;
  friendlyHits: number;
  rebuilds: number;
  /** The shot this player is watching. */
  shotId: number | null;
  /** When the repair in progress finishes. */
  repairEndsAt: number;
  lastRepair: { seq: number; repaired: boolean } | null;
  timer: unknown;
}

interface Shot extends Omit<FightShot, "elapsedMs"> {
  firedAt: number;
}

export interface FightOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: FightGame) => void;
}

export interface FightGameSettings extends FightSettings {
  shuffleAnswers: boolean;
  /** Longer waits for wrong answers in a row (the lobby's "Protect from abuse"). */
  protect?: boolean;
}

/** Tower Fight: Red vs Blue answer at their own pace; every 4 correct answers they attack the enemy tower or repair their own. */
export class FightGame {
  readonly kind = "fight";
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly teams: FightTeam[];
  readonly settings: FightGameSettings;
  readonly hill: HillHeight;
  readonly roster = new Roster<FightPlayer>();
  readonly startedAt = new Date();
  phase: FightPhase = "countdown";
  phaseEndsAt = 0;
  terrain: number[];
  outcome: FightOutcome | null = null;
  private shots: Shot[] = [];
  private shotSeq = 0;
  private events: FightEvent[] = [];
  private eventSeq = 0;
  private repairSeq = 0;

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream;
  private timer: unknown = null;
  private readonly shotTimers = new Set<unknown>();
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: FightGame) => void;

  constructor(quiz: Quiz, settings: FightGameSettings, opts: FightOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.settings = settings;
    this.teams = Array.from({ length: TEAM_COUNT }, (_, i) => ({ ...teamInfo(i), damage: 0 }));
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    const heights = Object.keys(HILL_HEIGHTS) as HillHeight[];
    this.hill = settings.hill === "random" ? heights[Math.min(heights.length - 1, Math.floor(this.rng() * heights.length))]! : settings.hill;
    this.terrain = makeTerrain(this.hill, this.rng);
    this.stream = new QuestionStream(quiz.questions, settings.shuffleAnswers, this.rng, this.clock, settings.protect);
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  /** Take over a lobby's players (same ids and tokens), split Red/Blue as shown in the lobby. */
  static fromLobby(lobby: Game, opts: FightOptions = {}): FightGame {
    const game = new FightGame(lobby.quiz, { ...lobby.fight, shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect }, opts);
    const players = [...lobby.players.values()];
    const teams = lobby.teamAssignment();
    players.forEach((p) => {
      game.roster.adopt(game.newPlayer({ id: p.id, nickname: p.nickname, token: p.token, connected: p.connected, avatar: p.avatar }, teams.get(p.id) ?? 0));
    });
    return game;
  }

  get players(): Map<string, FightPlayer> {
    return this.roster.players;
  }

  private newPlayer(base: BasePlayer, team: number): FightPlayer {
    return {
      ...base,
      team,
      ...newStreamPlayer(),
      towardDecision: 0,
      state: "question",
      deadline: 0,
      shots: 0,
      hits: 0,
      friendlyHits: 0,
      rebuilds: 0,
      shotId: null,
      repairEndsAt: 0,
      lastRepair: null,
      timer: null,
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
    this.phase = "playing";
    this.phaseEndsAt = 0;
    for (const p of this.players.values()) if (!p.current) this.stream.deal(p);
    this.onChange();
  }

  /** Host ends the game: the least damaged tower wins. */
  end(): void {
    if (this.phase === "podium") return;
    this.outcome ??= this.judge();
    this.finish();
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
    for (const t of this.shotTimers) this.clock.clearTimeout(t);
    this.shotTimers.clear();
    for (const p of this.players.values()) this.clearPlayerTimer(p);
  }

  /** A tower fell: play the collapse, then the podium. */
  private collapse(destroyed: number): void {
    this.outcome = { winner: this.teams.find((t) => t.index !== destroyed)!.index, reason: "destroyed" };
    this.phase = "collapse";
    this.phaseEndsAt = this.clock.now() + COLLAPSE_MS;
    for (const p of this.players.values()) this.clearPlayerTimer(p);
    this.timer = this.clock.setTimeout(() => this.finish(), COLLAPSE_MS);
    this.onChange();
  }

  /** Least damage wins; equal damage goes to the team with more correct answers; otherwise a draw. */
  judge(): FightOutcome {
    const [a, b] = this.teams as [FightTeam, FightTeam];
    const destroyed = this.teams.find((t) => t.damage >= TOWER_MAX_DAMAGE);
    if (destroyed) return { winner: this.teams.find((t) => t !== destroyed)!.index, reason: "destroyed" };
    if (a.damage !== b.damage) return { winner: a.damage < b.damage ? a.index : b.index, reason: "damage" };
    const ca = this.teamCorrect(a.index);
    const cb = this.teamCorrect(b.index);
    if (ca !== cb) return { winner: ca > cb ? a.index : b.index, reason: "correct" };
    return { winner: null, reason: "draw" };
  }

  teamCorrect(team: number): number {
    let n = 0;
    for (const p of this.players.values()) if (p.team === team) n += p.correct;
    return n;
  }

  // ---------- players ----------

  join(rawNickname: unknown, avatar?: AvatarChoice | null): FightPlayer {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base, this.smallestTeam()));
    if (this.phase === "playing" || this.phase === "collapse") this.stream.deal(player);
    this.onChange();
    return player;
  }

  private smallestTeam(): number {
    const sizes = this.teams.map(() => 0);
    for (const p of this.players.values()) sizes[p.team]!++;
    return sizes.indexOf(Math.min(...sizes));
  }

  byToken(token: unknown): FightPlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.onChange();
  }

  kick(playerId: string): FightPlayer | null {
    const p = this.roster.remove(playerId);
    if (p) {
      this.clearPlayerTimer(p);
      this.onChange();
    }
    return p;
  }

  private clearPlayerTimer(p: FightPlayer): void {
    if (p.timer !== null) this.clock.clearTimeout(p.timer);
    p.timer = null;
  }

  private backToQuestions(p: FightPlayer): void {
    this.clearPlayerTimer(p);
    p.state = "question";
    p.shotId = null;
    p.readyAt = Math.max(p.readyAt, this.clock.now());
  }

  // ---------- questions ----------

  answer(playerId: string, seq: number, option: number): boolean {
    const p = this.players.get(playerId);
    if (!p || !p.current || this.phase !== "playing" || p.state !== "question") return false;
    const correct = this.stream.answer(p, seq, option);
    if (correct === null) return false;
    if (correct && ++p.towardDecision >= CORRECT_PER_DECISION) {
      p.towardDecision = 0;
      if (this.teams[p.team]!.damage > 0) {
        p.state = "decide";
        p.deadline = this.clock.now() + DECISION_MS;
        p.timer = this.clock.setTimeout(() => this.forfeit(p.id), DECISION_MS + DECISION_GRACE_MS);
      } else {
        // Nothing to repair: straight to the catapult, where there's no time limit.
        p.state = "aim";
      }
    }
    this.onActivity(p.id);
    return true;
  }

  /** Too slow to choose: the move is lost. */
  private forfeit(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.timer = null;
    if (p.state !== "decide") return;
    this.backToQuestions(p);
    this.onActivity(p.id);
  }

  // ---------- decisions ----------

  /** Returns whether the choice was taken. */
  choose(playerId: string, action: "attack" | "rebuild"): boolean | null {
    const p = this.players.get(playerId);
    if (!p || p.state !== "decide" || this.phase !== "playing" || this.clock.now() > p.deadline + DECISION_GRACE_MS) return null;
    if (action === "attack") {
      // The clock stops once they're at the catapult.
      this.clearPlayerTimer(p);
      p.state = "aim";
    } else if (action === "rebuild") {
      if (this.teams[p.team]!.damage <= 0) return null;
      // Repairing takes a while; the tower is fixed when it finishes.
      this.clearPlayerTimer(p);
      p.state = "repair";
      p.repairEndsAt = this.clock.now() + REPAIR_MS;
      p.timer = this.clock.setTimeout(() => this.finishRepair(p.id), REPAIR_MS);
      this.onChange();
      return true;
    } else {
      return null;
    }
    this.onActivity(p.id);
    return true;
  }

  /** The repair is done: fix one damage, unless teammates already fixed the tower. */
  private finishRepair(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.timer = null;
    if (this.phase !== "playing" || p.state !== "repair") return;
    const team = this.teams[p.team]!;
    const repaired = team.damage > 0;
    if (repaired) {
      team.damage--;
      p.rebuilds++;
      this.log("rebuild", p);
    }
    p.lastRepair = { seq: ++this.repairSeq, repaired };
    this.backToQuestions(p);
    this.onChange();
  }

  /** Launch the player's avatar with a slingshot pull. Returns the shot, or null if rejected. */
  fire(playerId: string, dx: number, dy: number): FightShot | null {
    const p = this.players.get(playerId);
    if (!p || p.state !== "aim" || this.phase !== "playing") return null;
    const v = launchVector(dx, dy);
    if (!v) return null;
    const flight = simulate(this.terrain, p.team, v.vx, v.vy);
    const now = this.clock.now();
    this.shots = this.shots.filter((s) => now - s.firedAt < s.durationMs + SHOT_LINGER_MS);
    const shot: Shot = {
      id: ++this.shotSeq,
      playerId: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      team: p.team,
      vx: v.vx,
      vy: v.vy,
      durationMs: flight.durationMs,
      impact: flight.impact,
      firedAt: now,
    };
    this.shots.push(shot);
    this.clearPlayerTimer(p);
    p.state = "watch";
    p.shotId = shot.id;
    p.shots++;
    const t = this.clock.setTimeout(() => {
      this.shotTimers.delete(t);
      this.land(shot);
    }, flight.durationMs);
    this.shotTimers.add(t);
    this.onActivity(p.id);
    return this.shotView(shot, now);
  }

  /** The shot arrives: damage or a crater now, so the screens and the score stay in step. */
  private land(shot: Shot): void {
    if (this.phase !== "playing") return;
    const p = this.players.get(shot.playerId);
    const impact: ShotImpact = shot.impact;
    let destroyed: number | null = null;
    if (impact.kind === "tower") {
      const target = this.teams[impact.team]!;
      target.damage = Math.min(TOWER_MAX_DAMAGE, target.damage + 1);
      if (p) {
        if (impact.team === shot.team) p.friendlyHits++;
        else p.hits++;
      }
      this.log(impact.team === shot.team ? "friendly" : "hit", p ?? shot);
      if (target.damage >= TOWER_MAX_DAMAGE) destroyed = target.index;
    } else {
      if (impact.kind === "ground") this.terrain = carve(this.terrain, impact.x);
      this.log("miss", p ?? shot);
    }
    if (p && p.shotId === shot.id) {
      this.clearPlayerTimer(p);
      p.timer = this.clock.setTimeout(() => {
        p.timer = null;
        if (p.state === "watch" && p.shotId === shot.id) {
          this.backToQuestions(p);
          this.onActivity(p.id);
        }
      }, RESULT_MS);
    }
    if (destroyed !== null) return this.collapse(destroyed);
    this.onChange();
  }

  private log(kind: FightEvent["kind"], who: { nickname: string; team: number }): void {
    this.events.push({ seq: ++this.eventSeq, kind, nickname: who.nickname, team: who.team });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  // ---------- results ----------

  awards(): FightAwards {
    const best = (value: (p: FightPlayer) => number) => {
      const players = [...this.players.values()];
      const top = Math.max(0, ...players.map(value));
      return top > 0 ? { value: top, nicknames: players.filter((p) => value(p) === top).map((p) => p.nickname) } : null;
    };
    return { topGunner: best((p) => p.hits), masterBuilder: best((p) => p.rebuilds), mostCorrect: best((p) => p.correct) };
  }

  // ---------- views ----------

  private remainingMs(): number {
    return this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.clock.now()) : 0;
  }

  private shotView(s: Shot, now = this.clock.now()): FightShot {
    const { firedAt, ...rest } = s;
    return { ...rest, elapsedMs: now - firedAt };
  }

  hostView(): HostFightState {
    const now = this.clock.now();
    const players = [...this.players.values()];
    const playing = this.phase === "playing";
    return {
      kind: "fight",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      phaseRemainingMs: this.remainingMs(),
      hill: this.hill,
      terrain: this.terrain,
      teams: this.teams.map((t) => ({
        index: t.index,
        name: t.name,
        color: t.color,
        damage: t.damage,
        repairing: playing && players.some((p) => p.team === t.index && p.state === "repair"),
        correct: this.teamCorrect(t.index),
        members: players
          .filter((p) => p.team === t.index)
          .map((p) => ({
            id: p.id,
            nickname: p.nickname,
            avatar: p.avatar,
            connected: p.connected,
            state: playing ? p.state : "question",
            hits: p.hits,
            rebuilds: p.rebuilds,
          })),
      })),
      shots: this.shots.filter((s) => now - s.firedAt < s.durationMs + SHOT_LINGER_MS).map((s) => this.shotView(s, now)),
      events: [...this.events],
      outcome: this.phase === "collapse" || this.phase === "podium" ? this.outcome : null,
      playerCount: players.length,
      awards: this.phase === "podium" ? this.awards() : null,
      errors: this.phase === "podium" ? this.stream.errors() : null,
      hasResults: this.phase === "podium",
    };
  }

  playerView(playerId: string): PlayerFightView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const now = this.clock.now();
    const playing = this.phase === "playing";
    const state: FightState = playing ? p.state : "question";
    const shot = state === "watch" ? this.shots.find((s) => s.id === p.shotId) : undefined;
    let result: PlayerFightView["result"] = null;
    if (this.phase === "podium" && this.outcome) {
      const a = this.awards();
      result = {
        outcome: this.outcome,
        awards: [
          ...(a.topGunner?.nicknames.includes(p.nickname) ? ["Top gunner"] : []),
          ...(a.masterBuilder?.nicknames.includes(p.nickname) ? ["Master builder"] : []),
          ...(a.mostCorrect?.nicknames.includes(p.nickname) ? ["Most correct answers"] : []),
        ],
      };
    }
    return {
      kind: "fight",
      phase: this.phase,
      title: this.title,
      phaseRemainingMs: this.remainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, hits: p.hits, rebuilds: p.rebuilds },
      team: teamInfo(p.team),
      teams: this.teams.map((t) => teamInfo(t.index)),
      state,
      towardDecision: p.towardDecision,
      decisionMs: state === "decide" ? Math.max(0, p.deadline - now) : 0,
      repairMs: state === "repair" ? Math.max(0, p.repairEndsAt - now) : 0,
      lastRepair: p.lastRepair,
      question: playing && state === "question" ? this.stream.questionView(p) : null,
      feedback: this.stream.feedbackView(p),
      damage: this.teams.map((t) => t.damage),
      terrain: this.terrain,
      shot: shot ? this.shotView(shot, now) : null,
      result,
    };
  }
}
