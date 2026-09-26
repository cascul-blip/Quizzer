/**
 * Background music for the host/projector: one shared player, the host's
 * music settings (on/off + volume, remembered in this browser), custom
 * tracks from data/music/, and a useMusic() hook for screens.
 */
import { useEffect } from "preact/hooks";
import type { MusicTrackId } from "../../../shared/music-tracks.ts";
import { getAudioContext, isMuted, onMuteChange } from "../sounds.ts";
import { MusicPlayer } from "./engine.ts";
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
    // storage unavailable: the setting just won't persist
  }
}

let enabled = read(ON_KEY, "1") === "1";
let volume = Math.max(0, Math.min(1, Number(read(VOLUME_KEY, "0.7")) || 0));
let custom: Record<string, string> = {};

export const music = new MusicPlayer(getAudioContext, TRACKS, (id) => custom[id] ?? null);

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

/** Load the list of custom tracks in data/music/ (host only). */
export async function loadCustomMusic(): Promise<void> {
  try {
    const res = await fetch("/api/music");
    if (res.ok) custom = (await res.json()).files ?? {};
  } catch {
    // no custom music
  }
}

export interface MusicCue {
  track: MusicTrackId | null;
  /** 0…1 — faster tempo and extra layers as it rises. */
  intensity?: number;
  /** Ramp from `intensity` up to `rampTo` over `rampMs` (e.g. a countdown getting tense). */
  rampTo?: number;
  rampMs?: number;
  /** Change this to restart the ramp (e.g. per question). */
  key?: string;
}

/** Play a track for the current screen; crossfades when the track changes. */
export function useMusic(cue: MusicCue): void {
  useEffect(() => {
    music.play(cue.track);
    document.body.dataset.music = cue.track ?? ""; // handy for checking which track a screen uses
  }, [cue.track]);
  useEffect(() => {
    music.setIntensity(cue.intensity ?? 0, 600);
    if (cue.rampTo !== undefined && cue.rampMs) {
      const t = setTimeout(() => music.setIntensity(cue.rampTo!, cue.rampMs), 650);
      return () => clearTimeout(t);
    }
  }, [cue.key ?? "", cue.track, cue.rampTo === undefined ? Math.round((cue.intensity ?? 0) * 20) : -1]);
}
