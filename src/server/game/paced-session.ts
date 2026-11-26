import type { AvatarChoice } from "../../shared/avatars.ts";
import { randomAvatar } from "../../shared/avatars.ts";
import type { Pacing } from "../../shared/mode-views.ts";
import type { Question } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { GameError, realClock } from "./common.ts";
import type { PacedAnswerer, PacedPhase } from "./paced-round.ts";
import { PacedRound } from "./paced-round.ts";
import { GameFinish } from "./phase-timer.ts";
import type { BasePlayer } from "./roster.ts";
import { Roster } from "./roster.ts";

interface HubCallbacks {
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: () => void;
}

interface PacedSessionOptions<P, Extra extends string, T> {
  clock?: Clock;
  rng?: () => number;
  initial: PacedPhase | Extra;
  pacing: Pacing;
  questions: () => readonly Question[];
  asked?: () => Iterable<P>;
  opensFrom?: readonly Extra[];
  afterReveal?: readonly Extra[];
  hideAutoCountdown?: boolean;
  settle: () => void;
  advance: () => void;
  cleanup?: () => void;
  podium?: { build: () => T; empty: () => T };
  hub: HubCallbacks;
}

// why: addPlayer and removePlayer don't broadcast, so the mode finishes its own clean-up and then calls changed(), left() or answered() once.
export class PacedSession<P extends BasePlayer & PacedAnswerer<unknown>, Extra extends string, T = never> {
  readonly paced: PacedRound<Extra | "podium">;
  readonly clock: Clock;
  readonly rng: () => number;
  private readonly roster = new Roster<P>();
  private readonly gameFinish: GameFinish<PacedPhase | Extra | "podium", T>;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private started = false;

  constructor(opts: PacedSessionOptions<P, Extra, T>) {
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    const onChange = opts.hub.onChange ?? (() => {});
    this.onChange = onChange;
    this.onActivity = opts.hub.onActivity ?? (() => onChange());
    const asked = opts.asked;
    this.paced = new PacedRound<Extra | "podium">(this.clock, {
      initial: opts.initial,
      pacing: opts.pacing,
      questions: opts.questions,
      asked: asked ?? (() => this.players.values()),
      opensFrom: opts.opensFrom,
      afterReveal: opts.afterReveal,
      hideAutoCountdown: opts.hideAutoCountdown,
      settle: opts.settle,
      advance: opts.advance,
      onChange,
    });
    this.gameFinish = new GameFinish<PacedPhase | Extra | "podium", T>(this.paced.phases, "podium", {
      cleanup: opts.cleanup,
      podium: opts.podium,
      onFinish: opts.hub.onFinish ?? (() => {}),
      onChange,
    });
  }

  get phase(): PacedPhase | Extra | "podium" {
    return this.paced.phase;
  }

  get pacing(): Pacing {
    return this.paced.pacing;
  }

  get players(): Map<string, P> {
    return this.roster.players;
  }

  get finished(): boolean {
    return this.gameFinish.finished;
  }

  get podium(): T {
    return this.gameFinish.podium;
  }

  adoptPlayers(players: Iterable<BasePlayer>, newPlayer: (base: BasePlayer) => P): void {
    this.roster.adoptFrom(players, newPlayer);
  }

  addPlayer(rawNickname: unknown, avatar: AvatarChoice | null | undefined, newPlayer: (base: BasePlayer) => P): P {
    if (this.finished) throw new GameError("This game has finished");
    return this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), newPlayer);
  }

  removePlayer(playerId: string): P | null {
    return this.roster.remove(playerId);
  }

  byToken(token: unknown): P | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    if (!this.roster.setConnected(playerId, connected)) return;
    if (connected) this.onChange();
    else this.left();
  }

  left(): void {
    if (!this.paced.closeIfAllAnswered()) this.onChange();
  }

  answered(playerId: string): void {
    if (!this.paced.closeIfAllAnswered()) this.onActivity(playerId);
  }

  changed(): void {
    this.onChange();
  }

  activity(playerId: string): void {
    this.onActivity(playerId);
  }

  start(begin: () => void): void {
    if (this.started) throw new GameError("The game has already started");
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    this.started = true;
    begin();
  }

  setPacing(pacing: Pacing): void {
    this.paced.setPacing(pacing);
    this.onChange();
  }

  end(): void {
    if (this.finished) return;
    if (this.phase === "open") this.paced.close();
    this.gameFinish.finish();
  }

  dispose(): void {
    this.paced.phases.dispose();
  }
}
