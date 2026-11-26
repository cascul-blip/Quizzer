import type { SampleSet, Zone } from "./samples/manifest.ts";
import { SAMPLE_SETS } from "./samples/manifest.ts";

type Ctx = BaseAudioContext;

interface Voice {
  set?: string;
  // why: Match the synth voice levels so arrangements keep their mix when samples take over.
  level: number;
  ring: number;
  release: number;
  attack?: number;
}

export const VOICES: Record<string, Voice> = {
  piano: { level: 0.75, ring: 0.9, release: 0.35 },
  strings: { level: 0.73, ring: 0, release: 0.2 },
  pad: { set: "strings", level: 0.41, ring: 0, release: 0.5, attack: 0.3 },
  brass: { level: 0.67, ring: 0, release: 0.12 },
  flute: { level: 0.69, ring: 0, release: 0.1 },
  organ: { level: 0.41, ring: 0, release: 0.12 },
  pluck: { level: 0.43, ring: 0.8, release: 0.3 },
  bell: { level: 0.34, ring: 1.6, release: 0.4 },
  bass: { level: 1.18, ring: 0.04, release: 0.08 },
  tribass: { level: 1.6, ring: 0.04, release: 0.08 },
  twang: { level: 0.44, ring: 0.35, release: 0.2 },
  nylon: { level: 0.5, ring: 0.7, release: 0.3 },
  steel: { level: 0.45, ring: 0.9, release: 0.3 },
  dulcimer: { level: 0.45, ring: 1.2, release: 0.4 },
  timpani: { level: 1.57, ring: 1, release: 0.3 },
  kick: { level: 1.58, ring: 0.5, release: 0.08 },
  taiko: { level: 2.16, ring: 1.2, release: 0.2 },
  snare: { level: 0.43, ring: 0.4, release: 0.08 },
  hat: { level: 0.1, ring: 0.2, release: 0.05 },
  clap: { level: 0.2, ring: 0.4, release: 0.08 },
  cymbal: { level: 0.52, ring: 2.5, release: 0.3 },
  woodblock: { level: 0.39, ring: 0.25, release: 0.05 },
};

const ACCENT_GAIN_FACTOR = 1.15;

const setOf = (inst: string): SampleSet | undefined => SAMPLE_SETS[VOICES[inst]?.set ?? inst];

export function urlsFor(inst: string): string[] {
  const set = VOICES[inst] && setOf(inst);
  if (!set) return [];
  return "zones" in set ? set.zones.map((z) => z.url) : [set.hit, set.accent];
}

let enabled = true;
export function setSamplesEnabled(on: boolean): void {
  enabled = on;
}

const bytes = new Map<string, Promise<ArrayBuffer | null>>();
const buffers = new WeakMap<Ctx, Map<string, AudioBuffer | null>>();
const decoding = new WeakMap<Ctx, Map<string, Promise<void>>>();

type Fetcher = (url: string) => Promise<ArrayBuffer>;
const fromNetwork: Fetcher = (url) => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))));

function download(url: string, get: Fetcher): Promise<ArrayBuffer | null> {
  let p = bytes.get(url);
  if (!p) bytes.set(url, (p = get(url).catch(() => null)));
  return p;
}

// why: Prefetch before the browser lets a user gesture unlock the context for decoding.
export function prefetchSamples(instruments: Iterable<string>, get: Fetcher = fromNetwork): void {
  for (const inst of instruments) for (const url of urlsFor(inst)) void download(url, get);
}

// why: The promise resolves even on decode failure so a missing recording cannot block playback.
export function loadSamples(ctx: Ctx, instruments: Iterable<string>, get: Fetcher = fromNetwork): Promise<void> {
  let done = buffers.get(ctx);
  if (!done) buffers.set(ctx, (done = new Map()));
  let pending = decoding.get(ctx);
  if (!pending) decoding.set(ctx, (pending = new Map()));
  const all: Promise<void>[] = [];
  for (const inst of instruments) {
    for (const url of urlsFor(inst)) {
      let p = pending.get(url);
      if (!p) {
        const map = done;
        p = download(url, get)
          .then((data) => (data ? ctx.decodeAudioData(data.slice(0)) : null))
          .then(
            (buf) => void map.set(url, buf),
            () => void map.set(url, null),
          );
        pending.set(url, p);
      }
      all.push(p);
    }
  }
  return Promise.all(all).then(() => {});
}

// why: Wait for the whole instrument’s recordings to avoid alternating recorded and synthesized timbres.
export function samplesReady(ctx: Ctx, inst: string): boolean {
  const done = buffers.get(ctx);
  const urls = urlsFor(inst);
  return !!done && urls.length > 0 && urls.every((u) => done.get(u));
}

export function nearestZone(zones: Zone[], midi: number): Zone {
  let best = zones[0]!;
  for (const z of zones) if (Math.abs(z.root - midi) < Math.abs(best.root - midi)) best = z;
  return best;
}

const midiOf = (freq: number) => 69 + 12 * Math.log2(freq / 440);

// why: Returning false asks the caller to synthesize the note while samples are disabled, absent, or loading.
export function playSample(ctx: Ctx, dest: AudioNode, inst: string, t: number, freq: number, len: number, vol: number, detune = 0, accent = false): boolean {
  const voice = VOICES[inst];
  const set = setOf(inst);
  if (!enabled || !voice || !set || !samplesReady(ctx, inst)) return false;
  const done = buffers.get(ctx)!;
  const src = ctx.createBufferSource();
  let level = vol * voice.level;
  if ("zones" in set) {
    const zone = nearestZone(set.zones, midiOf(freq));
    src.buffer = done.get(zone.url)!;
    src.playbackRate.value = 2 ** ((midiOf(freq) - zone.root) / 12);
  } else {
    src.buffer = done.get(accent ? set.accent : set.hit)!;
    if (accent) level *= ACCENT_GAIN_FACTOR;
  }
  src.detune.value = detune;
  const g = ctx.createGain();
  const { ring: ringS, attack: attackS, release: releaseS } = voice;
  const ringEndS = t + len + ringS;
  if (attackS) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + Math.min(attackS, len * 0.5));
  } else {
    g.gain.setValueAtTime(level, t);
  }
  g.gain.setValueAtTime(level, ringEndS);
  g.gain.setTargetAtTime(0, ringEndS, releaseS / 4);
  src.connect(g).connect(dest);
  src.start(t);
  src.stop(ringEndS + releaseS);
  return true;
}
