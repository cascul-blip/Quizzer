import type { AvatarChoice } from "./avatars.ts";
import type { GameMode, ProtocolOf } from "./mode-entries.ts";
import type { HostPlayer, Pacing, TeamInfo } from "./mode-views.ts";
import type { PatchOp } from "./view-patch.ts";

/** Consecutive correct answers needed before a 🔥 streak badge shows. */
export const STREAK_MIN = 4;

export interface ShuffleOptions {
  questions: boolean;
  answers: boolean;
}

/** Each team also has a shape, so teams can be told apart without relying on colour. */
type TeamShape = "circle" | "square" | "triangle" | "diamond" | "star" | "heart";

export const TEAMS = [
  { name: "Red", color: "#d81e3a", shape: "circle" },
  { name: "Blue", color: "#1f5ee0", shape: "square" },
  { name: "Yellow", color: "#f5c400", shape: "triangle" },
  { name: "Cyan", color: "#12b5cb", shape: "diamond" },
  { name: "Purple", color: "#7d3cc8", shape: "star" },
  { name: "Pink", color: "#f0559e", shape: "heart" },
] as const satisfies readonly { name: string; color: string; shape: TeamShape }[];
export const MAX_TEAMS = TEAMS.length;

export type PlayerMsg =
  /** avatar/accessory: the player's last pick, remembered on the phone (optional). */
  { type: "join"; nickname: string; avatar?: string; accessory?: string } | { type: "resume"; token: string } | ProtocolOf<GameMode>["msg"];

export type ModeSettingsMap = { [M in GameMode]: ProtocolOf<M>["settings"] };

export type ModeSettingsInput = { [M in GameMode]: ProtocolOf<M>["settingsInput"] };

export type ModeSettingsMsg = { [M in GameMode]: { type: "host.setModeSettings"; mode: M; settings: ModeSettingsInput[M] } }[GameMode];

export type HostMsg =
  | { type: "host.hello" }
  | { type: "host.open"; quizId: string }
  | { type: "host.start"; pacing: Pacing }
  | { type: "host.setPacing"; pacing: Pacing }
  | { type: "host.setShuffle"; questions: boolean; answers: boolean }
  | { type: "host.setProtect"; on: boolean }
  | { type: "host.setMode"; mode: GameMode }
  | ModeSettingsMsg
  | { type: "host.next" }
  | { type: "host.skip" }
  | { type: "host.kick"; playerId: string }
  | { type: "host.setTeam"; playerId: string; team: number }
  | { type: "host.end" }
  | { type: "host.close" }
  | { type: "host.setAddress"; address: string };

export type ClientMsg = PlayerMsg | HostMsg;

/** How many errors the final screen's "Show errors" table lists (rows are QuestionError, in mode-views.ts). */
export const ERRORS_SHOWN = 10;

export interface PlayerLobbyView {
  kind: "lobby";
  phase: "lobby";
  title: string;
  mode: GameMode;
  me: { id: string; nickname: string; avatar: AvatarChoice };
  playerCount: number;
  team: TeamInfo | null;
}

type GameplayHostView = ProtocolOf<GameMode>["hostView"];
type GameplayPlayerView = ProtocolOf<GameMode>["playerView"];
type GameplayPhase = (GameplayHostView | GameplayPlayerView)["phase"];

export type PlayerView =
  | { kind: "none"; game: null }
  | { kind: "none"; game: { title: string; phase: "lobby" | GameplayPhase } }
  | PlayerLobbyView
  | GameplayPlayerView;

export interface JoinInfo {
  url: string;
  qrSvg: string;
  address: string;
  addresses: { address: string; iface: string }[];
  port: number;
}

export interface HostLobbyView {
  kind: "lobby";
  phase: "lobby";
  mode: GameMode;
  settings: ModeSettingsMap;
  teams: (TeamInfo & { members: HostPlayer[] })[] | null;
  quiz: { id: string; title: string; questionCount: number };
  pacing: Pacing;
  shuffle: ShuffleOptions;
  /** Availability follows the shared mode entry’s protect flag. */
  protect: boolean;
  players: HostPlayer[];
}

export type HostView = { kind: "idle"; phase: "idle"; join: JoinInfo } | ((HostLobbyView | GameplayHostView) & { join: JoinInfo });

/** A gameplay view cannot publish the lobby phase. */
export type GameplayPhasesExcludeLobby = AssertTrue<"lobby" extends GameplayPhase ? false : true>;

type AssertTrue<T extends true> = T;

export type ServerMsg =
  /** First message on every connection. A new serverId means the server restarted (maybe with new code). */
  | { type: "hello"; serverId: string }
  | { type: "player.state"; view: PlayerView }
  /** Changes relative to the last view delivered on this connection, sent when smaller than a snapshot. */
  | { type: "player.patch"; ops: PatchOp[] }
  | { type: "host.state"; view: HostView }
  | { type: "joined"; token: string; playerId: string /** Question images of the quiz, to preload. */; images?: string[] }
  | { type: "kicked" }
  | { type: "resumeFailed" }
  | { type: "error"; message: string };
