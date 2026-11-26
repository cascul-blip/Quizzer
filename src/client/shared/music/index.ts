import { useEffect } from "preact/hooks";
import type { MusicTrackId } from "../../../shared/music-tracks.ts";
import { getAudioContext, isMuted, onMuteChange } from "../sounds.ts";
import { instrumentsOf, MusicPlayer, usesSamples } from "./engine.ts";
import { prefetchSamples, setSamplesEnabled } from "./samples.ts";
import { TRACKS } from "./tracks.ts";

const ON_KEY = "quizzer.music";
const VOLUME_KEY = "quizzer.musicVolume";

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // why: Keep the current setting in memory if storage is unavailable.
  }
}

let enabled = read(ON_KEY, "1") === "1";
let volume = Math.max(0, Math.min(1, Number(read(VOLUME_KEY, "0.7")) || 0));
let custom: Record<string, string> = {};

export const music = new MusicPlayer(
  getAudioContext,
  TRACKS,
  (id) =>
    // why: Existing uploads for the shared Christmas track still override the building music.
    custom[id] ?? (id === "tower-christmas-medley" ? custom["tower-christmas-play"] : undefined) ?? null,
);

function applyLevel(): void {
  music.setLevel(enabled && !isMuted() ? volume : 0);
}
applyLevel();
onMuteChange(applyLevel);

export const musicEnabled = () => enabled;
export const musicVolume = () => volume;

export function setMusicEnabled(on: boolean): void {
  enabled = on;
  write(ON_KEY, on ? "1" : "0");
  applyLevel();
}

export function setMusicVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  write(VOLUME_KEY, String(volume));
  applyLevel();
}

export async function loadCustomMusic(): Promise<void> {
  const synth = new URLSearchParams(location.search).get("music") === "synth";
  setSamplesEnabled(!synth);
  if (!synth) prefetchSamples(Object.values(TRACKS).flatMap((t) => (usesSamples(t) ? [...instrumentsOf(t)] : [])));
  try {
    const res = await fetch("/api/music");
    if (res.ok) custom = (await res.json()).files ?? {};
  } catch {
    // why: Built-in tracks remain available when the server cannot list overrides.
  }
}

export interface MusicCue {
  track: MusicTrackId | null;
  intensity?: number;
  rampTo?: number;
  rampMs?: number;
  // why: A new key restarts the ramp even when consecutive questions use the same track and intensity.
  key?: string;
}

export function useMusic(cue: MusicCue): void {
  useEffect(() => {
    music.play(cue.track);
    document.body.dataset.music = cue.track ?? ""; // why: lets tests and devtools see which track a screen uses
  }, [cue.track]);
  useEffect(() => {
    music.setIntensity(cue.intensity ?? 0, 600);
    if (cue.rampTo !== undefined && cue.rampMs) {
      const t = setTimeout(() => music.setIntensity(cue.rampTo!, cue.rampMs), 650);
      return () => clearTimeout(t);
    }
  }, [cue.key ?? "", cue.track, cue.rampTo === undefined ? Math.round((cue.intensity ?? 0) * 20) : -1]);
}
