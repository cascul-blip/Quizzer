import type { ComponentChildren, ComponentType } from "preact";
import type { GameMode } from "../../shared/mode-entries.ts";
import type { MusicTrackId } from "../../shared/music-tracks.ts";
import type { ModeSettingsMap } from "../../shared/protocol.ts";
import type { Send } from "./common.tsx";

export type LobbySettingsProps<M extends GameMode> = {
  settings: ModeSettingsMap[M];
  send: Send;
  children?: ComponentChildren;
};

export interface LobbyModeEntry<M extends GameMode> {
  label(settings: ModeSettingsMap[M]): string;
  Settings: ComponentType<LobbySettingsProps<M>>;
  Preview?: ComponentType<{ settings: ModeSettingsMap[M] }>;
  lobbyTrack(settings: ModeSettingsMap[M]): MusicTrackId;
}
