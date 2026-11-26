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

type SessionPhase = "countdown" | "podium";

type NewPlayerState<P> = (base: BasePlayer) => Omit<P, keyof AnswerTotals>;

interface HubCallbacks {
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: () => void;
}

interface StreamedSessionOptions<P, Ph extends string, T> {
  questions: Question[];
  shuffleAnswers: boolean;
  protect?: boolean;
  clock?: Clock;
  rng?: () => number;
  countdownMs: number;
  minutes?: number;
  inPlay: (phase: Ph | SessionPhase) => boolean;
  canAnswer: (player: P) => boolean;
  cleanup?: () => void;
  podium: { build: () => T; empty: () => T };
  hub: HubCallbacks;
}

export class StreamedSession<P extends BasePlayer & AnswerTotals, Ph extends string, T = unknown> {
  readonly roster = new Roster<P>();
  readonly stream: QuestionStream<P>;
  readonly phases: PhaseTimer<Ph | SessionPhase>;
  readonly clock: Clock;
  readonly rng: () => number;
  choices!: LobbyChoices;
  private readonly gameFinish: GameFinish<Ph | SessionPhase, T>;
  private readonly gameLength: GameLengthClock<Ph | SessionPhase> | null;
  private readonly gameLengthMs: number;
  private readonly countdownMs: number;
  private readonly inPlay: (phase: Ph | SessionPhase) => boolean;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private started = false;

  constructor(opts: StreamedSessionOptions<P, Ph, T>) {
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    this.countdownMs = opts.countdownMs;
    this.inPlay = opts.inPlay;
    this.phases = new PhaseTimer<Ph | SessionPhase>(this.clock, "countdown", opts.countdownMs);
    this.stream = new QuestionStream<P>(opts.questions, opts.shuffleAnswers, this.rng, this.clock, {
      penalizeGuessing: opts.protect,
      canAnswer: opts.canAnswer,
    });
    const onChange = opts.hub.onChange ?? (() => {});
    this.onChange = onChange;
    this.onActivity = opts.hub.onActivity ?? (() => onChange());
    const onFinish = opts.hub.onFinish ?? (() => {});
    this.gameFinish = new GameFinish<Ph | SessionPhase, T>(this.phases, "podium", { cleanup: opts.cleanup, podium: opts.podium, onFinish, onChange });
    this.gameLength = opts.minutes === undefined ? null : new GameLengthClock(this.phases, this.gameFinish);
    this.gameLengthMs = (opts.minutes ?? 0) * 60_000;
  }

  get phase(): Ph | SessionPhase {
    return this.phases.phase;
  }

  get players(): Map<string, P> {
    return this.roster.players;
  }

  get podium(): T {
    return this.gameFinish.podium;
  }

  adoptLobby(lobby: { players: readonly BasePlayer[]; choices: LobbyChoices }, newPlayer: NewPlayerState<P>): void {
    this.choices = lobby.choices;
    this.roster.adoptFrom(lobby.players, (base) => this.register(base, newPlayer));
  }

  addPlayer(rawNickname: unknown, avatar: AvatarChoice | null | undefined, newPlayer: NewPlayerState<P>): P {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.register(base, newPlayer));
    this.stream.openOnJoin(player, this.inPlay(this.phase));
    return player;
  }

  private register(base: BasePlayer, newPlayer: NewPlayerState<P>): P {
    // checked: registerPlayer adds the AnswerTotals that newPlayer leaves out, so the result has every field of P.
    return this.stream.registerPlayer(newPlayer(base)) as P;
  }

  removePlayer(playerId: string): P | null {
    return this.roster.remove(playerId);
  }

  byToken(token: unknown): P | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    if (this.roster.setConnected(playerId, connected)) this.onChange();
  }

  answer(playerId: string, seq: number, value: AnswerValue): { player: P; correct: boolean } | null {
    const player = this.players.get(playerId);
    if (!player || this.phase === "podium") return null;
    const correct = this.stream.answer(player, seq, value);
    return correct === null ? null : { player, correct };
  }

  changed(): void {
    this.onChange();
  }

  activity(playerId: string): void {
    this.onActivity(playerId);
  }

  start(beginPlaying: () => void): void {
    if (this.started) throw new GameError("The game has already started");
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    this.started = true;
    this.phases.set("countdown", this.countdownMs, beginPlaying);
    this.onChange();
  }

  startGameLength(playing: Ph, atDeadline?: () => void): void {
    if (!this.gameLength) throw new GameError("This game has no game length");
    this.gameLength.start(playing, this.gameLengthMs, atDeadline);
  }

  get finished(): boolean {
    return this.gameFinish.finished;
  }

  end(): void {
    this.gameFinish.finish();
  }

  dispose(): void {
    this.phases.dispose();
  }
}
