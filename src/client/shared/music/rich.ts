type Ctx = BaseAudioContext;

export type RichStyle = "acoustic" | "arcade";

export const richStyle = (rich: boolean | RichStyle | undefined): RichStyle | null => (rich === true ? "acoustic" : rich || null);

export const HUMAN_TIME_S = 0.008;
export const HUMAN_GAIN = 0.1;

// why: Seed the Mulberry32 generator so humanization repeats when the loop comes around.
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

interface Human {
  timeOffsetS: number;
  gain: number;
  detuneCents: number;
}

// why: Arcade timing varies less to sound sequenced rather than played by hand.
export const ARCADE_TIGHTNESS = 0.4;

export function humanize(step: number, layer: number, style: RichStyle = "acoustic"): Human {
  const r = seeded(step * 7919 + layer * 104729 + 17);
  const timeOffsetLimitS = style === "arcade" ? HUMAN_TIME_S * ARCADE_TIGHTNESS : HUMAN_TIME_S;
  const detuneLimitCents = 4;
  return { timeOffsetS: (r() * 2 - 1) * timeOffsetLimitS, gain: 1 + (r() * 2 - 1) * HUMAN_GAIN, detuneCents: (r() * 2 - 1) * detuneLimitCents };
}

const PAN: Record<RichStyle, Partial<Record<string, number>>> = {
  acoustic: { pluck: -0.35, flute: 0.25, brass: 0.15, bell: 0.3, woodblock: -0.25, snare: 0.1, hat: 0.35, cymbal: -0.3, organ: -0.1 },
  arcade: { hat: 0.3, openhat: -0.3, chipnoise: 0.15, snare: 0.05 },
};
export const panFor = (inst: string, style: RichStyle = "acoustic"): number => PAN[style][inst] ?? 0;

export const STRUM_S = 0.012;

const WHITE_NOISE_LENGTH_S = 2;
const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();
const pulseWaves = new WeakMap<Ctx, Map<number, PeriodicWave>>();
const plucks = new WeakMap<Ctx, Map<number, AudioBuffer>>();

function seededWhiteNoise(ctx: Ctx): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * WHITE_NOISE_LENGTH_S, ctx.sampleRate);
    const d = b.getChannelData(0);
    const r = seeded(1);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    noiseBuffers.set(ctx, b);
  }
  return b;
}

function pulseWave(ctx: Ctx, dutyCycle: number): PeriodicWave {
  let cache = pulseWaves.get(ctx);
  if (!cache) pulseWaves.set(ctx, (cache = new Map()));
  let w = cache.get(dutyCycle);
  if (!w) {
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * dutyCycle);
    w = ctx.createPeriodicWave(real, imag);
    cache.set(dutyCycle, w);
  }
  return w;
}

function env(p: AudioParam, t: number, peak: number, attack: number, hold: number, release: number) {
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  p.setValueAtTime(Math.max(peak, 0.0002), t + attack + hold);
  p.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

function lowpassEnvelope(ctx: Ctx, t: number, from: number, peak: number, sustain: number, attackS: number, decayS: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(peak, t + attackS);
  f.frequency.exponentialRampToValueAtTime(sustain, t + attackS + decayS);
  return f;
}

// why: Fade in vibrato so it enters after the attack, as it does on a played note.
function fadeInVibrato(ctx: Ctx, targets: AudioParam[], t: number, end: number, rate: number, cents: number, delay = 0.25) {
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

function airNoise(
  ctx: Ctx,
  dest: AudioNode,
  t: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
) {
  const s = ctx.createBufferSource();
  s.buffer = seededWhiteNoise(ctx);
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
const PLUCK_DECAY_S = 1.3;
const PLUCK_FILTER_DELAY_SAMPLES = 0.5;

// why: Averaging adjacent samples each pass of the Karplus–Strong loop damps high frequencies as the string rings.
function pluckBuffer(ctx: Ctx, period: number): AudioBuffer {
  let cache = plucks.get(ctx);
  if (!cache) plucks.set(ctx, (cache = new Map()));
  let b = cache.get(period);
  if (!b) {
    const sr = ctx.sampleRate;
    b = ctx.createBuffer(1, Math.floor(sr * PLUCK_S), sr);
    const d = b.getChannelData(0);
    const r = seeded(period);
    // why: Smooth the initial burst to imitate a finger-plucked string.
    const line = new Float32Array(period);
    let prev = 0;
    for (let i = 0; i < period; i++) line[i] = prev = 0.6 * prev + 0.4 * (r() * 2 - 1);
    // why: Scale the loss by the period so high and low notes take the same time to fade.
    const loss = 10 ** ((-3 * period) / (sr * PLUCK_DECAY_S));
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

export function tryPlayRich(
  ctx: Ctx,
  dest: AudioNode,
  inst: string,
  t: number,
  freq: number,
  noteLengthS: number,
  vol: number,
  detune: number,
  style: RichStyle = "acoustic",
  accent = false,
): boolean {
  if (style === "arcade") return playArcade(ctx, dest, inst, t, freq, noteLengthS, vol * (accent ? 1.35 : 1), detune, accent);
  const v = vol;
  switch (inst) {
    case "pluck": {
      // why: The adjacent-sample average delays the loop by half a sample, so pitch correction includes that delay.
      const period = Math.max(2, Math.round(ctx.sampleRate / freq));
      const s = ctx.createBufferSource();
      s.buffer = pluckBuffer(ctx, period);
      s.playbackRate.value = (freq * (period + PLUCK_FILTER_DELAY_SAMPLES)) / ctx.sampleRate;
      s.detune.value = detune;
      const f = lowpassEnvelope(ctx, t, 5200, 5200, 1400, 0.001, 0.5);
      const g = ctx.createGain();
      const ring = Math.min(PLUCK_S - 0.1, noteLengthS + 0.9);
      g.gain.setValueAtTime(0.55 * v, t);
      g.gain.setValueAtTime(0.55 * v, t + ring - 0.08);
      g.gain.linearRampToValueAtTime(0, t + ring);
      s.connect(f).connect(g).connect(dest);
      s.start(t);
      s.stop(t + ring + 0.02);
      return true;
    }
    case "bell": {
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
      const end = t + noteLengthS + 0.25;
      const attack = Math.min(0.06, noteLengthS * 0.4);
      const f = lowpassEnvelope(ctx, t, 400, 3200, 1500, attack, Math.max(0.1, noteLengthS * 0.6));
      const g = ctx.createGain();
      env(g.gain, t, 0.14 * v, attack, Math.max(0, noteLengthS - attack - 0.05), 0.12);
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
      if (noteLengthS > 0.35) fadeInVibrato(ctx, carriers, t, end, 5, 7, 0.3);
      return true;
    }
    case "strings": {
      const end = t + noteLengthS + 0.35;
      const attack = Math.min(0.12, noteLengthS * 0.35);
      const f = lowpassEnvelope(ctx, t, 500, 2800, 2000, attack, 0.3);
      const g = ctx.createGain();
      env(g.gain, t, 0.075 * v, attack, Math.max(0, noteLengthS - attack - 0.02), 0.18);
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
      fadeInVibrato(ctx, detunes, t, end, 5.3, 6);
      airNoise(ctx, dest, t, 0.012 * v, attack, Math.max(0, noteLengthS - attack), 0.15, "bandpass", freq * 4, 1.2);
      return true;
    }
    case "flute": {
      const end = t + noteLengthS + 0.2;
      const attack = Math.min(0.03, noteLengthS * 0.3);
      const g = ctx.createGain();
      env(g.gain, t, 0.15 * v, attack, Math.max(0, noteLengthS - 0.05), 0.09);
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
      fadeInVibrato(ctx, detunes, t, end, 5.2, 9, 0.2);
      airNoise(ctx, dest, t, 0.05 * v, 0.003, 0.012, 0.03, "highpass", 2500, 0.7);
      airNoise(ctx, dest, t, 0.018 * v, attack, Math.max(0, noteLengthS - attack), 0.08, "bandpass", freq * 2, 2);
      return true;
    }
    case "pad": {
      const end = t + noteLengthS * 1.4 + 0.5;
      const attack = Math.min(0.5, noteLengthS * 0.35);
      const f = lowpassEnvelope(ctx, t, 400, 1700, 1100, attack, noteLengthS * 0.5);
      const g = ctx.createGain();
      env(g.gain, t, 0.075 * v, attack, Math.max(0, noteLengthS * 0.55), Math.max(0.3, noteLengthS * 0.4));
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
      const end = t + noteLengthS + 0.15;
      const f = lowpassEnvelope(ctx, t, 1400, 1400, 260, 0.001, Math.max(0.08, noteLengthS), 2);
      const g = ctx.createGain();
      env(g.gain, t, 0.3 * v, 0.006, Math.max(0, noteLengthS - 0.06), 0.08);
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

function metalHat(ctx: Ctx, dest: AudioNode, t: number, peak: number, decay: number) {
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = Math.min(10000, ctx.sampleRate / 2 - 200);
  const high = ctx.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = Math.min(7000, ctx.sampleRate / 2 - 300);
  const g = ctx.createGain();
  env(g.gain, t, peak, 0.001, 0.004, decay);
  band.connect(high).connect(g).connect(dest);
  const end = t + decay + 0.05;
  for (const mult of [2, 3, 4.16, 5.43, 6.79, 8.21]) osc(ctx, band, "square", 40 * mult * 4, t, end);
}

function arcadeSnare(ctx: Ctx, dest: AudioNode, t: number, v: number) {
  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(220, t);
  body.frequency.exponentialRampToValueAtTime(160, t + 0.05);
  const bg = ctx.createGain();
  env(bg.gain, t, 0.28 * v, 0.001, 0.01, 0.08);
  body.connect(bg).connect(dest);
  body.start(t);
  body.stop(t + 0.15);
  airNoise(ctx, dest, t, 0.42 * v, 0.001, 0.015, 0.16, "bandpass", 1800, 0.7);
  airNoise(ctx, dest, t, 0.14 * v, 0.001, 0.01, 0.1, "highpass", 6000, 0.7);
}

function playArcade(
  ctx: Ctx,
  dest: AudioNode,
  inst: string,
  t: number,
  freq: number,
  noteLengthS: number,
  v: number,
  detune: number,
  accent: boolean,
): boolean {
  switch (inst) {
    // why: The seasonal arcade arrangements reuse the acoustic FM bells and brass.
    case "bell":
    case "brass":
      return tryPlayRich(ctx, dest, inst, t, freq, noteLengthS, v, detune, "acoustic");
    case "lead": {
      const end = t + noteLengthS + 0.2;
      const g = ctx.createGain();
      env(g.gain, t, 0.12 * v, 0.005, Math.max(0, noteLengthS - 0.05), 0.1);
      g.connect(dest);
      const f = lowpassEnvelope(ctx, t, 6000, 6000, 2600, 0.001, 0.25);
      f.connect(g);
      const c = ctx.createOscillator();
      c.frequency.setValueAtTime(freq * 0.985, t);
      c.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
      c.detune.value = detune;
      const mod = ctx.createOscillator();
      mod.frequency.value = freq * 2;
      const index = ctx.createGain();
      index.gain.setValueAtTime(freq * 3, t);
      index.gain.exponentialRampToValueAtTime(freq * 1.2, t + 0.2);
      mod.connect(index).connect(c.frequency);
      const cg = ctx.createGain();
      cg.gain.value = 0.7;
      c.connect(cg).connect(f);
      c.start(t);
      mod.start(t);
      c.stop(end);
      mod.stop(end);
      const sg = ctx.createGain();
      sg.gain.value = 0.18;
      sg.connect(f);
      const saw = osc(ctx, sg, "sawtooth", freq, t, end, detune + 7);
      if (noteLengthS > 0.25) fadeInVibrato(ctx, [c.detune, saw.detune], t, end, 5.8, 10, 0.18);
      return true;
    }
    case "pulse": {
      const end = t + noteLengthS + 0.1;
      const f = lowpassEnvelope(ctx, t, 5500, 5500, 1200, 0.001, Math.max(0.06, noteLengthS * 0.8), 1.5);
      const g = ctx.createGain();
      env(g.gain, t, 0.1 * v, 0.002, Math.max(0, noteLengthS - 0.03), 0.05);
      f.connect(g).connect(dest);
      for (const [dutyCycle, det, pan] of [
        [0.25, -6, -0.35],
        [0.125, 6, 0.35],
      ] as const) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        p.connect(f);
        const o = ctx.createOscillator();
        o.setPeriodicWave(pulseWave(ctx, dutyCycle));
        o.frequency.value = freq;
        o.detune.value = det + detune;
        o.connect(p);
        o.start(t);
        o.stop(end);
      }
      return true;
    }
    case "tribass": {
      const end = t + noteLengthS + 0.1;
      const g = ctx.createGain();
      env(g.gain, t, 0.42 * v, 0.003, Math.max(0, noteLengthS - 0.04), 0.06);
      g.connect(dest);
      const c = osc(ctx, g, "sine", freq, t, end, detune);
      const mod = ctx.createOscillator();
      mod.frequency.value = freq;
      const index = ctx.createGain();
      index.gain.setValueAtTime(freq * 4, t);
      index.gain.exponentialRampToValueAtTime(freq * 0.6, t + 0.12);
      mod.connect(index).connect(c.frequency);
      mod.start(t);
      mod.stop(end);
      const sub = ctx.createGain();
      sub.gain.value = 0.35;
      sub.connect(g);
      osc(ctx, sub, "sine", freq / 2, t, end);
      return true;
    }
    case "kick": {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const g = ctx.createGain();
      env(g.gain, t, 0.95 * v, 0.002, 0.03, 0.25);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.32);
      airNoise(ctx, dest, t, 0.25 * v, 0.001, 0.003, 0.01, "highpass", 3000, 0.7);
      return true;
    }
    case "snare":
      arcadeSnare(ctx, dest, t, v);
      return true;
    case "chipnoise":
      // why: Racer patterns share a lane for snare accents and unaccented closed hi-hats.
      if (accent) arcadeSnare(ctx, dest, t, v * 0.8);
      else airNoise(ctx, dest, t, 0.12 * v, 0.001, 0.005, 0.03, "highpass", 6500, 0.7);
      return true;
    case "hat":
      metalHat(ctx, dest, t, 0.09 * v, 0.05);
      return true;
    case "openhat":
      metalHat(ctx, dest, t, 0.07 * v, 0.3);
      return true;
  }
  return false;
}

export interface Echo {
  input: GainNode;
  setStep(stepSeconds: number, at: number): void;
  dispose(): void;
}

// why: A dotted-eighth delay gives arcade leads syncopated repeats between the beats.
export const ECHO_STEPS = 3;

const MAX_ECHO_DELAY_S = 2;
const ECHO_LOWPASS_HZ = 3000;
const ECHO_FEEDBACK_GAIN = 0.35;

export function createEcho(ctx: BaseAudioContext, dest: AudioNode, stepSeconds: number): Echo {
  const input = ctx.createGain();
  const left = ctx.createDelay(MAX_ECHO_DELAY_S);
  const right = ctx.createDelay(MAX_ECHO_DELAY_S);
  const echoLowpass = ctx.createBiquadFilter();
  echoLowpass.type = "lowpass";
  echoLowpass.frequency.value = ECHO_LOWPASS_HZ;
  const feedback = ctx.createGain();
  feedback.gain.value = ECHO_FEEDBACK_GAIN;
  const panL = ctx.createStereoPanner();
  const panR = ctx.createStereoPanner();
  panL.pan.value = -0.7;
  panR.pan.value = 0.7;
  for (const d of [left, right]) d.delayTime.value = ECHO_STEPS * stepSeconds;
  input.connect(echoLowpass).connect(left);
  left.connect(panL).connect(dest);
  left.connect(right);
  right.connect(panR).connect(dest);
  right.connect(feedback).connect(left);
  let current = stepSeconds;
  return {
    input,
    setStep(step, at) {
      if (Math.abs(step - current) < current * 0.01) return;
      current = step;
      for (const d of [left, right]) d.delayTime.setTargetAtTime(ECHO_STEPS * step, at, 0.1);
    },
    dispose() {
      for (const n of [input, left, right, echoLowpass, feedback, panL, panR]) n.disconnect();
    },
  };
}

const REVERB_S = 3.2;
const PREDELAY_S = 0.025;

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
      // why: High frequencies die first in a hall, so smoothing increases through the tail.
      const smooth = 0.15 + 0.8 * x;
      lp = smooth * lp + (1 - smooth) * (r() * 2 - 1);
      d[i] = lp * Math.exp(-5 * x) * (1 + smooth);
    }
  }
  return ir;
}

export function saturationCurve(drive = 1.8, size = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  return curve;
}

export interface RichBus {
  input: GainNode;
  reverb: AudioNode;
  dispose(): void;
}

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
