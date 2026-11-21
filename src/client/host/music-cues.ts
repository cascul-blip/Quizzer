import type { HostView } from "../../shared/protocol.ts";
import type { MusicCue } from "../shared/music/index.ts";
import { cueOf, lobbyEntryOf } from "./modes.tsx";

/** The selected mode's lobby track or the active mode's gameplay cue. */
export function musicFor(view: HostView | null): MusicCue {
  if (!view || view.kind === "idle") return { track: null };
  if (view.phase === "lobby") return { track: lobbyEntryOf(view.mode).lobbyTrack(view.settings[view.mode]) };
  return cueOf(view);
}
