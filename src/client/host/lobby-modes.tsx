import type { ComponentChildren, ComponentType } from "preact";
import type { MusicTrackId } from "../../shared/music-tracks.ts";
import type { GameMode, ModeSettingsMap } from "../../shared/protocol.ts";
import type { Send } from "./common.tsx";

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
