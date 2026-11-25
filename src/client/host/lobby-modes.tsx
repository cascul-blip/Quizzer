import type { ComponentChildren, ComponentType } from "preact";
import type { GameMode } from "../../shared/mode-entries.ts";
import type { MusicTrackId } from "../../shared/music-tracks.ts";
import type { ModeSettingsMap } from "../../shared/protocol.ts";
import type { Send } from "./common.tsx";

export type LobbySettingsProps<M extends GameMode> = {
  settings: ModeSettingsMap[M];
  send: Send;
  /** For a paced mode (its shared mode entry's flags), the Pacing and Shuffle question order rows the lobby draws; the panel places them among its own. */
  children?: ComponentChildren;
};

/** The lobby's part of a mode's projector entry (HostModeEntry): what the lobby shows while the mode is selected. */
export interface LobbyModeEntry<M extends GameMode> {
  /** The mode's line in the lobby's Game mode menu, which a seasonal theme may decorate. */
  label(settings: ModeSettingsMap[M]): string;
  /** The mode's settings panel, including its hint text. */
  Settings: ComponentType<LobbySettingsProps<M>>;
  Preview?: ComponentType<{ settings: ModeSettingsMap[M] }>;
  /** The music the lobby plays while the mode is selected, which a seasonal theme may choose. */
  lobbyTrack(settings: ModeSettingsMap[M]): MusicTrackId;
}
