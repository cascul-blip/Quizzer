import { keysOf } from "../../shared/keys-of.ts";
import type { GameMode, SharedOf } from "../../shared/mode-entries.ts";
import { SHARED_MODES } from "../../shared/mode-entries.ts";
import type { Pacing } from "../../shared/mode-views.ts";
import type { ModeSettingsMap, PlayerMsg } from "../../shared/protocol.ts";
import type { SeasonTheme } from "../../shared/themed-modes.ts";
import { isSeasonTheme } from "../../shared/themed-modes.ts";
import type { ClassicGame } from "./classic.ts";
import type { Clock } from "./common.ts";
import { GameError } from "./common.ts";
import type { CupGame } from "./cup.ts";
import type { DuelGame } from "./duel.ts";
import type { FightGame } from "./fight.ts";
import type { GiftGame } from "./gift.ts";
import type { LandGame } from "./land.ts";
import type { LobbyFacts } from "./lobby-facts.ts";
import type { MemoryGame } from "./memory.ts";
import type { RacerGame } from "./racer.ts";
import type { ResultsSheet } from "./results.ts";
import type { RobotGame } from "./robot.ts";
import type { SiegeGame } from "./siege.ts";
import type { SubGame } from "./submarine.ts";
import type { TowerGame } from "./tower.ts";

export interface ModeGame {
  classic: ClassicGame;
  tower: TowerGame;
  submarine: SubGame;
  fight: FightGame;
  robot: RobotGame;
  land: LandGame;
  racer: RacerGame;
  cup: CupGame;
  siege: SiegeGame;
  duel: DuelGame;
  gift: GiftGame;
  memory: MemoryGame;
}

export type LiveGame = ModeGame[GameMode];

type MsgTypeOf<M extends GameMode> = SharedOf<M>["msgTypes"][number];

type MsgModeMap = { [T in MsgTypeOf<GameMode>]: { [M in GameMode]: T extends MsgTypeOf<M> ? M : never }[GameMode] };

export function modeOfMsg(type: string): GameMode | undefined {
  const lists = (mode: GameMode): readonly string[] => SHARED_MODES[mode].msgTypes;
  return keysOf(SHARED_MODES).find((mode) => lists(mode).includes(type));
}

type ModeMsgType = keyof MsgModeMap;

export const EVERY_MSG_HAS_A_MODE: [Exclude<PlayerMsg["type"], "join" | "resume">] extends [ModeMsgType] ? true : never = true;

export type ModeMsg<M extends GameMode> = Extract<PlayerMsg, { type: { [T in ModeMsgType]: MsgModeMap[T] extends M ? T : never }[ModeMsgType] }>;

export type RawSettings = Readonly<Record<string, unknown>>;

export interface StartContext {
  clock?: Clock;
  rng?: () => number;
  dataDir: string;
  onChange: () => void;
  onActivity: (playerId: string) => void;
  onTick: () => void;
  onFinish: (game: LiveGame) => void;
}

export interface PacedGame {
  pacing: Pacing;
  setPacing(pacing: Pacing): void;
  next(): void;
  skip(): void;
}

type PacedFlag<M extends GameMode> = SharedOf<M>["flags"]["paced"];

type PacingOf<M extends GameMode> = [PacedFlag<M>] extends [true]
  ? (game: ModeGame[M]) => PacedGame
  : [PacedFlag<M>] extends [false]
    ? null
    : ((game: ModeGame[M]) => PacedGame) | null;

export interface FinishContext {
  dataDir: string;
  log: (message: string) => void;
}

export type ModeEntry<M extends GameMode> = SharedOf<M> & ServerModeEntry<M>;

interface ServerModeEntry<M extends GameMode> {
  lobbyControlError?(message: string): string;
  defaultSettings: ModeSettingsMap[M];
  /** why: throws GameError when the change isn't valid. */
  readSettings(raw: RawSettings, current: ModeSettingsMap[M]): ModeSettingsMap[M];
  /** why: the hub installs the returned game before activation so synchronous updates reach the new game. */
  start(lobby: LobbyFacts<M>, ctx: StartContext): { game: ModeGame[M]; log: string | null };
  pacing: PacingOf<M>;
  teams(settings: ModeSettingsMap[M]): number | null;
  viewBatch?(game: ModeGame[M], send: () => void): void;
  results(game: ModeGame[M]): ResultsSheet;
  finished?(game: ModeGame[M], ctx: FinishContext): void;
  /** why: "resend" makes the phone get its view again; throw GameError to report an error. */
  handle(game: ModeGame[M], playerId: string, msg: ModeMsg<M>): "resend" | void;
}

/** why: a message that still gets here past the compiler's check is a server bug. */
export function unhandled(msg: never): never {
  throw new Error(`No handler for phone message ${(msg as { type: string }).type}`);
}

export function handoffOptions({ clock, rng, onChange, onActivity, onFinish }: StartContext) {
  return { clock, rng, onChange, onActivity, onFinish };
}

export function pickTheme(value: unknown, current: SeasonTheme, mode: string): SeasonTheme {
  if (value === undefined) return current;
  if (!isSeasonTheme(value)) throw new GameError(`Unknown ${mode} theme`);
  return value;
}
