import type { ComponentChildren, ComponentType } from "preact";
import type { MusicTrackId } from "../../shared/music-tracks.ts";
import type { GameMode, ModeSettingsMap } from "../../shared/protocol.ts";
import type { Send } from "./common.tsx";
import { cupLobby } from "./cup.tsx";
import { duelLobby } from "./duel.tsx";
import { fightLobby } from "./fight.tsx";
import { giftLobby } from "./gift.tsx";
import { landLobby } from "./land.tsx";
import { racerLobby } from "./racer.tsx";
import { robotLobby } from "./robot.tsx";
import { siegeLobby } from "./siege.tsx";
import { submarineLobby } from "./submarine.tsx";
import { towerLobby } from "./tower.tsx";

export type LobbySettingsProps<M extends GameMode> = {
  settings: ModeSettingsMap[M];
  send: Send;
  /** For a paced mode (MODE_FLAGS), the Pacing and Shuffle question order rows the lobby draws; the panel places them among its own. */
  children?: ComponentChildren;
};

/** The lobby's part of a mode's projector entry (HostModeEntry): what the lobby shows while the mode is selected. */
export interface LobbyModeEntry<M extends GameMode> {
  /** The mode's line in the lobby's Game mode menu, which a seasonal theme may decorate. */
  label(settings: ModeSettingsMap[M]): string;
  /** The mode's settings panel, including its hint text. */
  Settings: ComponentType<LobbySettingsProps<M>>;
  /** A picture of the game below the mode settings. */
  Preview?: ComponentType<{ settings: ModeSettingsMap[M] }>;
  /** The music the lobby plays while the mode is selected, which a seasonal theme may choose. */
  lobbyTrack(settings: ModeSettingsMap[M]): MusicTrackId;
}

/** Classic has no mode settings of its own: its panel is the shared rows. */
const classicLobby: LobbyModeEntry<"classic"> = {
  label: () => "Classic",
  Settings: ({ children }) => <>{children}</>,
  lobbyTrack: () => "classic-lobby",
};

/**
 * Every game mode's lobby part, in the order of the lobby's Game mode menu, with each mode's in src/client/host/<mode>.tsx.
 * HOST_MODES takes its entries' lobby parts from here; the lobby reads this record, which leaves out the stages, because
 * Classic's stage shows the lobby and importing HOST_MODES there would make an import cycle.
 */
export const LOBBY_MODES: { [M in GameMode]: LobbyModeEntry<M> } = {
  classic: classicLobby,
  tower: towerLobby,
  submarine: submarineLobby,
  fight: fightLobby,
  robot: robotLobby,
  land: landLobby,
  racer: racerLobby,
  gift: giftLobby,
  cup: cupLobby,
  siege: siegeLobby,
  duel: duelLobby,
};

/** The lobby part of a mode, to render with that same mode's settings. */
export function lobbyEntryOf(mode: GameMode): LobbyModeEntry<GameMode> {
  // The one place the per-mode types meet: the caller passes the settings of the mode it looked the entry up with.
  return LOBBY_MODES[mode] as LobbyModeEntry<GameMode>;
}
