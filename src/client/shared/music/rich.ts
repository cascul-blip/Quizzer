/**
 * The "rich" sound, for tracks that opt in with `rich: true` (today: Kingdom Siege).
 * Every other track keeps the plain oscillators in engine.ts, so the two can be compared.
 *
 * Adds, all generated in code:
 * - humanised timing and velocity (small, seeded, so a loop sounds the same every time);
 * - a place in the stereo field per instrument, and a little detune per voice;
 * - filter envelopes, and instruments built for the sound: Karplus-Strong plucks (a lute),
 *   FM bells and brass, strings with bow noise, a recorder with breath and chiff;
 * - a bus with gentle saturation and compression, and a convolution reverb whose impulse
 *   response is decaying stereo noise.
 */

type Ctx = BaseAudioContext;

// ---------- humanising ----------

/** Timing offsets stay within ±HUMAN_TIME_S; velocity within ±HUMAN_GAIN of the written level. */
export const HUMAN_TIME_S = 0.008;
export const HUMAN_GAIN = 0.1;

/** A small seeded random number generator (mulberry32): the same seed always gives the same sequence. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Human {
  /** Seconds to move the note by. */
  dt: number;
  /** Multiplies the note's volume. */
  gain: number;
  /** Cents of detune for this note. */
  detune: number;
}

/** The nudge for one layer's note on one step: the same every time the loop comes round. */
export function humanize(step: number, layer: number): Human {
  const r = seeded(step * 7919 + layer * 104729 + 17);
  return { dt: (r() * 2 - 1) * HUMAN_TIME_S, gain: 1 + (r() * 2 - 1) * HUMAN_GAIN, detune: (r() * 2 - 1) * 4 };
}

/** Where each instrument sits, -1 (left) … 1 (right). */
const PAN: Partial<Record<string, number>> = {
  pluck: -0.35,
  flute: 0.25,
  brass: 0.15,
  bell: 0.3,
  woodblock: -0.25,
  snare: 0.1,
  hat: 0.35,
  cymbal: -0.3,
  organ: -0.1,
};
export const panFor = (inst: string): number => PAN[inst] ?? 0;

/** Lute chords are strummed: each note of a chord this much later than the one below. */
export const STRUM_S = 0.012;

// ---------- shared pieces ----------

const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();
const plucks = new WeakMap<Ctx, Map<number, AudioBuffer>>();

/** Two seconds of seeded white noise, for breath, bow and the reverb. */
function noise(ctx: Ctx): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    const r = seeded(1);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    noiseBuffers.set(ctx, b);
  }
  return b;
}

function env(p: AudioParam, t: number, peak: number, attack: number, hold: number, release: number) {
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  p.setValueAtTime(Math.max(peak, 0.0002), t + attack + hold);
  p.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

/** A lowpass whose cutoff opens from `from` to `peak` over `attack`, then settles to `sustain`. */
function filterEnv(ctx: Ctx, t: number, from: number, peak: number, sustain: number, attack: number, decay: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(peak, t + attack);
  f.frequency.exponentialRampToValueAtTime(sustain, t + attack + decay);
  return f;
}

/** Vibrato that fades in after the note has sounded for a moment, as players do. */
function vibrato(ctx: Ctx, targets: AudioParam[], t: number, end: number, rate: number, cents: number, delay = 0.25) {
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = rate;
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(cents, t + delay);
  lfo.connect(depth);
  for (const p of targets) depth.connect(p);
  lfo.start(t);
  lfo.stop(end);
}

function osc(ctx: Ctx, dest: AudioNode, type: OscillatorType, freq: number, t: number, end: number, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  o.connect(dest);
  o.start(t);
  o.stop(end);
  return o;
}

/** Filtered noise under an envelope: breath on a recorder, a bow on a string, a chiff. */
function airNoise(ctx: Ctx, dest: AudioNode, t: number, peak: number, attack: number, hold: number, release: number, type: BiquadFilterType, freq: number, q: number) {
  const s = ctx.createBufferSource();
  s.buffer = noise(ctx);
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = Math.min(freq, ctx.sampleRate / 2 - 100);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g.gain, t, peak, attack, hold, release);
  s.connect(f).connect(g).connect(dest);
  s.start(t, (t * 0.37) % 1.5);
  s.stop(t + attack + hold + release + 0.05);
}

const PLUCK_S = 1.8;

/**
 * A plucked string by Karplus-Strong: a burst of noise circulating in a delay line one period long,
 * averaged each time round so it darkens and dies away. Made once per delay length and context.
 */
function pluckBuffer(ctx: Ctx, period: number): AudioBuffer {
  let cache = plucks.get(ctx);
  if (!cache) plucks.set(ctx, (cache = new Map()));
  let b = cache.get(period);
  if (!b) {
    const sr = ctx.sampleRate;
    b = ctx.createBuffer(1, Math.floor(sr * PLUCK_S), sr);
    const d = b.getChannelData(0);
    const r = seeded(period);
    // A softened burst (a finger, not a pick).
    const line = new Float32Array(period);
    let prev = 0;
    for (let i = 0; i < period; i++) line[i] = prev = 0.6 * prev + 0.4 * (r() * 2 - 1);
    // Loss per trip round the loop, so the note dies away over about 1.3 s whatever its pitch.
    const loss = 10 ** ((-3 * period) / (sr * 1.3));
    for (let i = 0, k = 0; i < d.length; i++) {
      const a = line[k]!;
      const next = k + 1 === period ? 0 : k + 1;
      line[k] = loss * 0.5 * (a + line[next]!);
      d[i] = a;
      k = next;
    }
    cache.set(period, b);
  }
  return b;
}

// ---------- instruments ----------

/**
 * Play one note in the rich style. Returns false for instruments it has no rich version of,
 * so the caller plays the plain one instead (drums, organ and the rest).
 */
export function playRich(ctx: Ctx, dest: AudioNode, inst: string, t: number, freq: number, len: number, vol: number, detune: number): boolean {
  const v = vol;
  switch (inst) {
    case "pluck": {
      // The lute: Karplus-Strong, tuned exactly by playback rate (the loop's average adds half a sample).
      const period = Math.max(2, Math.round(ctx.sampleRate / freq));
      const s = ctx.createBufferSource();
      s.buffer = pluckBuffer(ctx, period);
      s.playbackRate.value = (freq * (period + 0.5)) / ctx.sampleRate;
      s.detune.value = detune;
      const f = filterEnv(ctx, t, 5200, 5200, 1400, 0.001, 0.5);
      const g = ctx.createGain();
      const ring = Math.min(PLUCK_S - 0.1, len + 0.9);
      g.gain.setValueAtTime(0.55 * v, t);
      g.gain.setValueAtTime(0.55 * v, t + ring - 0.08);
      g.gain.linearRampToValueAtTime(0, t + ring);
      s.connect(f).connect(g).connect(dest);
      s.start(t);
      s.stop(t + ring + 0.02);
      return true;
    }
    case "bell": {
      // Church bell by FM: an inharmonic modulator whose brightness dies away faster than the tone, plus a low hum.
      const end = t + 2.6;
      const g = ctx.createGain();
      env(g.gain, t, 0.2 * v, 0.002, 0.01, 2.4);
      g.connect(dest);
      const carrier = osc(ctx, g, "sine", freq, t, end, detune);
      const mod = ctx.createOscillator();
      mod.frequency.value = freq * 1.4;
      const index = ctx.createGain();
      index.gain.setValueAtTime(freq * 3, t);
      index.gain.exponentialRampToValueAtTime(freq * 0.2, t + 1.6);
      mod.connect(index).connect(carrier.frequency);
      mod.start(t);
      mod.stop(end);
      const hum = ctx.createGain();
      env(hum.gain, t, 0.05 * v, 0.01, 0.05, 2.2);
      hum.connect(dest);
      osc(ctx, hum, "sine", freq / 2, t, end, detune);
      return true;
    }
    case "brass": {
      // FM brass: the modulation index swells with the attack (the "blat"), with a filter that opens with it,
      // a slight scoop up into the pitch, and vibrato on longer notes.
      const end = t + len + 0.25;
      const attack = Math.min(0.06, len * 0.4);
      const f = filterEnv(ctx, t, 400, 3200, 1500, attack, Math.max(0.1, len * 0.6));
      const g = ctx.createGain();
      env(g.gain, t, 0.14 * v, attack, Math.max(0, len - attack - 0.05), 0.12);
      f.connect(g).connect(dest);
      const carriers: AudioParam[] = [];
      for (const det of [-5, 5]) {
        const c = ctx.createOscillator();
        c.frequency.setValueAtTime(freq * 0.97, t);
        c.frequency.exponentialRampToValueAtTime(freq, t + attack);
        c.detune.value = det + detune;
        const mod = ctx.createOscillator();
        mod.frequency.setValueAtTime(freq, t);
        mod.detune.value = det + detune;
        const index = ctx.createGain();
        index.gain.setValueAtTime(0, t);
        index.gain.linearRampToValueAtTime(freq * 2.4, t + attack);
        index.gain.linearRampToValueAtTime(freq * 1.2, t + attack + 0.15);
        mod.connect(index).connect(c.frequency);
        const cg = ctx.createGain();
        cg.gain.value = 0.5;
        c.connect(cg).connect(f);
        c.start(t);
        mod.start(t);
        c.stop(end);
        mod.stop(end);
        carriers.push(c.detune);
      }
      if (len > 0.35) vibrato(ctx, carriers, t, end, 5, 7, 0.3);
      return true;
    }
    case "strings": {
      // A section: detuned saws spread across the stereo field, a bowed swell through an opening filter,
      // a breath of bow noise and late vibrato.
      const end = t + len + 0.35;
      const attack = Math.min(0.12, len * 0.35);
      const f = filterEnv(ctx, t, 500, 2800, 2000, attack, 0.3);
      const g = ctx.createGain();
      env(g.gain, t, 0.075 * v, attack, Math.max(0, len - attack - 0.02), 0.18);
      f.connect(g).connect(dest);
      const detunes: AudioParam[] = [];
      for (const [det, pan] of [
        [-9, -0.5],
        [0, 0],
        [9, 0.5],
      ] as const) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        p.connect(f);
        detunes.push(osc(ctx, p, "sawtooth", freq, t, end, det + detune).detune);
      }
      vibrato(ctx, detunes, t, end, 5.3, 6);
      airNoise(ctx, dest, t, 0.012 * v, attack, Math.max(0, len - attack), 0.15, "bandpass", freq * 4, 1.2);
      return true;
    }
    case "flute": {
      // The recorder: a soft, nearly pure tone with a chiff at the start, breath under it and late vibrato.
      const end = t + len + 0.2;
      const attack = Math.min(0.03, len * 0.3);
      const g = ctx.createGain();
      env(g.gain, t, 0.15 * v, attack, Math.max(0, len - 0.05), 0.09);
      g.connect(dest);
      const detunes: AudioParam[] = [];
      for (const [mult, level] of [
        [1, 1],
        [2, 0.14],
        [3, 0.05],
      ] as const) {
        const og = ctx.createGain();
        og.gain.value = level;
        og.connect(g);
        detunes.push(osc(ctx, og, "sine", freq * mult, t, end, detune).detune);
      }
      vibrato(ctx, detunes, t, end, 5.2, 9, 0.2);
      airNoise(ctx, dest, t, 0.05 * v, 0.003, 0.012, 0.03, "highpass", 2500, 0.7);
      airNoise(ctx, dest, t, 0.018 * v, attack, Math.max(0, len - attack), 0.08, "bandpass", freq * 2, 2);
      return true;
    }
    case "pad": {
      // A slow, wide pad: two saws far apart in the stereo field and a triangle an octave down,
      // through a filter that opens slowly.
      const end = t + len * 1.4 + 0.5;
      const attack = Math.min(0.5, len * 0.35);
      const f = filterEnv(ctx, t, 400, 1700, 1100, attack, len * 0.5);
      const g = ctx.createGain();
      env(g.gain, t, 0.075 * v, attack, Math.max(0, len * 0.55), Math.max(0.3, len * 0.4));
      f.connect(g).connect(dest);
      for (const [det, pan] of [
        [-10, -0.6],
        [10, 0.6],
      ] as const) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        p.connect(f);
        osc(ctx, p, "sawtooth", freq, t, end, det + detune);
      }
      const sub = ctx.createGain();
      sub.gain.value = 0.5;
      sub.connect(f);
      osc(ctx, sub, "triangle", freq / 2, t, end, detune);
      return true;
    }
    case "bass": {
      // A round bass: a saw and a sine an octave down through a resonant filter that closes on each note.
      const end = t + len + 0.15;
      const f = filterEnv(ctx, t, 1400, 1400, 260, 0.001, Math.max(0.08, len), 2);
      const g = ctx.createGain();
      env(g.gain, t, 0.3 * v, 0.006, Math.max(0, len - 0.06), 0.08);
      f.connect(g).connect(dest);
      osc(ctx, f, "sawtooth", freq, t, end, detune);
      const sub = ctx.createGain();
      sub.gain.value = 0.6;
      sub.connect(g);
      osc(ctx, sub, "sine", freq / 2, t, end);
      return true;
    }
  }
  return false;
}

// ---------- the bus: saturation, compression, reverb ----------

const REVERB_S = 3.2;
const PREDELAY_S = 0.025;

/** A stereo impulse response: a short gap, then decaying noise, different in each ear and darker as it fades. */
export function impulseResponse(ctx: Ctx, seconds = REVERB_S): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * seconds);
  const ir = ctx.createBuffer(2, length, sr);
  const gap = Math.floor(sr * PREDELAY_S);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    const r = seeded(101 + ch);
    let lp = 0;
    for (let i = gap; i < length; i++) {
      const x = (i - gap) / (length - gap);
      // Each sample is smoothed more as the tail goes on: high frequencies die first, as in a hall.
      const smooth = 0.15 + 0.8 * x;
      lp = smooth * lp + (1 - smooth) * (r() * 2 - 1);
      d[i] = lp * Math.exp(-5 * x) * (1 + smooth);
    }
  }
  return ir;
}

/** Soft clipping (tanh), for a little warmth on peaks; quiet signals pass almost untouched. */
export function saturationCurve(drive = 1.8, size = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  return curve;
}

export interface RichBus {
  /** Rich tracks connect here (dry). */
  input: GainNode;
  /** …and send here for reverb. */
  reverb: AudioNode;
  dispose(): void;
}

/** The rich tracks' bus: input → saturation → gentle compressor → master, with a reverb that joins before the compressor. */
export function createRichBus(ctx: BaseAudioContext, master: AudioNode): RichBus {
  const input = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.curve = saturationCurve();
  shaper.oversample = "2x";
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 12;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  const convolver = ctx.createConvolver();
  convolver.buffer = impulseResponse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.9;
  input.connect(shaper).connect(comp).connect(master);
  convolver.connect(wet).connect(comp);
  return {
    input,
    reverb: convolver,
    dispose() {
      for (const n of [input, shaper, comp, convolver, wet]) n.disconnect();
    },
  };
}
