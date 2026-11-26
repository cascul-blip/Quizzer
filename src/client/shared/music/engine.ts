// why: Bars use space-separated note names (C4, Bb2), chords (C4+E4+G4), holds (-) and rests (.).
// Drums also accept x for a hit and o for an accent.

import type { Echo, RichBus, RichStyle } from "./rich.ts";
import { createEcho, createRichBus, humanize, panFor, richStyle, STRUM_S, tryPlayRich } from "./rich.ts";
import { loadSamples, tryPlaySample } from "./samples.ts";

type Instrument =
  | "kick"
  | "snare"
  | "hat"
  | "openhat"
  | "clap"
  | "tick"
  | "bass"
  | "tribass"
  | "lead"
  | "pulse"
  | "pad"
  | "pluck"
  | "bell"
  | "brass"
  | "organ"
  | "piano"
  | "strings"
  | "flute"
  | "twang"
  | "nylon"
  | "steel"
  | "dulcimer"
  | "whistle"
  | "jawharp"
  | "timpani"
  | "cymbal"
  | "woodblock"
  | "sonar"
  | "taiko"
  | "bubble"
  | "heart"
  | "chipnoise";

export const DRUMS = new Set<Instrument>([
  "kick",
  "snare",
  "hat",
  "openhat",
  "clap",
  "tick",
  "cymbal",
  "woodblock",
  "sonar",
  "taiko",
  "bubble",
  "heart",
  "chipnoise",
]);

export interface Layer {
  inst: Instrument;
  // why: Short layer patterns repeat across the full track, so an accompaniment can loop under a longer melody.
  bars: string[];
  vol?: number;
  // why: The lower bound is inclusive and the upper bound exclusive, so adjacent layers can hand off at the same intensity.
  from?: number;
  to?: number;
  echo?: number;
}

export interface Track {
  id: string;
  bpm: number;
  bars: number;
  stepsPerBar?: number;
  tempoBoost?: number;
  swing?: number;
  reverb?: number;
  rich?: boolean | RichStyle;
  samples?: boolean;
  layers: Layer[];
}

export const usesSamples = (track: Track): boolean => track.samples ?? richStyle(track.rich) !== "arcade";

export const STEPS_PER_BAR = 16;
export const stepsPerBar = (track: Track): number => track.stepsPerBar ?? STEPS_PER_BAR;

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteFreq(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  const semis = NOTE_INDEX[m[1]!]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
}

export function tokens(bar: string): string[] {
  return bar.trim().split(/\s+/);
}

type Ctx = BaseAudioContext;
const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();
const pulseWaves = new WeakMap<Ctx, PeriodicWave>();

function noise(ctx: Ctx): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, b);
  }
  return b;
}

function pulseWave25(ctx: Ctx): PeriodicWave {
  let w = pulseWaves.get(ctx);
  if (!w) {
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    w = ctx.createPeriodicWave(real, imag);
    pulseWaves.set(ctx, w);
  }
  return w;
}

function env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.setValueAtTime(Math.max(peak, 0.0002), t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

function osc(
  ctx: Ctx,
  dest: AudioNode,
  type: OscillatorType | "pulse",
  freq: number,
  t: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
  detune = 0,
) {
  const o = ctx.createOscillator();
  if (type === "pulse") o.setPeriodicWave(pulseWave25(ctx));
  else o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  const g = ctx.createGain();
  env(g, t, peak, attack, hold, release);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + hold + release + 0.05);
  return o;
}

function noiseHit(ctx: Ctx, dest: AudioNode, t: number, peak: number, dur: number, filter: BiquadFilterType, freq: number, q = 1) {
  const s = ctx.createBufferSource();
  s.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, 0.002, 0, dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

function playInstrument(ctx: Ctx, dest: AudioNode, inst: Instrument, t: number, freq: number, noteLengthS: number, vol: number, accent = false) {
  const v = vol * (accent ? 1.35 : 1);
  switch (inst) {
    case "kick": {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      const g = ctx.createGain();
      env(g, t, 0.9 * v, 0.003, 0.02, 0.22);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.3);
      return;
    }
    case "snare":
      noiseHit(ctx, dest, t, 0.45 * v, 0.16, "bandpass", 1900, 0.8);
      osc(ctx, dest, "triangle", 190, t, 0.3 * v, 0.002, 0.01, 0.08);
      return;
    case "clap":
      for (let i = 0; i < 3; i++) noiseHit(ctx, dest, t + i * 0.012, 0.3 * v, 0.1, "bandpass", 1500, 1.2);
      return;
    case "hat":
      return noiseHit(ctx, dest, t, 0.16 * v, 0.035, "highpass", 7500);
    case "openhat":
      return noiseHit(ctx, dest, t, 0.13 * v, 0.2, "highpass", 6500);
    case "chipnoise":
      return noiseHit(ctx, dest, t, 0.22 * v, 0.06, "highpass", 3000);
    case "cymbal":
      return noiseHit(ctx, dest, t, 0.14 * v, 1.2, "highpass", 5000);
    case "tick":
      osc(ctx, dest, "square", 2400, t, 0.08 * v, 0.001, 0.004, 0.02);
      return;
    case "woodblock":
      osc(ctx, dest, "triangle", freq || 880, t, 0.35 * v, 0.001, 0.005, 0.07);
      return;
    case "heart":
      osc(ctx, dest, "sine", 58, t, 0.8 * v, 0.004, 0.03, 0.12);
      osc(ctx, dest, "sine", 52, t + 0.16, 0.6 * v, 0.004, 0.03, 0.14);
      return;
    case "taiko": {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(accent ? 110 : 90, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.3);
      const g = ctx.createGain();
      env(g, t, 0.85 * v, 0.003, 0.03, 0.45);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.55);
      noiseHit(ctx, dest, t, 0.3 * v, 0.12, "lowpass", 500);
      return;
    }
    case "sonar": {
      const f = freq || 1320;
      for (let i = 0; i < 3; i++) osc(ctx, dest, "sine", f, t + i * 0.34, (0.2 * v) / (i + 1), 0.005, 0.02, 0.9);
      return;
    }
    case "bubble": {
      const o = ctx.createOscillator();
      const base = freq || 500 + Math.random() * 500;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 2.2, t + 0.08);
      const g = ctx.createGain();
      env(g, t, 0.12 * v, 0.003, 0.02, 0.06);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.15);
      return;
    }
    case "bass": {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(freq, t);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(250, t + Math.max(0.08, noteLengthS));
      const g = ctx.createGain();
      env(g, t, 0.34 * v, 0.005, Math.max(0, noteLengthS - 0.06), 0.08);
      o.connect(f).connect(g).connect(dest);
      o.start(t);
      o.stop(t + noteLengthS + 0.15);
      return;
    }
    case "tribass":
      osc(ctx, dest, "triangle", freq, t, 0.5 * v, 0.003, Math.max(0, noteLengthS - 0.03), 0.04);
      return;
    case "lead":
      osc(ctx, dest, "square", freq, t, 0.11 * v, 0.006, Math.max(0, noteLengthS - 0.06), 0.08);
      osc(ctx, dest, "square", freq, t, 0.05 * v, 0.006, Math.max(0, noteLengthS - 0.06), 0.08, 9);
      return;
    case "pulse":
      osc(ctx, dest, "pulse", freq, t, 0.14 * v, 0.003, Math.max(0, noteLengthS - 0.03), 0.04);
      return;
    case "nylon":
    case "steel":
    case "dulcimer":
    case "pluck":
      osc(ctx, dest, "triangle", freq, t, 0.3 * v, 0.003, 0.01, Math.min(0.5, noteLengthS + 0.15));
      osc(ctx, dest, "sine", freq * 2, t, 0.08 * v, 0.003, 0.005, 0.12);
      return;
    case "bell":
      osc(ctx, dest, "sine", freq, t, 0.2 * v, 0.003, 0.02, 1.1);
      osc(ctx, dest, "sine", freq * 2.76, t, 0.06 * v, 0.003, 0.01, 0.5);
      return;
    case "pad": {
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 1300;
      g.connect(f).connect(dest);
      env(g, t, 0.075 * v, Math.min(0.35, noteLengthS * 0.3), Math.max(0, noteLengthS * 0.6), Math.max(0.3, noteLengthS * 0.4));
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + noteLengthS * 1.4 + 0.5);
      }
      return;
    }
    case "organ": {
      // why: The slow rotary wobble simulates a drawbar organ’s rotating speaker.
      const g = ctx.createGain();
      g.connect(dest);
      env(g, t, 0.07 * v, 0.02, Math.max(0, noteLengthS - 0.05), 0.12);
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      const rotaryRateHz = 5.5;
      const rotaryDepthCents = 6;
      lfo.frequency.value = rotaryRateHz;
      depth.gain.value = rotaryDepthCents;
      lfo.connect(depth);
      lfo.start(t);
      lfo.stop(t + noteLengthS + 0.3);
      for (const [mult, level] of [
        [0.5, 0.7],
        [1, 1],
        [2, 0.55],
        [3, 0.3],
        [4, 0.2],
      ] as const) {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq * mult;
        depth.connect(o.detune);
        og.gain.value = level;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + noteLengthS + 0.3);
      }
      return;
    }
    case "piano": {
      // why: Higher notes decay faster to mimic a piano’s shorter treble strings.
      const ring = Math.min(Math.max(0.5, Math.min(3, 1.8 * Math.sqrt(262 / freq))), 0.6 + noteLengthS * 2);
      osc(ctx, dest, "triangle", freq, t, 0.26 * v, 0.004, 0.01, ring);
      osc(ctx, dest, "sine", freq, t, 0.08 * v, 0.004, 0.01, ring, 4);
      osc(ctx, dest, "sine", freq * 2, t, 0.07 * v, 0.004, 0.01, ring * 0.5);
      osc(ctx, dest, "sine", freq * 3, t, 0.025 * v, 0.004, 0.005, ring * 0.25);
      return;
    }
    case "strings": {
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 2200;
      g.connect(f).connect(dest);
      const attack = Math.min(0.06, noteLengthS * 0.3);
      env(g, t, 0.07 * v, attack, Math.max(0, noteLengthS - attack - 0.02), 0.14);
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.2;
      depth.gain.value = 5;
      lfo.connect(depth);
      lfo.start(t);
      lfo.stop(t + noteLengthS + 0.3);
      for (const det of [-8, 0, 8]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;
        o.detune.value = det;
        depth.connect(o.detune);
        o.connect(g);
        o.start(t);
        o.stop(t + noteLengthS + 0.3);
      }
      return;
    }
    case "flute": {
      const g = ctx.createGain();
      g.connect(dest);
      env(g, t, 0.16 * v, Math.min(0.04, noteLengthS * 0.3), Math.max(0, noteLengthS - 0.06), 0.1);
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5;
      depth.gain.value = 8;
      lfo.connect(depth);
      lfo.start(t);
      lfo.stop(t + noteLengthS + 0.2);
      for (const [mult, level] of [
        [1, 1],
        [2, 0.18],
        [3, 0.06],
      ] as const) {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq * mult;
        depth.connect(o.detune);
        og.gain.value = level;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + noteLengthS + 0.2);
      }
      return;
    }
    case "twang": {
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.Q.value = 4;
      f.frequency.setValueAtTime(4200, t);
      f.frequency.exponentialRampToValueAtTime(700, t + 0.35);
      g.connect(f).connect(dest);
      const ring = Math.min(1.1, noteLengthS + 0.45);
      env(g, t, 0.12 * v, 0.002, 0.02, ring);
      for (const [type, level] of [
        ["sawtooth", 1],
        ["square", 0.45],
      ] as const) {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq * 1.03, t);
        o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
        og.gain.value = level;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + ring + 0.1);
      }
      return;
    }
    case "whistle": {
      // why: The pitch scoops into the note and the airflow makes the whistle sound played by a person.
      const g = ctx.createGain();
      g.connect(dest);
      env(g, t, 0.15 * v, Math.min(0.05, noteLengthS * 0.3), Math.max(0, noteLengthS - 0.08), 0.12);
      const o = ctx.createOscillator();
      o.type = "sine";
      const scoopStartPitchRatio = 0.93;
      const scoopTimeS = 0.07;
      o.frequency.setValueAtTime(freq * scoopStartPitchRatio, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + scoopTimeS);
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 6;
      depth.gain.value = 14;
      lfo.connect(depth).connect(o.detune);
      o.connect(g);
      o.start(t);
      lfo.start(t);
      o.stop(t + noteLengthS + 0.2);
      lfo.stop(t + noteLengthS + 0.2);
      noiseHit(ctx, dest, t, 0.03 * v, Math.min(0.4, noteLengthS), "bandpass", freq * 2, 6);
      return;
    }
    case "jawharp": {
      // why: The formant sweep simulates a change in the shape of the player’s mouth.
      const ring = Math.max(0.25, noteLengthS);
      const g = ctx.createGain();
      g.connect(dest);
      env(g, t, 0.2 * v, 0.004, ring * 0.25, ring * 0.75);
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(freq * 1.02, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
      const mouthFormant = ctx.createBiquadFilter();
      mouthFormant.type = "bandpass";
      mouthFormant.Q.value = 9;
      mouthFormant.frequency.setValueAtTime(freq * 2.5, t);
      mouthFormant.frequency.exponentialRampToValueAtTime(freq * 7, t + ring * 0.35);
      mouthFormant.frequency.exponentialRampToValueAtTime(freq * 3, t + ring);
      const body = ctx.createBiquadFilter();
      body.type = "lowpass";
      body.frequency.value = freq * 1.5;
      const bodyGain = ctx.createGain();
      bodyGain.gain.value = 0.35;
      o.connect(mouthFormant).connect(g);
      o.connect(body).connect(bodyGain).connect(g);
      o.start(t);
      o.stop(t + ring + 0.15);
      return;
    }
    case "timpani": {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(freq * 1.12, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
      const g = ctx.createGain();
      env(g, t, 0.7 * v, 0.003, 0.04, 0.6);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.7);
      noiseHit(ctx, dest, t, 0.25 * v, 0.1, "lowpass", 400);
      return;
    }
    case "brass": {
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(350, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.08);
      f.frequency.exponentialRampToValueAtTime(1300, t + Math.max(0.12, noteLengthS));
      g.connect(f).connect(dest);
      env(g, t, 0.13 * v, 0.03, Math.max(0, noteLengthS - 0.08), 0.1);
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + noteLengthS + 0.2);
      }
      return;
    }
  }
}

export function layerActive(layer: Layer, intensity: number): boolean {
  return intensity >= (layer.from ?? 0) && intensity < (layer.to ?? 2);
}

export function stepSeconds(track: Track, intensity: number): number {
  return 60 / (track.bpm * (1 + (track.tempoBoost ?? 0) * intensity)) / 4;
}

interface Sends {
  echo?: AudioNode;
}

export function scheduleStep(ctx: Ctx, dest: AudioNode, track: Track, step: number, t: number, intensity: number, sends: Sends = {}): void {
  const dur = stepSeconds(track, intensity);
  const steps = stepsPerBar(track);
  const bar = Math.floor(step / steps) % track.bars;
  const s = step % steps;
  const style = richStyle(track.rich);
  const sampled = usesSamples(track);
  track.layers.forEach((layer, li) => {
    if (!layerActive(layer, intensity)) return;
    const toks = tokens(layer.bars[bar % layer.bars.length]!);
    const tok = toks[s] ?? ".";
    if (tok === "." || tok === "-") return;
    let vol = layer.vol ?? 1;
    let at = t;
    let out = dest;
    let detune = 0;
    if (style) {
      const h = humanize(step, li, style);
      at = Math.max(ctx.currentTime, t + h.timeOffsetS);
      vol *= h.gain;
      detune = h.detuneCents;
      const pan = ctx.createStereoPanner();
      pan.pan.value = panFor(layer.inst, style);
      pan.connect(dest);
      if (layer.echo && sends.echo) {
        const send = ctx.createGain();
        send.gain.value = layer.echo;
        pan.connect(send).connect(sends.echo);
      }
      out = pan;
    }
    if (DRUMS.has(layer.inst)) {
      const pitchHz = noteFreq(tok) ?? 0;
      const accent = tok === "o";
      if (sampled && tryPlaySample(ctx, out, layer.inst, at, pitchHz, dur, vol, detune, accent)) return;
      if (!(style && tryPlayRich(ctx, out, layer.inst, at, pitchHz, dur, vol, detune, style, accent)))
        playInstrument(ctx, out, layer.inst, at, pitchHz, dur, vol, accent);
      return;
    }
    let held = 1;
    while (s + held < steps && toks[s + held] === "-") held++;
    tok.split("+").forEach((n, i) => {
      const f = noteFreq(n);
      if (!f) return;
      const noteLengthS = held * dur * 0.95;
      const start = style && layer.inst === "pluck" ? at + i * STRUM_S : at;
      if (sampled && tryPlaySample(ctx, out, layer.inst, start, f, noteLengthS, vol, detune)) return;
      if (!style) return playInstrument(ctx, out, layer.inst, at, f, noteLengthS, vol);
      if (!tryPlayRich(ctx, out, layer.inst, start, f, noteLengthS, vol, detune, style)) playInstrument(ctx, out, layer.inst, start, f, noteLengthS, vol);
    });
  });
}

export function renderInto(ctx: Ctx, dest: AudioNode, track: Track, seconds: number, intensity: number): void {
  let t = 0.05;
  for (let step = 0; t < seconds; step++) {
    scheduleStep(ctx, dest, track, step, t, intensity);
    t += stepSeconds(track, intensity) * (step % 2 === 0 ? 1 + (track.swing ?? 0) : 1 - (track.swing ?? 0));
  }
}

export const instrumentsOf = (track: Track): Set<Instrument> => new Set(track.layers.map((l) => l.inst));

const LOOKAHEAD_S = 0.12;
const RESUME_LOOKAHEAD_S = 0.02;
const DEFAULT_INTENSITY_RAMP_MS = 800;
const TICK_MS = 25;
const FADE_S = 1.2;
const REVERB_S = 2.8;

interface Playing {
  kind: "synth" | "file";
  id: string;
  gain: GainNode;
  track?: Track;
  step: number;
  nextTime: number;
  audio?: HTMLAudioElement;
  echo?: Echo;
}

const USUAL_LEVEL = 0.55;
const DUCKED_LEVEL = 0.15;
const DUCK_LEVEL = DUCKED_LEVEL / USUAL_LEVEL;
const DEFAULT_RICH_REVERB_SEND = { acoustic: 0.3, arcade: 0.18 };

export class MusicPlayer {
  private master: GainNode | null = null;
  private ducker: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private rich: RichBus | null = null;
  private richTracksIncludingFadeOut = 0;
  private current: Playing | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intensity = 0;
  private target = 0;
  private rampFrom = 0;
  private rampStart = 0;
  private rampMs = 0;
  private wantedId: string | null = null;
  private level = 1;

  constructor(
    private readonly getCtx: () => AudioContext | null,
    private readonly tracks: Record<string, Track>,
    private readonly customUrl: (id: string) => string | null,
  ) {}

  setLevel(level: number): void {
    const was = this.level;
    this.level = Math.max(0, Math.min(1, level));
    const ctx = this.getCtx();
    if (this.master && ctx) this.master.gain.setTargetAtTime(this.level * USUAL_LEVEL, ctx.currentTime, 0.15);
    const track = this.current?.track;
    if (was === 0 && this.level > 0 && ctx && track && usesSamples(track)) void loadSamples(ctx, instrumentsOf(track));
  }

  setIntensity(value: number, rampMs = 0): void {
    this.rampFrom = this.intensity;
    this.target = Math.max(0, Math.min(1, value));
    this.rampStart = performance.now();
    this.rampMs = rampMs || DEFAULT_INTENSITY_RAMP_MS;
  }

  play(id: string | null): void {
    this.wantedId = id;
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  duck(ms = 1500): void {
    const ctx = this.getCtx();
    if (!ctx || !this.ducker) return;
    const g = this.ducker.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(DUCK_LEVEL, t, 0.08);
    g.setTargetAtTime(1, t + ms / 1000, 0.3);
  }

  sting(id: string): void {
    const ctx = this.getCtx();
    if (!ctx || ctx.state !== "running" || this.level === 0) return;
    const master = this.ensureMaster(ctx);
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(master);
    let seconds: number;
    const url = this.customUrl(id);
    const track = this.tracks[id];
    if (url) {
      const audio = new Audio(url);
      ctx.createMediaElementSource(audio).connect(gain);
      void audio.play().catch(() => {});
      seconds = 4;
      audio.addEventListener("ended", () => gain.disconnect(), { once: true });
    } else if (track) {
      if (usesSamples(track)) void loadSamples(ctx, instrumentsOf(track));
      if (track.reverb) {
        const send = ctx.createGain();
        send.gain.value = track.reverb;
        gain.connect(send).connect(this.ensureReverb(ctx, master));
      }
      let t = now + 0.02;
      for (let step = 0; step < track.bars * stepsPerBar(track); step++) {
        scheduleStep(ctx, gain, track, step, t, 0);
        t += stepSeconds(track, 0) * (step % 2 === 0 ? 1 + (track.swing ?? 0) : 1 - (track.swing ?? 0));
      }
      seconds = t - now;
      setTimeout(() => gain.disconnect(), (seconds + 3) * 1000);
    } else {
      gain.disconnect();
      return;
    }
    // why: Ducking the master would lower the sting along with the background.
    const bg = this.current?.gain.gain;
    if (bg) {
      bg.cancelScheduledValues(now);
      bg.setValueAtTime(bg.value, now);
      bg.setTargetAtTime(0.3, now, 0.05);
      bg.setTargetAtTime(1, now + seconds * 0.7, 0.4);
    }
  }

  private ensureMaster(ctx: AudioContext): GainNode {
    if (!this.master) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = ctx.createGain();
      this.master.gain.value = this.level * USUAL_LEVEL;
      this.ducker = ctx.createGain();
      this.master.connect(this.ducker).connect(comp).connect(ctx.destination);
    }
    return this.master;
  }

  private ensureReverb(ctx: AudioContext, master: GainNode): ConvolverNode {
    if (!this.reverb) {
      const length = Math.floor(ctx.sampleRate * REVERB_S);
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = impulse.getChannelData(ch);
        for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
      }
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = impulse;
      this.reverb.connect(master);
    }
    return this.reverb;
  }

  private tick(): void {
    const ctx = this.getCtx();
    if (!ctx || ctx.state !== "running") return; // why: browser autoplay rules: waits for the first click or keypress
    const master = this.ensureMaster(ctx);

    const p = Math.min(1, (performance.now() - this.rampStart) / this.rampMs);
    this.intensity = this.rampFrom + (this.target - this.rampFrom) * p;

    if ((this.current?.id ?? null) !== this.wantedId) this.switchTo(ctx, master, this.wantedId);

    const cur = this.current;
    if (!cur || cur.kind !== "synth" || !cur.track) {
      if (!cur && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      return;
    }
    // why: Play from the next step so overdue notes do not start together after a scheduling gap.
    if (cur.nextTime < ctx.currentTime) cur.nextTime = ctx.currentTime + RESUME_LOOKAHEAD_S;
    cur.echo?.setStep(stepSeconds(cur.track, this.intensity), ctx.currentTime);
    while (cur.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      // why: Advance the beat even when muted so unmuting comes in on time.
      if (this.level > 0) scheduleStep(ctx, cur.gain, cur.track, cur.step, cur.nextTime, this.intensity, { echo: cur.echo?.input });
      const swing = cur.track.swing ?? 0;
      cur.nextTime += stepSeconds(cur.track, this.intensity) * (cur.step % 2 === 0 ? 1 + swing : 1 - swing);
      cur.step = (cur.step + 1) % (cur.track.bars * stepsPerBar(cur.track));
    }
  }

  private switchTo(ctx: AudioContext, master: GainNode, id: string | null): void {
    const now = ctx.currentTime;
    const old = this.current;
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + FADE_S);
      const audio = old.audio;
      setTimeout(
        () => {
          old.gain.disconnect();
          old.echo?.dispose();
          audio?.pause();
          if (old.track?.rich && --this.richTracksIncludingFadeOut === 0 && this.rich) {
            this.rich.dispose();
            this.rich = null;
          }
        },
        FADE_S * 1000 + 200,
      );
    }
    this.current = null;
    if (!id) return;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + FADE_S);
    gain.connect(master);
    const url = this.customUrl(id);
    if (url) {
      const audio = new Audio(url);
      audio.loop = true;
      ctx.createMediaElementSource(audio).connect(gain);
      void audio.play().catch(() => {});
      this.current = { kind: "file", id, gain, step: 0, nextTime: now, audio };
      return;
    }
    // why: Store unknown IDs as current so the scheduler does not retry every tick.
    const track = this.tracks[id];
    if (track && usesSamples(track) && this.level > 0) void loadSamples(ctx, instrumentsOf(track));
    if (track?.rich) {
      gain.disconnect();
      this.rich ??= createRichBus(ctx, master);
      this.richTracksIncludingFadeOut++;
      gain.connect(this.rich.input);
      const send = ctx.createGain();
      send.gain.value = track.reverb ?? (richStyle(track.rich) === "arcade" ? DEFAULT_RICH_REVERB_SEND.arcade : DEFAULT_RICH_REVERB_SEND.acoustic);
      gain.connect(send).connect(this.rich.reverb);
      const echo = track.layers.some((l) => l.echo) ? createEcho(ctx, gain, stepSeconds(track, this.intensity)) : undefined;
      this.current = { kind: "synth", id, gain, track, step: 0, nextTime: now + 0.05, echo };
      return;
    } else if (track?.reverb) {
      const send = ctx.createGain();
      send.gain.value = track.reverb;
      gain.connect(send).connect(this.ensureReverb(ctx, master));
    }
    this.current = { kind: "synth", id, gain, track, step: 0, nextTime: now + 0.05 };
  }
}
