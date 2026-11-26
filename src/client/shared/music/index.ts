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
    // why: storage unavailable: the setting just won't persist
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

// why: host only; also starts downloading the instrument recordings.
export async function loadCustomMusic(): Promise<void> {
  // why: ?music=synth plays every track with the synthesized voices, as before the recordings.
  const synth = new URLSearchParams(location.search).get("music") === "synth";
  setSamplesEnabled(!synth);
  if (!synth) prefetchSamples(Object.values(TRACKS).flatMap((t) => (usesSamples(t) ? [...instrumentsOf(t)] : [])));
  try {
    const res = await fetch("/api/music");
    if (res.ok) custom = (await res.json()).files ?? {};
  } catch {
    // why: Built-in music still works when the custom music list is unavailable.
  }
}

export interface MusicCue {
  track: MusicTrackId | null;
  // why: 0…1: faster tempo and extra layers as it rises.
  intensity?: number;
  /** why: Ramp from `intensity` up to `rampTo` over `rampMs` (e.g. a countdown getting tense). */
  rampTo?: number;
  rampMs?: number;
  /** why: Change this to restart the ramp (e.g. per question). */
  key?: string;
}

// why: crossfades when the track changes.
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
