import type { AnswerValue } from "../../shared/answer-match.ts";
import { answerOf } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { gingerbreadTerrain } from "../../shared/fight-ground.ts";
import type { HillHeight, ShotImpact } from "../../shared/fight-physics.ts";
import { carve, HILL_HEIGHTS, launchVector, makeTerrain, simulate } from "../../shared/fight-physics.ts";
import { keysOf } from "../../shared/keys-of.ts";
import type {
  FightAwardKey,
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
import { GameError, teamInfo } from "./common.ts";
import type { LobbyChoices, LobbyFacts } from "./lobby-facts.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, pickTheme, unhandled } from "./mode-entry.ts";
import type { Podium } from "./podium.ts";
import { buildPodium, emptyPodium } from "./podium.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { accuracy, sheet } from "./results.ts";
import type { BasePlayer } from "./roster.ts";
import { fewest, most } from "./standings.ts";
import type { AnswerTotals } from "./stream.ts";
import { StreamedSession } from "./streamed-session.ts";

export { FEEDBACK_MS } from "./stream.ts";

export const COUNTDOWN_MS = 3000;
const FIGHT_AWARD_VALUES: Record<FightAwardKey, (p: FightPlayer) => number> = {
  topGunner: (p) => p.hits,
  masterBuilder: (p) => p.rebuilds,
  mostCorrect: (p) => p.correct,
};
/** why: choices sent right at the deadline are still accepted this long after it. */
export const DECISION_GRACE_MS = 500;
export const RESULT_MS = 1500;
/** why: the destroyed tower's collapse plays this long before the podium. */
export const COLLAPSE_MS = 3500;
/** why: the host view keeps landed shots this long for impact effects. */
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
  deadline: number;
  shots: number;
  hits: number;
  friendlyHits: number;
  rebuilds: number;
  shotId: number | null;
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
  protect?: boolean;
}

export class FightGame {
  readonly runningMode = "fight" as const;
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly teams: FightTeam[];
  readonly hill: HillHeight;
  readonly theme: SeasonTheme;
  terrain: number[];
  outcome: FightOutcome | null = null;
  private shots: Shot[] = [];
  private shotSeq = 0;
  private events: FightEvent[] = [];
  private eventSeq = 0;
  private repairSeq = 0;

  private readonly session: StreamedSession<FightPlayer, FightPhase, Podium<FightTeam, FightPlayer, FightAwardKey>>;

  constructor(quiz: Quiz, settings: FightGameSettings, opts: FightOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.theme = modeTheme("fight", settings.theme);
    this.questions = quiz.questions;
    this.teams = Array.from({ length: TEAM_COUNT }, (_, i) => ({ ...teamInfo(i), damage: 0 }));
    this.session = new StreamedSession({
      questions: quiz.questions,
      shuffleAnswers: settings.shuffleAnswers,
      protect: settings.protect,
      clock: opts.clock,
      rng: opts.rng,
      countdownMs: COUNTDOWN_MS,
      inPlay: (phase) => phase === "playing",
      canAnswer: (p) => this.phase === "playing" && p.state === "question",
      cleanup: () => {
        this.outcome ??= this.judge();
      },
      podium: { build: () => this.buildPodium((this.outcome ??= this.judge())), empty: () => emptyPodium(fightShared.awards) },
      hub: { onChange: opts.onChange, onActivity: opts.onActivity, onFinish: () => opts.onFinish?.(this) },
    });
    const heights = keysOf(HILL_HEIGHTS);
    this.hill = settings.hill === "random" ? heights[Math.min(heights.length - 1, Math.floor(this.session.rng() * heights.length))]! : settings.hill;
    this.terrain = this.theme === "christmas" ? gingerbreadTerrain(this.hill) : makeTerrain(this.hill, this.session.rng);
  }

  get choices(): LobbyChoices {
    return this.session.choices;
  }

  static fromLobby(lobby: LobbyFacts<"fight">, opts: FightOptions = {}): FightGame {
    const game = new FightGame(lobby.quiz, { ...lobby.settings, shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect }, opts);
    const players = [...lobby.players];
    const teams = lobby.teams;
    game.session.adoptLobby({ players, choices: lobby.choices }, (base) => game.newPlayer(base, teams.get(base.id) ?? 0));
    return game;
  }

  get phase(): FightPhase {
    return this.session.phase;
  }

  get players(): Map<string, FightPlayer> {
    return this.session.players;
  }

  private newPlayer(base: BasePlayer, team: number): Omit<FightPlayer, keyof AnswerTotals> {
    return {
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
    };
  }

  start(): void {
    this.session.start(() => this.beginPlaying());
  }

  private beginPlaying(): void {
    if (this.phase !== "countdown") return;
    this.session.phases.enter("playing");
    for (const p of this.players.values()) this.session.stream.open(p);
    this.session.changed();
  }

  end(): void {
    if (this.session.finished) return;
    this.outcome ??= this.judge();
    this.session.end();
  }

  dispose(): void {
    this.session.dispose();
  }

  private collapse(destroyed: number): void {
    this.outcome = { winner: this.teams.find((t) => t.index !== destroyed)!.index, reason: "destroyed" };
    for (const p of this.players.values()) this.clearPlayerTimer(p);
    this.session.phases.set("collapse", COLLAPSE_MS, () => this.session.end());
    this.session.changed();
  }

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

  join(rawNickname: unknown, avatar?: AvatarChoice | null): FightPlayer {
    const player = this.session.addPlayer(rawNickname, avatar, (base) => this.newPlayer(base, this.smallestTeam()));
    this.session.changed();
    return player;
  }

  private smallestTeam(): number {
    const sizes = this.teams.map(() => 0);
    for (const p of this.players.values()) sizes[p.team]!++;
    return sizes.indexOf(Math.min(...sizes));
  }

  byToken(token: unknown): FightPlayer | null {
    return this.session.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    this.session.setConnected(playerId, connected);
  }

  kick(playerId: string): FightPlayer | null {
    const p = this.session.removePlayer(playerId);
    if (p) {
      this.clearPlayerTimer(p);
      this.session.changed();
    }
    return p;
  }

  private playerSlot(p: FightPlayer): string {
    return `player:${p.id}`;
  }

  private clearPlayerTimer(p: FightPlayer): void {
    this.session.phases.cancel(this.playerSlot(p));
  }

  private backToQuestions(p: FightPlayer): void {
    this.clearPlayerTimer(p);
    p.state = "question";
    p.shotId = null;
    this.session.stream.resume(p);
  }

  answer(playerId: string, seq: number, option: AnswerValue): boolean {
    const answered = this.session.answer(playerId, seq, option);
    if (!answered) return false;
    const { player: p, correct } = answered;
    if (correct && ++p.towardDecision >= CORRECT_PER_DECISION) {
      p.towardDecision = 0;
      if (this.teams[p.team]!.damage > 0) {
        p.state = "decide";
        p.deadline = this.session.clock.now() + DECISION_MS;
        this.session.phases.after(this.playerSlot(p), DECISION_MS + DECISION_GRACE_MS, () => this.forfeit(p.id));
      } else {
        // why: nothing to repair, so straight to the catapult (no time limit there).
        p.state = "aim";
      }
    }
    this.session.activity(p.id);
    return true;
  }

  private forfeit(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.state !== "decide") return;
    this.backToQuestions(p);
    this.session.activity(p.id);
  }

  choose(playerId: string, action: "attack" | "rebuild"): boolean | null {
    const p = this.players.get(playerId);
    if (!p || p.state !== "decide" || this.phase !== "playing" || this.session.clock.now() > p.deadline + DECISION_GRACE_MS) return null;
    if (action === "attack") {
      this.clearPlayerTimer(p);
      p.state = "aim";
    } else if (action === "rebuild") {
      if (this.teams[p.team]!.damage <= 0) return null;
      this.clearPlayerTimer(p);
      p.state = "repair";
      p.repairEndsAt = this.session.clock.now() + REPAIR_MS;
      this.session.phases.after(this.playerSlot(p), REPAIR_MS, () => this.finishRepair(p.id));
      this.session.changed();
      return true;
    } else {
      return null;
    }
    this.session.activity(p.id);
    return true;
  }

  /** why: fixes one damage, unless teammates already fixed the tower. */
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
    this.session.changed();
  }

  fire(playerId: string, dx: number, dy: number): FightShot | null {
    const p = this.players.get(playerId);
    if (!p || p.state !== "aim" || this.phase !== "playing") return null;
    const v = launchVector(dx, dy);
    if (!v) return null;
    const flight = simulate(this.terrain, p.team, v.vx, v.vy);
    const now = this.session.clock.now();
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
    this.session.phases.after(`shot:${shot.id}`, flight.durationMs, () => this.land(shot));
    this.session.activity(p.id);
    return this.shotView(shot, now);
  }

  /** why: damage or a crater lands now, so the screens and the score stay in step. */
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
      this.session.phases.after(this.playerSlot(p), RESULT_MS, () => {
        if (p.state === "watch" && p.shotId === shot.id) {
          this.backToQuestions(p);
          this.session.activity(p.id);
        }
      });
    }
    if (destroyed !== null) return this.collapse(destroyed);
    this.session.changed();
  }

  private log(kind: FightEvent["kind"], who: { nickname: string; team: number }): void {
    this.events.push({ seq: ++this.eventSeq, kind, nickname: who.nickname, team: who.team });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  private buildPodium(outcome: FightOutcome): Podium<FightTeam, FightPlayer, FightAwardKey> {
    const players = [...this.players.values()].sort((a, b) => b.hits - a.hits || b.correct - a.correct);
    return buildPodium({
      entries: this.teams,
      order: [most((t) => Number(t.index === outcome.winner))],
      then: [fewest((t) => t.index)],
      players,
      entryOf: (p) => this.teams[p.team]!,
      awards: { labels: fightShared.awards, values: FIGHT_AWARD_VALUES },
    });
  }

  get podium(): Podium<FightTeam, FightPlayer, FightAwardKey> {
    return this.session.podium;
  }

  private shotView(s: Shot, now = this.session.clock.now()): FightShot {
    const { firedAt, ...rest } = s;
    return { ...rest, elapsedMs: now - firedAt };
  }

  hostView(): HostFightState {
    const now = this.session.clock.now();
    const players = [...this.players.values()];
    const playing = this.phase === "playing";
    return {
      kind: "fight",
      theme: this.theme,
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      phaseRemainingMs: this.session.phases.remainingMs(),
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
      awards: this.phase === "podium" ? this.podium.awards : null,
      errors: this.session.stream.errorsWhen(this.phase === "podium"),
    };
  }

  playerView(playerId: string): PlayerFightView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const now = this.session.clock.now();
    const playing = this.phase === "playing";
    const state: FightState = playing ? p.state : "question";
    const shot = state === "watch" ? this.shots.find((s) => s.id === p.shotId) : undefined;
    let result: PlayerFightView["result"] = null;
    if (this.phase === "podium" && this.outcome) {
      result = { outcome: this.outcome, awards: this.podium.result(p.id)?.awards ?? [] };
    }
    return {
      kind: "fight",
      theme: this.theme,
      phase: this.phase,
      title: this.title,
      hill: this.hill,
      phaseRemainingMs: this.session.phases.remainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, hits: p.hits, rebuilds: p.rebuilds },
      team: teamInfo(p.team),
      teams: this.teams.map((t) => teamInfo(t.index)),
      state,
      towardDecision: p.towardDecision,
      decisionRemainingMs: state === "decide" ? Math.max(0, p.deadline - now) : 0,
      repairRemainingMs: state === "repair" ? Math.max(0, p.repairEndsAt - now) : 0,
      lastRepair: p.lastRepair,
      ...this.session.stream.fragment(p),
      damage: this.teams.map((t) => t.damage),
      terrain: this.terrain,
      shot: shot ? this.shotView(shot, now) : null,
      result,
    };
  }
}

type FightResultRow = { team: FightTeam; result: string; p: FightPlayer };

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
  const { places, rows } = game.podium;
  const draw = places.every((t) => t.place === 1);
  return sheet(
    FIGHT_COLUMNS,
    rows.flatMap(({ place, player: p }) => {
      const team = places.find((t) => t.index === p.team);
      return team ? [{ team, result: place !== 1 ? "Lost" : draw ? "Draw" : "Won", p }] : [];
    }),
  );
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
