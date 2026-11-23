import type { AnswerValue } from "../../shared/answer-match.ts";
import { answerOf } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { randomAvatar } from "../../shared/avatars.ts";
import { gingerbreadTerrain } from "../../shared/fight-ground.ts";
import type { HillHeight, ShotImpact } from "../../shared/fight-physics.ts";
import { carve, HILL_HEIGHTS, launchVector, makeTerrain, simulate } from "../../shared/fight-physics.ts";
import { keysOf } from "../../shared/keys-of.ts";
import type {
  FightAwards,
  FightEvent,
  FightOutcome,
  FightPhase,
  FightSettings,
  FightShot,
  FightState,
  HostFightState,
  PlayerFightView,
} from "../../shared/modes/fight.ts";
import { CORRECT_PER_DECISION, DECISION_MS, FIGHT_MAX_DAMAGE, fightShared, HILL_SETTINGS, REPAIR_MS } from "../../shared/modes/fight.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import type { SeasonTheme } from "../../shared/themed-modes.ts";
import { modeTheme, THEMED_MODES } from "../../shared/themed-modes.ts";
import type { Clock } from "./common.ts";
import { GameError, realClock, teamInfo } from "./common.ts";
import type { LobbyChoices, LobbyFacts } from "./lobby-facts.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, pickTheme, unhandled } from "./mode-entry.ts";
import { PhaseTimer } from "./phase-timer.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { accuracy, sheet } from "./results.ts";
import type { BasePlayer } from "./roster.ts";
import { Roster } from "./roster.ts";
import type { AnswerTotals } from "./stream.ts";
import { QuestionStream } from "./stream.ts";

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

interface FightTeam {
  index: number;
  name: string;
  color: string;
  damage: number;
}

export interface FightPlayer extends BasePlayer, AnswerTotals {
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
}

interface Shot extends Omit<FightShot, "elapsedMs"> {
  firedAt: number;
}

interface FightOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: FightGame) => void;
}

interface FightGameSettings extends FightSettings {
  shuffleAnswers: boolean;
  /** Longer waits for wrong answers in a row (the lobby's "Protect from abuse"). */
  protect?: boolean;
}

/** Tower Fight: Red vs Blue answer at their own pace; every 4 correct answers they attack the enemy tower or repair their own. */
export class FightGame {
  readonly runningMode = "fight" as const;
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly teams: FightTeam[];
  readonly hill: HillHeight;
  readonly theme: SeasonTheme;
  readonly roster = new Roster<FightPlayer>();
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
  private readonly phases: PhaseTimer<FightPhase>;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: FightGame) => void;

  constructor(quiz: Quiz, settings: FightGameSettings, opts: FightOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.theme = modeTheme("fight", settings.theme);
    this.questions = quiz.questions;
    this.teams = Array.from({ length: TEAM_COUNT }, (_, i) => ({ ...teamInfo(i), damage: 0 }));
    this.clock = opts.clock ?? realClock;
    this.phases = new PhaseTimer(this.clock, "countdown");
    this.rng = opts.rng ?? Math.random;
    const heights = keysOf(HILL_HEIGHTS);
    this.hill = settings.hill === "random" ? heights[Math.min(heights.length - 1, Math.floor(this.rng() * heights.length))]! : settings.hill;
    this.terrain = this.theme === "christmas" ? gingerbreadTerrain(this.hill) : makeTerrain(this.hill, this.rng);
    this.stream = new QuestionStream(quiz.questions, settings.shuffleAnswers, this.rng, this.clock, settings.protect);
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  /** Take over a lobby's players (same ids and tokens), split Red/Blue as shown in the lobby. */
  /** What the lobby chose at Start; the next lobby opens with it. */
  choices!: LobbyChoices;

  static fromLobby(lobby: LobbyFacts<"fight">, opts: FightOptions = {}): FightGame {
    const game = new FightGame(lobby.quiz, { ...lobby.settings, shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect }, opts);
    const players = [...lobby.players];
    const teams = lobby.teams;
    game.choices = lobby.choices;
    game.roster.adoptFrom(players, (base) => game.newPlayer(base, teams.get(base.id) ?? 0));
    return game;
  }

  get phase(): FightPhase {
    return this.phases.phase;
  }

  get players(): Map<string, FightPlayer> {
    return this.roster.players;
  }

  private newPlayer(base: BasePlayer, team: number): FightPlayer {
    return this.stream.registerPlayer({
      ...base,
      team,
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
    this.phases.enter("playing");
    for (const p of this.players.values()) this.stream.open(p);
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
    this.phases.dispose();
    this.phases.enter("podium");
    this.onFinish(this);
    this.onChange();
  }

  dispose(): void {
    this.phases.dispose();
  }

  /** A tower fell: play the collapse, then the podium. */
  private collapse(destroyed: number): void {
    this.outcome = { winner: this.teams.find((t) => t.index !== destroyed)!.index, reason: "destroyed" };
    for (const p of this.players.values()) this.clearPlayerTimer(p);
    this.phases.set("collapse", COLLAPSE_MS, () => this.finish());
    this.onChange();
  }

  /** Least damage wins; equal damage goes to the team with more correct answers; otherwise a draw. */
  judge(): FightOutcome {
    const [a, b] = this.teams as [FightTeam, FightTeam];
    const destroyed = this.teams.find((t) => t.damage >= FIGHT_MAX_DAMAGE);
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
    this.stream.openOnJoin(player, this.phase === "playing");
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
    if (this.roster.setConnected(playerId, connected)) this.onChange();
  }

  kick(playerId: string): FightPlayer | null {
    const p = this.roster.remove(playerId);
    if (p) {
      this.clearPlayerTimer(p);
      this.onChange();
    }
    return p;
  }

  /** Each player's decision, repair and result timer has its own slot on the phase timer. */
  private playerSlot(p: FightPlayer): string {
    return `player:${p.id}`;
  }

  private clearPlayerTimer(p: FightPlayer): void {
    this.phases.cancel(this.playerSlot(p));
  }

  private backToQuestions(p: FightPlayer): void {
    this.clearPlayerTimer(p);
    p.state = "question";
    p.shotId = null;
    this.stream.resume(p);
  }

  // ---------- questions ----------

  answer(playerId: string, seq: number, option: AnswerValue): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "playing" || p.state !== "question") return false;
    const correct = this.stream.answer(p, seq, option);
    if (correct === null) return false;
    if (correct && ++p.towardDecision >= CORRECT_PER_DECISION) {
      p.towardDecision = 0;
      if (this.teams[p.team]!.damage > 0) {
        p.state = "decide";
        p.deadline = this.clock.now() + DECISION_MS;
        this.phases.after(this.playerSlot(p), DECISION_MS + DECISION_GRACE_MS, () => this.forfeit(p.id));
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
    if (!p || p.state !== "decide") return;
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
      this.phases.after(this.playerSlot(p), REPAIR_MS, () => this.finishRepair(p.id));
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
    if (!p || this.phase !== "playing" || p.state !== "repair") return;
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
    this.phases.after(`shot:${shot.id}`, flight.durationMs, () => this.land(shot));
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
      target.damage = Math.min(FIGHT_MAX_DAMAGE, target.damage + 1);
      if (p) {
        if (impact.team === shot.team) p.friendlyHits++;
        else p.hits++;
      }
      this.log(impact.team === shot.team ? "friendly" : "hit", p ?? shot);
      if (target.damage >= FIGHT_MAX_DAMAGE) destroyed = target.index;
    } else {
      if (impact.kind === "ground") this.terrain = carve(this.terrain, impact.x);
      this.log("miss", p ?? shot);
    }
    if (p && p.shotId === shot.id) {
      this.phases.after(this.playerSlot(p), RESULT_MS, () => {
        if (p.state === "watch" && p.shotId === shot.id) {
          this.backToQuestions(p);
          this.onActivity(p.id);
        }
      });
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
      theme: this.theme,
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      phaseRemainingMs: this.phases.remainingMs(),
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
      errors: this.stream.errorsWhen(this.phase === "podium"),
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
      theme: this.theme,
      phase: this.phase,
      title: this.title,
      hill: this.hill,
      phaseRemainingMs: this.phases.remainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, hits: p.hits, rebuilds: p.rebuilds },
      team: teamInfo(p.team),
      teams: this.teams.map((t) => teamInfo(t.index)),
      state,
      towardDecision: p.towardDecision,
      decisionMs: state === "decide" ? Math.max(0, p.deadline - now) : 0,
      repairMs: state === "repair" ? Math.max(0, p.repairEndsAt - now) : 0,
      lastRepair: p.lastRepair,
      ...this.stream.fragment(p, playing, playing && state === "question"),
      damage: this.teams.map((t) => t.damage),
      terrain: this.terrain,
      shot: shot ? this.shotView(shot, now) : null,
      result,
    };
  }
}

/** Tower Fight: one row per player, winning team first. */
type FightResultRow = { team: FightGame["teams"][number]; result: string; p: FightPlayer };

const FIGHT_COLUMNS: Column<FightResultRow>[] = [
  { header: "Team", value: (r) => r.team.name },
  { header: "Result", value: (r) => r.result },
  { header: "Tower damage", value: (r) => r.team.damage },
  { header: "Nickname", value: (r) => r.p.nickname },
  { header: "Correct", value: (r) => r.p.correct },
  { header: "Wrong", value: (r) => r.p.wrong },
  { header: "Accuracy %", value: (r) => accuracy(r.p) },
  { header: "Shots", value: (r) => r.p.shots },
  { header: "Enemy hits", value: (r) => r.p.hits },
  { header: "Friendly hits", value: (r) => r.p.friendlyHits },
  { header: "Rebuilds", value: (r) => r.p.rebuilds },
];

export function buildFightResults(game: FightGame): ResultsSheet {
  const outcome = game.outcome ?? game.judge();
  const order = [...game.teams].sort((a, b) => Number(b.index === outcome.winner) - Number(a.index === outcome.winner) || a.index - b.index);
  const rows = order.flatMap((team) => {
    const result = outcome.winner === null ? "Draw" : team.index === outcome.winner ? "Won" : "Lost";
    return [...game.players.values()]
      .filter((p) => p.team === team.index)
      .sort((a, b) => b.hits - a.hits || b.correct - a.correct)
      .map((p) => ({ team, result, p }));
  });
  return sheet(FIGHT_COLUMNS, rows);
}

export const fightMode: ModeEntry<"fight"> = {
  ...fightShared,
  defaultSettings: { hill: "random", theme: THEMED_MODES.fight.default },
  readSettings(raw, current) {
    const hill = raw.hill as FightSettings["hill"] | undefined;
    if (hill !== undefined && !HILL_SETTINGS.includes(hill)) throw new GameError("Unknown hill height");
    const theme = pickTheme(raw.theme, modeTheme("fight", current.theme), "fight");
    return { ...current, hill: hill ?? current.hill, theme };
  },
  start(lobby, ctx) {
    const game = FightGame.fromLobby(lobby, handoffOptions(ctx));
    return { game, log: `${this.name} started with ${game.players.size} player(s), ${game.hill} hill` };
  },
  pacing: null,
  teams: () => 2,
  results: buildFightResults,
  handle(game, playerId, msg) {
    switch (msg.type) {
      case "fight.answer":
        return game.answer(playerId, Number(msg.seq), answerOf(msg)) ? undefined : "resend";
      case "fight.choose":
        return game.choose(playerId, msg.action) === null ? "resend" : undefined;
      case "fight.fire":
        return game.fire(playerId, Number(msg.dx), Number(msg.dy)) === null ? "resend" : undefined;
      default:
        return unhandled(msg);
    }
  },
};
