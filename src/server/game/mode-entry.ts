import type { GameMode, ModeSettingsMap, Pacing, PlayerMsg } from "../../shared/protocol.ts";
import { isSeasonTheme, type SeasonTheme } from "../../shared/season-theme.ts";
import { GameError, type Clock } from "./common.ts";
import type { CupGame } from "./cup.ts";
import type { DuelGame } from "./duel.ts";
import type { FightGame } from "./fight.ts";
import type { Game } from "./game.ts";
import type { GiftGame } from "./gift.ts";
import type { LandGame } from "./land.ts";
import type { RacerGame } from "./racer.ts";
import type { RobotGame } from "./robot.ts";
import type { SiegeGame } from "./siege.ts";
import type { SubGame } from "./submarine.ts";
import type { TowerGame } from "./tower.ts";

/** The game that runs each game mode. Classic runs in the lobby's own Game. */
export interface ModeGame {
  classic: Game;
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

/** The game mode each phone message belongs to; join and resume belong to every mode and stay with the hub. */
export const MSG_MODE = {
  answer: "classic",
  setAvatar: "classic",
  "tower.answer": "tower",
  "tower.drop": "tower",
  "sub.answer": "submarine",
  "sub.boost": "submarine",
  "sub.tap": "submarine",
  "fight.answer": "fight",
  "fight.choose": "fight",
  "fight.fire": "fight",
  "robot.answer": "robot",
  "robot.move": "robot",
  "gift.answer": "gift",
  "gift.tap": "gift",
  "land.answer": "land",
  "land.place": "land",
  "land.done": "land",
  "racer.lever": "racer",
  "racer.go": "racer",
  "racer.answer": "racer",
  "duel.answer": "duel",
  "cup.answer": "cup",
  "cup.pick": "cup",
  "siege.answer": "siege",
  "siege.place": "siege",
  "siege.upgrade": "siege",
  "siege.map": "siege",
} as const satisfies Record<Exclude<PlayerMsg["type"], "join" | "resume">, GameMode>;

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

export interface FinishContext {
  dataDir: string;
  log: (message: string) => void;
}

/** Everything the server knows about one game mode; the hub, lobby and handoff look it up in MODES instead of branching on the mode. */
export interface ModeEntry<M extends GameMode> {
  name: string;
  defaultSettings: ModeSettingsMap[M];
  /** The host's change applied to the current settings; throws GameError when it isn't valid. */
  readSettings(raw: RawSettings, current: ModeSettingsMap[M]): ModeSettingsMap[M];
  /** Build the mode's game from the lobby, not started yet, and the line to log once it starts. */
  start(lobby: Game, ctx: StartContext): { game: ModeGame[M]; log: string | null };
  /** For a mode played question by question, its game as a PacedGame: next, skip and pacing work, and the pacing carries over to the next lobby. Null otherwise. */
  pacing: ((game: ModeGame[M]) => PacedGame) | null;
  /** How many teams the lobby previews and assigns players to with these settings; null in a solo mode. */
  teams(settings: ModeSettingsMap[M]): number | null;
  /** Phones in the lobby show the mode's banner instead of the plain waiting screen (Kingdom Siege's castle). */
  lobbyBanner: boolean;
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
