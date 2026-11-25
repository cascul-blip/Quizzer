import type { AnswerValue } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { randomAvatar } from "../../shared/avatars.ts";
import type { Question } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { GameError, realClock } from "./common.ts";
import type { LobbyChoices } from "./lobby-facts.ts";
import { GameFinish, GameLengthClock, PhaseTimer } from "./phase-timer.ts";
import type { BasePlayer } from "./roster.ts";
import { Roster } from "./roster.ts";
import type { AnswerTotals } from "./stream.ts";
import { QuestionStream } from "./stream.ts";

/** The phases every streamed game mode passes through; a mode may add its own. */
type StreamedPhase = "countdown" | "playing" | "podium";

/** How a new player's mode state is made from their identity; the session adds the answer totals. */
type NewPlayer<P> = (base: BasePlayer) => Omit<P, keyof AnswerTotals>;

/** The hub's callbacks, as a mode receives them. */
interface HubCallbacks {
  /** Something everyone may care about changed (phase, roster): push to every screen now. */
  onChange?: () => void;
  /** Only this player's state changed: push to them now, others soon. Falls back to onChange. */
  onActivity?: (playerId: string) => void;
  /** Hands the finished game to the hub. */
  onFinish?: () => void;
}

interface StreamedSessionOptions<P, T> {
  questions: Question[];
  shuffleAnswers: boolean;
  protect?: boolean;
  clock?: Clock;
  rng?: () => number;
  /** The game length; without it the session has no Game-length clock. */
  minutes?: number;
  canAnswer: (player: P) => boolean;
  cleanup?: () => void;
  podium: { build: () => T; empty: () => T };
  hub: HubCallbacks;
}

/**
 * The Streamed session (GLOSSARY.md): the parts every streamed game mode assembles, built together.
 * The mode still owns its join, kick and answer; each calls a step here, then does the mode's own work.
 */
export class StreamedSession<P extends BasePlayer & AnswerTotals, Ph extends string, T = unknown> {
  readonly roster = new Roster<P>();
  readonly stream: QuestionStream<P>;
  readonly phases: PhaseTimer<Ph>;
  readonly clock: Clock;
  readonly rng: () => number;
  private readonly gameFinish: GameFinish<Ph, T>;
  private readonly gameLength: GameLengthClock<Ph> | null;
  private readonly gameLengthMs: number;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private started = false;
  private lobbyChoices: LobbyChoices | null = null;

  constructor(opts: StreamedSessionOptions<P, T>) {
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    this.phases = new PhaseTimer<Ph>(this.clock, phase<Ph>("countdown"));
    this.stream = new QuestionStream<P>(opts.questions, opts.shuffleAnswers, this.rng, this.clock, {
      penalizeGuessing: opts.protect,
      canAnswer: opts.canAnswer,
    });
    const onChange = opts.hub.onChange ?? (() => {});
    this.onChange = onChange;
    this.onActivity = opts.hub.onActivity ?? (() => onChange());
    const onFinish = opts.hub.onFinish ?? (() => {});
    this.gameFinish = new GameFinish(this.phases, phase<Ph>("podium"), { cleanup: opts.cleanup, podium: opts.podium, onFinish, onChange });
    this.gameLength = opts.minutes === undefined ? null : new GameLengthClock(this.phases, this.gameFinish);
    this.gameLengthMs = (opts.minutes ?? 0) * 60_000;
  }

  get phase(): Ph {
    return this.phases.phase;
  }

  get players(): Map<string, P> {
    return this.roster.players;
  }

  /** The lobby's choices, handed back when the game closes ("Play again"). */
  get choices(): LobbyChoices {
    if (!this.lobbyChoices) throw new GameError("This game did not start from a lobby");
    return this.lobbyChoices;
  }

  /** The finished game's Podium (GLOSSARY.md), worked out once in Game finish. */
  get podium(): T {
    return this.gameFinish.podium;
  }

  /** Take over a lobby's players (same ids and tokens) and hold its choices. */
  adoptLobby(lobby: { players: readonly BasePlayer[]; choices: LobbyChoices }, newPlayer: NewPlayer<P>): void {
    this.lobbyChoices = lobby.choices;
    this.roster.adoptFrom(lobby.players, (base) => this.register(base, newPlayer));
  }

  join(rawNickname: unknown, avatar: AvatarChoice | null | undefined, newPlayer: NewPlayer<P>): P {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.register(base, newPlayer));
    this.stream.openOnJoin(player, this.phase === "playing");
    this.onChange();
    return player;
  }

  private register(base: BasePlayer, newPlayer: NewPlayer<P>): P {
    return this.stream.registerPlayer(newPlayer(base)) as P;
  }

  kick(playerId: string): P | null {
    const p = this.roster.remove(playerId);
    if (p) this.onChange();
    return p;
  }

  byToken(token: unknown): P | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    if (this.roster.setConnected(playerId, connected)) this.onChange();
  }

  /** Score an answer; null when it is refused. The mode applies its reward, then calls activity(). */
  answer(playerId: string, seq: number, value: AnswerValue): { player: P; correct: boolean } | null {
    const player = this.players.get(playerId);
    if (!player || this.phase === "podium") return null;
    const correct = this.stream.answer(player, seq, value);
    return correct === null ? null : { player, correct };
  }

  /** Something everyone may care about changed: push to every screen now. */
  changed(): void {
    this.onChange();
  }

  activity(playerId: string): void {
    this.onActivity(playerId);
  }

  /** Enter the countdown, then run `beginPlaying`. Refuses a second start and an empty roster. */
  start(countdownMs: number, beginPlaying: () => void): void {
    if (this.started) throw new GameError("The game has already started");
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    this.started = true;
    this.phases.set(phase<Ph>("countdown"), countdownMs, beginPlaying);
    this.onChange();
  }

  /** Enter the phase the game runs in for the game length; at the deadline the game ends, or `atDeadline` runs first. */
  startGameLength(playing: Ph, atDeadline?: () => void): void {
    if (!this.gameLength) throw new GameError("This game has no game length");
    this.gameLength.start(playing, this.gameLengthMs, atDeadline);
  }

  get finished(): boolean {
    return this.gameFinish.finished;
  }

  /** Finish the game now; later calls do nothing. */
  end(): void {
    this.gameFinish.finish();
  }

  /** Cancel every pending timer. */
  dispose(): void {
    this.phases.dispose();
  }
}

/** why: Ph is any phase union that includes the shared streamed phases, which TypeScript cannot express as a bound. */
const phase = <Ph extends string>(p: StreamedPhase): Ph => p as Ph;
