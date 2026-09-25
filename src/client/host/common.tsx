import { useState } from "preact/hooks";
import type { HostMsg } from "../../shared/protocol.ts";
import { isMuted, setMuted } from "../shared/sounds.ts";

export type Send = (m: HostMsg) => void;

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

/** Mute + fullscreen buttons for the projector's top bar. */
export function ScreenControls() {
  const [muted, setMutedState] = useState(isMuted());
  return (
    <>
      <button
        class="icon-btn"
        title={muted ? "Unmute sounds" : "Mute sounds"}
        aria-label={muted ? "Unmute sounds" : "Mute sounds"}
        onClick={() => {
          setMuted(!muted);
          setMutedState(!muted);
        }}
      >
        {muted ? "🔇" : "🔊"}
      </button>
      <button class="icon-btn" title="Fullscreen (F)" aria-label="Toggle fullscreen" onClick={toggleFullscreen}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </button>
    </>
  );
}
