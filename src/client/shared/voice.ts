import type { VoiceLineId } from "../../shared/voice-lines.ts";
import { music } from "./music/index.ts";
import { getAudioContext, isMuted } from "./sounds.ts";
import cannotEvade from "./voice/cannot-evade.mp3";
import coldIsPatient from "./voice/coldispatient.mp3";
import fleshIsWeak from "./voice/flesh-is-weak.mp3";
import frostyAim from "./voice/frostyaim.mp3";

import lookWarm from "./voice/lookwarm.mp3";
import onlyMetalEndures from "./voice/only-metal-endures.mp3";
import targetsAcquired from "./voice/targets-acquired.mp3";
import thawOut from "./voice/thawout.mp3";

const CLIPS: Record<VoiceLineId, string> = {
  lookwarm: lookWarm,
  frostyaim: frostyAim,
  coldispatient: coldIsPatient,
  thawout: thawOut,
  "targets-acquired": targetsAcquired,
  "flesh-is-weak": fleshIsWeak,
  "only-metal-endures": onlyMetalEndures,
  "cannot-evade": cannotEvade,
};

const ON_KEY = "quizzer.voice";
const VOLUME = 1.1;
const VOICE_LINE_GAP_S = 0.15;

let enabled = (() => {
  try {
    return localStorage.getItem(ON_KEY) !== "0";
  } catch {
    return true;
  }
})();

export const voiceEnabled = () => enabled;

export function setVoiceEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(ON_KEY, on ? "1" : "0");
  } catch {
    // why: Keep the current voice setting in memory if storage is unavailable.
  }
}

// why: Preload bytes so first playback only has to decode, even if audio is still locked.
const downloadedClips = new Map<VoiceLineId, Promise<ArrayBuffer | null>>();
const decoded = new Map<VoiceLineId, AudioBuffer>();
let queuedVoiceEndS = 0;

function load(id: VoiceLineId): Promise<ArrayBuffer | null> {
  let p = downloadedClips.get(id);
  if (!p) {
    p = fetch(CLIPS[id])
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    downloadedClips.set(id, p);
  }
  return p;
}

export function preloadVoice(ids: VoiceLineId[]): void {
  for (const id of ids) void load(id);
}

export async function say(id: VoiceLineId): Promise<void> {
  const ctx = getAudioContext();
  if (!enabled || isMuted() || !ctx || ctx.state !== "running") return;
  let buf = decoded.get(id);
  if (!buf) {
    const raw = await load(id);
    if (!raw) return;
    try {
      // why: decodeAudioData detaches its input, so decode a copy and keep the download reusable.
      buf = await ctx.decodeAudioData(raw.slice(0));
    } catch {
      return;
    }
    decoded.set(id, buf);
  }
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  gain.gain.value = VOLUME;
  src.connect(gain).connect(ctx.destination);
  const at = Math.max(ctx.currentTime, queuedVoiceEndS);
  queuedVoiceEndS = at + buf.duration + VOICE_LINE_GAP_S;
  src.start(at);
  music.duck((queuedVoiceEndS - ctx.currentTime) * 1000);
}
