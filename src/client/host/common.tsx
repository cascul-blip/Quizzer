import { useState } from "preact/hooks";
import type { HostMsg } from "../../shared/protocol.ts";
import { musicEnabled, musicVolume, setMusicEnabled, setMusicVolume } from "../shared/music/index.ts";
import { isMuted, setMuted } from "../shared/sounds.ts";
import { setVoiceEnabled, voiceEnabled } from "../shared/voice.ts";

export type Send = (m: HostMsg) => void;

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

/** Music, voice, mute and fullscreen buttons for the projector's top bar. `voice` shows the announcer toggle (modes that speak). */
export function ScreenControls({ voice = false }: { voice?: boolean } = {}) {
  const [muted, setMutedState] = useState(isMuted());
  const [musicOn, setMusicOn] = useState(musicEnabled());
  const [volume, setVolume] = useState(musicVolume());
  const [voiceOn, setVoiceOn] = useState(voiceEnabled());
  return (
    <>
      <div class={`music-ctl ${musicOn ? "" : "off"}`}>
        <button
          class="icon-btn"
          title={musicOn ? "Turn music off" : "Turn music on"}
          aria-label={musicOn ? "Turn music off" : "Turn music on"}
          aria-pressed={musicOn}
          onClick={() => {
            setMusicEnabled(!musicOn);
            setMusicOn(!musicOn);
          }}
        >
          🎵
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          aria-label="Music volume"
          title="Music volume"
          disabled={!musicOn}
          onInput={(e) => {
            const v = Number(e.currentTarget.value);
            setMusicVolume(v);
            setVolume(v);
          }}
        />
      </div>
      {voice && (
        <button
          class={`icon-btn voice-btn ${voiceOn ? "" : "off"}`}
          title={voiceOn ? "Turn the announcer voice off" : "Turn the announcer voice on"}
          aria-label={voiceOn ? "Turn the announcer voice off" : "Turn the announcer voice on"}
          aria-pressed={voiceOn}
          onClick={() => {
            setVoiceEnabled(!voiceOn);
            setVoiceOn(!voiceOn);
          }}
        >
          🗣
        </button>
      )}
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
