import { keysOf } from "../../shared/keys-of.ts";
import type { SharedOf } from "../../shared/mode-entries.ts";
import { SHARED_MODES } from "../../shared/mode-entries.ts";
import type { Pacing } from "../../shared/mode-views.ts";
import type { GameMode, ModeSettingsMap, PlayerMsg } from "../../shared/protocol.ts";
import type { SeasonTheme } from "../../shared/season-theme.ts";
import { isSeasonTheme } from "../../shared/season-theme.ts";
import type { Clock } from "./common.ts";
import { GameError } from "./common.ts";
import type { CupGame } from "./cup.ts";
import type { DuelGame } from "./duel.ts";
import type { FightGame } from "./fight.ts";
import type { ClassicGame } from "./game.ts";
import type { GiftGame } from "./gift.ts";
import type { LandGame } from "./land.ts";
import type { LobbyFacts } from "./lobby-facts.ts";
import type { RacerGame } from "./racer.ts";
import type { RobotGame } from "./robot.ts";
import type { SiegeGame } from "./siege.ts";
import type { SubGame } from "./submarine.ts";
import type { TowerGame } from "./tower.ts";

/** The game that runs each game mode. */
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
}

/** The game the hub holds; its runningMode names its mode's entry in MODES. */
export type LiveGame = ModeGame[GameMode];

type MsgTypeOf<M extends GameMode> = SharedOf<M>["msgTypes"][number];

/** Each phone message type, mapped to the mode whose shared mode entry lists it. */
type MsgModeMap = { [T in MsgTypeOf<GameMode>]: { [M in GameMode]: T extends MsgTypeOf<M> ? M : never }[GameMode] };

function msgModes(): MsgModeMap {
  const map: Record<string, GameMode> = {};
  for (const mode of keysOf(SHARED_MODES)) for (const type of SHARED_MODES[mode].msgTypes) map[type] = mode;
  // Built from the same msgTypes tuples MsgModeMap is computed from.
  return map as MsgModeMap;
}

/** The game mode each phone message belongs to, from the shared mode entries; join and resume belong to every mode and stay with the hub. */
export const MSG_MODE = msgModes() satisfies Record<Exclude<PlayerMsg["type"], "join" | "resume">, GameMode>;

type ModeMsgType = keyof typeof MSG_MODE;

/** The phone messages of one game mode (of any mode, for GameMode). */
export type ModeMsg<M extends GameMode> = Extract<PlayerMsg, { type: { [T in ModeMsgType]: (typeof MSG_MODE)[T] extends M ? T : never }[ModeMsgType] }>;

export function isModeMsg(msg: { type: string }): msg is ModeMsg<GameMode> {
  return Object.hasOwn(MSG_MODE, msg.type);
}

/** Raw mode settings from the host, read by the mode's readSettings. */
export type RawSettings = Readonly<Record<string, unknown>>;

/** What a mode's game needs from the hub when the lobby hands its players over. */
export interface StartContext {
  clock?: Clock;
  dataDir: string;
  onChange: () => void;
  onActivity: (playerId: string) => void;
  /** High-frequency projector refresh (Kingdom Siege). */
  onTick: () => void;
  onFinish: (game: LiveGame) => void;
}

/** A game played question by question: the host sets its pacing and moves it on. */
export interface PacedGame {
  pacing: Pacing;
  setPacing(pacing: Pacing): void;
  next(): void;
  skip(): void;
}

type PacedFlag<M extends GameMode> = SharedOf<M>["flags"]["paced"];

/** A ModeEntry's pacing: a function in a paced mode, null in any other, and either when M is not one mode. */
type PacingOf<M extends GameMode> = [PacedFlag<M>] extends [true]
  ? (game: ModeGame[M]) => PacedGame
  : [PacedFlag<M>] extends [false]
    ? null
    : ((game: ModeGame[M]) => PacedGame) | null;

export interface FinishContext {
  dataDir: string;
  log: (message: string) => void;
}

/** Everything the server knows about one game mode, its shared mode entry included; the hub, lobby and handoff look it up in MODES instead of branching on the mode. */
export type ModeEntry<M extends GameMode> = SharedOf<M> & ServerModeEntry<M>;

/** What only the server knows about one game mode. */
interface ServerModeEntry<M extends GameMode> {
  /** Error text for a lobby control received after this game starts. */
  lobbyControlError?(message: string): string;
  defaultSettings: ModeSettingsMap[M];
  /** The host's change applied to the current settings; throws GameError when it isn't valid. */
  readSettings(raw: RawSettings, current: ModeSettingsMap[M]): ModeSettingsMap[M];
  /** Build the mode's game from the lobby, not started yet, and the line to log once it starts. */
  start(lobby: LobbyFacts<M>, ctx: StartContext): { game: ModeGame[M]; log: string | null };
  /** For a paced mode (its shared mode entry's flags), its game as a PacedGame: next, skip and pacing work, and the pacing carries over to the next lobby. Null otherwise; the compiler holds each entry to its flag. */
  pacing: PacingOf<M>;
  /** How many teams the lobby previews and assigns players to with these settings; null in a solo mode. */
  teams(settings: ModeSettingsMap[M]): number | null;
  resultsCsv(game: ModeGame[M]): string;
  /** After the results are saved. */
  finished?(game: ModeGame[M], ctx: FinishContext): void;
  /** One of the mode's phone messages; "resend" when the phone should get its view again. Throws GameError to report an error; the default case calls unhandled. */
  handle(game: ModeGame[M], playerId: string, msg: ModeMsg<M>): "resend" | void;
}

/** The default case of a mode's handle: the compiler checks every message is handled, and one that still gets here is a server bug. */
export function unhandled(msg: never): never {
  throw new Error(`No handler for phone message ${(msg as { type: string }).type}`);
}

/** The options every mode's fromLobby takes from the hub. */
export function handoffOptions({ clock, onChange, onActivity, onFinish }: StartContext) {
  return { clock, onChange, onActivity, onFinish };
}

/** A settings theme: kept as it is when not given, refused when it isn't a known look. */
export function pickTheme(value: unknown, current: SeasonTheme, mode: string): SeasonTheme {
  if (value === undefined) return current;
  if (!isSeasonTheme(value)) throw new GameError(`Unknown ${mode} theme`);
  return value;
}
