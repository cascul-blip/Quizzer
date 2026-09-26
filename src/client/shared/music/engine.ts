/**
 * Background music: a small WebAudio step sequencer that plays the tracks in
 * tracks.ts (or a custom audio file dropped into data/music/), with smooth
 * crossfades and an "intensity" that speeds the music up and adds layers.
 *
 * Patterns are 16 steps per bar. Melodic steps are note names ("C4", "F#3",
 * "Bb2", chords as "C4+E4+G4"), "-" holds the previous note, "." is a rest.
 * Drum steps are "x" (hit), "o" (accent) or ".".
 */

export type Instrument =
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
  | "woodblock"
  | "sonar"
  | "taiko"
  | "bubble"
  | "heart"
  | "chipnoise";

export const DRUMS = new Set<Instrument>(["kick", "snare", "hat", "openhat", "clap", "tick", "woodblock", "sonar", "taiko", "bubble", "heart", "chipnoise"]);

export interface Layer {
  inst: Instrument;
  /** One pattern string per bar; cycles if there are fewer bars than the track. */
  bars: string[];
  vol?: number;
  /** Only plays while intensity is at least this (0…1). */
  from?: number;
  /** Only plays while intensity is below this. */
  to?: number;
}

export interface Track {
  id: string;
  bpm: number;
  bars: number;
  /** Extra tempo at full intensity, e.g. 0.3 = up to 30% faster. */
  tempoBoost?: number;
  /** Delay every other 16th by this fraction of a step (shuffle feel). */
  swing?: number;
  layers: Layer[];
}

export const STEPS_PER_BAR = 16;

// ---------- notes ----------

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" → 440, "C#5", "Bb2" … or null for anything that isn't a note. */
export function noteFreq(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  const semis = NOTE_INDEX[m[1]!]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
}

export function tokens(bar: string): string[] {
  return bar.trim().split(/\s+/);
}

// ---------- instruments ----------

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

/** 25% duty pulse wave: the classic chiptune lead sound. */
function pulseWave(ctx: Ctx): PeriodicWave {
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

function osc(ctx: Ctx, dest: AudioNode, type: OscillatorType | "pulse", freq: number, t: number, peak: number, attack: number, hold: number, release: number, detune = 0) {
  const o = ctx.createOscillator();
  if (type === "pulse") o.setPeriodicWave(pulseWave(ctx));
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

/** Play one instrument hit/note at time t. `len` is the note length in seconds. */
export function playInstrument(ctx: Ctx, dest: AudioNode, inst: Instrument, t: number, freq: number, len: number, vol: number, accent = false) {
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
      f.frequency.exponentialRampToValueAtTime(250, t + Math.max(0.08, len));
      const g = ctx.createGain();
      env(g, t, 0.34 * v, 0.005, Math.max(0, len - 0.06), 0.08);
      o.connect(f).connect(g).connect(dest);
      o.start(t);
      o.stop(t + len + 0.15);
      return;
    }
    case "tribass":
      osc(ctx, dest, "triangle", freq, t, 0.5 * v, 0.003, Math.max(0, len - 0.03), 0.04);
      return;
    case "lead":
      osc(ctx, dest, "square", freq, t, 0.11 * v, 0.006, Math.max(0, len - 0.06), 0.08);
      osc(ctx, dest, "square", freq, t, 0.05 * v, 0.006, Math.max(0, len - 0.06), 0.08, 9);
      return;
    case "pulse":
      osc(ctx, dest, "pulse", freq, t, 0.14 * v, 0.003, Math.max(0, len - 0.03), 0.04);
      return;
    case "pluck":
      osc(ctx, dest, "triangle", freq, t, 0.3 * v, 0.003, 0.01, Math.min(0.5, len + 0.15));
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
      env(g, t, 0.075 * v, Math.min(0.35, len * 0.3), Math.max(0, len * 0.6), Math.max(0.3, len * 0.4));
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + len * 1.4 + 0.5);
      }
      return;
    }
    case "brass": {
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(350, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.08);
      f.frequency.exponentialRampToValueAtTime(1300, t + Math.max(0.12, len));
      g.connect(f).connect(dest);
      env(g, t, 0.13 * v, 0.03, Math.max(0, len - 0.08), 0.1);
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + len + 0.2);
      }
      return;
    }
  }
}

// ---------- scheduling ----------

/** Is this layer audible at this intensity? */
export function layerActive(layer: Layer, intensity: number): boolean {
  return intensity >= (layer.from ?? 0) && intensity < (layer.to ?? 2);
}

export function stepSeconds(track: Track, intensity: number): number {
  return 60 / (track.bpm * (1 + (track.tempoBoost ?? 0) * intensity)) / 4;
}

/** Schedule everything that starts on `step` (0 … bars*16-1) at time t. */
export function scheduleStep(ctx: Ctx, dest: AudioNode, track: Track, step: number, t: number, intensity: number): void {
  const dur = stepSeconds(track, intensity);
  const bar = Math.floor(step / STEPS_PER_BAR) % track.bars;
  const s = step % STEPS_PER_BAR;
  for (const layer of track.layers) {
    if (!layerActive(layer, intensity)) continue;
    const toks = tokens(layer.bars[bar % layer.bars.length]!);
    const tok = toks[s] ?? ".";
    if (tok === "." || tok === "-") continue;
    const vol = layer.vol ?? 1;
    if (DRUMS.has(layer.inst)) {
      // Drums may carry a pitch (e.g. woodblock "E5") or just "x"/"o".
      const pitch = noteFreq(tok) ?? 0;
      playInstrument(ctx, dest, layer.inst, t, pitch, dur, vol, tok === "o");
      continue;
    }
    let held = 1;
    while (s + held < STEPS_PER_BAR && toks[s + held] === "-") held++;
    for (const n of tok.split("+")) {
      const f = noteFreq(n);
      if (f) playInstrument(ctx, dest, layer.inst, t, f, held * dur * 0.95, vol);
    }
  }
}

/** Render `seconds` of a track into any context (used for previews and tests). */
export function renderInto(ctx: Ctx, dest: AudioNode, track: Track, seconds: number, intensity: number): void {
  let t = 0.05;
  for (let step = 0; t < seconds; step++) {
    scheduleStep(ctx, dest, track, step, t, intensity);
    t += stepSeconds(track, intensity) * (step % 2 === 0 ? 1 + (track.swing ?? 0) : 1 - (track.swing ?? 0));
  }
}

// ---------- live player ----------

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;
const FADE_S = 1.2;

interface Playing {
  kind: "synth" | "file";
  id: string;
  gain: GainNode;
  track?: Track;
  step: number;
  nextTime: number;
  audio?: HTMLAudioElement;
}

export class MusicPlayer {
  private master: GainNode | null = null;
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

  /** Overall music volume 0…1 (0 when muted or music is off). */
  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level));
    const ctx = this.getCtx();
    if (this.master && ctx) this.master.gain.setTargetAtTime(this.level * 0.55, ctx.currentTime, 0.15);
  }

  /** Move intensity to `value`, gradually over rampMs (or quickly if 0). */
  setIntensity(value: number, rampMs = 0): void {
    this.rampFrom = this.intensity;
    this.target = Math.max(0, Math.min(1, value));
    this.rampStart = performance.now();
    this.rampMs = rampMs || 800;
  }

  /** Crossfade to a track (or silence with null). Safe to call repeatedly with the same id. */
  play(id: string | null): void {
    this.wantedId = id;
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  /** Briefly dip the music (e.g. under a fanfare). */
  duck(ms = 1500): void {
    const ctx = this.getCtx();
    if (!ctx || !this.master) return;
    const g = this.master.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.level * 0.15, t, 0.08);
    g.setTargetAtTime(this.level * 0.55, t + ms / 1000, 0.3);
  }

  stop(): void {
    this.play(null);
  }

  private ensureMaster(ctx: AudioContext): GainNode {
    if (!this.master) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = ctx.createGain();
      this.master.gain.value = this.level * 0.55;
      this.master.connect(comp).connect(ctx.destination);
    }
    return this.master;
  }

  private tick(): void {
    const ctx = this.getCtx();
    if (!ctx || ctx.state !== "running") return; // waits for the first click/keypress (browser autoplay rules)
    const master = this.ensureMaster(ctx);

    // Intensity ramp.
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
    if (cur.nextTime < ctx.currentTime) cur.nextTime = ctx.currentTime + 0.02; // fell behind (tab was hidden)
    while (cur.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      scheduleStep(ctx, cur.gain, cur.track, cur.step, cur.nextTime, this.intensity);
      const swing = cur.track.swing ?? 0;
      cur.nextTime += stepSeconds(cur.track, this.intensity) * (cur.step % 2 === 0 ? 1 + swing : 1 - swing);
      cur.step = (cur.step + 1) % (cur.track.bars * STEPS_PER_BAR);
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
      setTimeout(() => {
        old.gain.disconnect();
        audio?.pause();
      }, FADE_S * 1000 + 200);
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
    // An unknown id plays silence (but still counts as "current", so we don't retry every tick).
    this.current = { kind: "synth", id, gain, track: this.tracks[id], step: 0, nextTime: now + 0.05 };
  }
}
