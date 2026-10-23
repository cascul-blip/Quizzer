import { describe, expect, test } from "bun:test";
import { STEPS_PER_BAR, renderInto, scheduleStep, stepSeconds, type Track } from "../src/client/shared/music/engine.ts";
import { HUMAN_GAIN, HUMAN_TIME_S, STRUM_S, createRichBus, humanize, impulseResponse, saturationCurve, seeded } from "../src/client/shared/music/rich.ts";
import { TRACKS } from "../src/client/shared/music/tracks.ts";

// A stand-in for an AudioContext (tests have none): it records every node made and every source started.

class FakeParam {
  value = 0;
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
  linearRampToValueAtTime() {}
  setTargetAtTime() {}
  cancelScheduledValues() {}
}

class FakeNode {
  connections = 0;
  disconnected = false;
  constructor(
    readonly kind: string,
    readonly ctx: FakeCtx,
  ) {}
  connect<T>(n: T): T {
    this.connections++;
    return n;
  }
  disconnect() {
    this.disconnected = true;
  }
  start(t = 0) {
    this.ctx.starts.push(t);
  }
  stop() {}
}

class FakeCtx {
  currentTime = 0;
  sampleRate = 8000;
  made: FakeNode[] = [];
  starts: number[] = [];
  private node(kind: string, params: string[]) {
    const n = new FakeNode(kind, this) as FakeNode & Record<string, unknown>;
    for (const p of params) n[p] = new FakeParam();
    this.made.push(n);
    return n;
  }
  createOscillator = () => Object.assign(this.node("osc", ["frequency", "detune"]), { type: "sine", setPeriodicWave() {} });
  createGain = () => this.node("gain", ["gain"]);
  createBiquadFilter = () => Object.assign(this.node("filter", ["frequency", "Q"]), { type: "lowpass" });
  createBufferSource = () => Object.assign(this.node("source", ["playbackRate", "detune"]), { buffer: null, loop: false });
  createStereoPanner = () => this.node("panner", ["pan"]);
  createWaveShaper = () => Object.assign(this.node("shaper", []), { curve: null, oversample: "none" });
  createConvolver = () => Object.assign(this.node("convolver", []), { buffer: null });
  createDynamicsCompressor = () => this.node("compressor", ["threshold", "knee", "ratio", "attack", "release"]);
  createPeriodicWave = () => ({});
  createBuffer = (channels: number, length: number, sampleRate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, numberOfChannels: channels, getChannelData: (c: number) => data[c]! };
  };
  kinds = () => new Set(this.made.map((n) => n.kind));
}

const fake = () => new FakeCtx() as FakeCtx & BaseAudioContext;
const dest = (ctx: FakeCtx) => new FakeNode("dest", ctx) as unknown as AudioNode;

/** Schedule every step of the track's loop, one step every stepSeconds, and return the grid times. */
function playLoop(ctx: FakeCtx & BaseAudioContext, track: Track, intensity: number): number[] {
  const grid: number[] = [];
  let t = 1;
  for (let step = 0; step < track.bars * STEPS_PER_BAR; step++) {
    grid.push(t);
    scheduleStep(ctx, dest(ctx), track, step, t, intensity);
    t += stepSeconds(track, intensity);
  }
  return grid;
}

const nearestGap = (t: number, grid: number[]) => Math.min(...grid.map((g) => Math.abs(t - g)));

describe("rich sound is opt-in", () => {
  test("only the Kingdom Siege tracks use it", () => {
    const rich = Object.values(TRACKS)
      .filter((t) => t.rich)
      .map((t) => t.id)
      .sort();
    expect(rich).toEqual(["siege-battle", "siege-lobby", "siege-results"]);
  });

  test("other tracks get no rich nodes and play exactly on the grid", () => {
    for (const track of Object.values(TRACKS).filter((t) => !t.rich)) {
      for (const intensity of [0, 1]) {
        const ctx = fake();
        const grid = playLoop(ctx, track, intensity);
        for (const kind of ["panner", "shaper", "convolver", "compressor"]) expect(ctx.kinds().has(kind), `${track.id}: ${kind}`).toBe(false);
        // Every source starts on a step, or a fixed offset after it (claps, sonar echoes, the second heartbeat).
        const onGrid = new Set(grid.map((g) => g.toFixed(9)));
        expect(ctx.starts.some((s) => onGrid.has(s.toFixed(9))), track.id).toBe(true);
      }
    }
  });

  test("a track plays the same with rich: false as with no flag at all", () => {
    const track = TRACKS["land-play"];
    const a = fake();
    const b = fake();
    playLoop(a, track, 0.7);
    playLoop(b, { ...track, rich: false }, 0.7);
    expect(b.made.map((n) => n.kind)).toEqual(a.made.map((n) => n.kind));
    expect(b.starts).toEqual(a.starts);
  });

  test("turning the flag on for a plain track humanises it and spreads it in stereo", () => {
    const track = TRACKS["classic-lobby"];
    const plain = fake();
    const rich = fake();
    playLoop(plain, track, 0.5);
    playLoop(rich, { ...track, rich: true }, 0.5);
    expect(plain.kinds().has("panner")).toBe(false);
    expect(rich.kinds().has("panner")).toBe(true);
    expect(rich.starts).not.toEqual(plain.starts);
  });
});

describe("rich Kingdom Siege tracks", () => {
  for (const track of Object.values(TRACKS).filter((t) => t.rich)) {
    test(`${track.id}: every note stays within the humanising window of its step`, () => {
      for (const intensity of [0, 0.3, 0.7, 1]) {
        const ctx = fake();
        const grid = playLoop(ctx, track, intensity);
        expect(ctx.starts.length).toBeGreaterThan(0);
        // Strummed lute chords and the plain drums' built-in offsets (a clap's three hits) can add a little.
        for (const s of ctx.starts) expect(nearestGap(s, grid)).toBeLessThanOrEqual(HUMAN_TIME_S + 3 * STRUM_S + 1e-9);
        expect(ctx.kinds().has("panner")).toBe(true);
      }
    });
  }

  test("the siege tracks render for a few seconds at every intensity without errors", () => {
    for (const track of Object.values(TRACKS).filter((t) => t.rich)) for (const i of [0, 0.3, 0.6, 0.9]) renderInto(fake(), dest(new FakeCtx()), track, 6, i);
  });

  test("the lute is plucked (Karplus-Strong buffers), not an oscillator", () => {
    const lute: Track = { id: "lute", bpm: 90, bars: 1, rich: true, layers: [{ inst: "pluck", bars: ["G3 . . . . . . . . . . . . . . ."] }] };
    const ctx = fake();
    scheduleStep(ctx, dest(ctx), lute, 0, 1, 0);
    expect(ctx.made.filter((n) => n.kind === "source")).toHaveLength(1);
    expect(ctx.made.some((n) => n.kind === "osc")).toBe(false);
  });
});

describe("humanising", () => {
  test("stays within bounds and is the same every time round", () => {
    for (let step = 0; step < 256; step++) {
      for (let layer = 0; layer < 12; layer++) {
        const h = humanize(step, layer);
        expect(Math.abs(h.dt)).toBeLessThanOrEqual(HUMAN_TIME_S);
        expect(Math.abs(h.gain - 1)).toBeLessThanOrEqual(HUMAN_GAIN);
        expect(Math.abs(h.detune)).toBeLessThanOrEqual(4);
        expect(humanize(step, layer)).toEqual(h);
      }
    }
  });

  test("actually varies", () => {
    const dts = new Set(Array.from({ length: 64 }, (_, s) => humanize(s, 0).dt));
    expect(dts.size).toBeGreaterThan(60);
  });

  test("the seeded generator is deterministic and in [0, 1)", () => {
    const a = seeded(42);
    const b = seeded(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("the rich bus", () => {
  test("the impulse response is stereo, starts after a short gap and dies away", () => {
    const ctx = fake();
    const ir = impulseResponse(ctx, 1) as unknown as { numberOfChannels: number; length: number; getChannelData: (c: number) => Float32Array };
    expect(ir.numberOfChannels).toBe(2);
    const [l, r] = [ir.getChannelData(0), ir.getChannelData(1)];
    expect(l[0]).toBe(0);
    const energy = (d: Float32Array, from: number, to: number) => d.slice(from, to).reduce((a, x) => a + x * x, 0);
    const tenth = Math.floor(ir.length / 10);
    expect(energy(l, ir.length - tenth, ir.length)).toBeLessThan(energy(l, tenth, 2 * tenth) / 20);
    expect(l.slice(tenth, 2 * tenth)).not.toEqual(r.slice(tenth, 2 * tenth)); // decorrelated: a wide hall
  });

  test("the saturation curve is gentle near zero, rising, and never beyond ±1", () => {
    const c = saturationCurve();
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThan(c[i - 1]!);
    expect(c[0]).toBeCloseTo(-1);
    expect(c[c.length - 1]).toBeCloseTo(1);
    const mid = (c.length - 1) / 2;
    expect(c[Math.round(mid + 10)]! - c[Math.round(mid - 10)]!).toBeGreaterThan(0);
  });

  test("is made of a shaper, a compressor and a convolver, and disposing disconnects them all", () => {
    const ctx = fake();
    const bus = createRichBus(ctx, dest(ctx));
    expect(["shaper", "compressor", "convolver"].every((k) => ctx.kinds().has(k))).toBe(true);
    bus.dispose();
    expect(ctx.made.every((n) => n.disconnected)).toBe(true);
  });
});
