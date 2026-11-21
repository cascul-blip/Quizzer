import type { HostView } from "../../shared/protocol.ts";
import type { MusicCue } from "../shared/music/index.ts";
import { cueOf } from "./modes.tsx";

/** Which track the projector should play for this screen, and how intense: the cue of the mode's entry (HOST_MODES). */
export function musicFor(view: HostView | null): MusicCue {
  if (!view || view.kind === "idle") return { track: null };
  return cueOf(view);
}
