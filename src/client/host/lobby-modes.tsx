import type { ComponentChildren, ComponentType } from "preact";
import type { GameMode } from "../../shared/mode-entries.ts";
import type { MusicTrackId } from "../../shared/music-tracks.ts";
import type { ModeSettingsMap } from "../../shared/protocol.ts";
import type { Send } from "./common.tsx";

export type LobbySettingsProps<M extends GameMode> = {
  settings: ModeSettingsMap[M];
  send: Send;
  // why: the panel places these rows among its own.
  children?: ComponentChildren;
};

export interface LobbyModeEntry<M extends GameMode> {
  // why: a seasonal theme may decorate it.
  label(settings: ModeSettingsMap[M]): string;
  Settings: ComponentType<LobbySettingsProps<M>>;
  Preview?: ComponentType<{ settings: ModeSettingsMap[M] }>;
  // why: a seasonal theme may choose it.
  lobbyTrack(settings: ModeSettingsMap[M]): MusicTrackId;
}
