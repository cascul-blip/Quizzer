import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { STEPS_PER_BAR, instrumentsOf, renderInto, stepSeconds, tokens, usesSamples, noteFreq, type Track } from "../src/client/shared/music/engine.ts";
import { VOICES, loadSamples, nearestZone, playSample, samplesReady, setSamplesEnabled, urlsFor } from "../src/client/shared/music/samples.ts";
import { SAMPLE_SETS } from "../src/client/shared/music/samples/manifest.ts";
import { TRACKS } from "../src/client/shared/music/tracks.ts";

// A stand-in for an AudioContext (tests have none) that counts the nodes made.

class FakeParam {
  value = 0;
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
  linearRampToValueAtTime() {}
  setTargetAtTime() {}
  cancelScheduledValues() {}
}

class FakeNode {
  constructor(readonly kind: string) {}
  connect<T>(n: T): T {
    return n;
  }
  disconnect() {}
  start() {}
  stop() {}
}

class FakeCtx {
  currentTime = 0;
  sampleRate = 8000;
  made: FakeNode[] = [];
  private node(kind: string, params: string[]) {
    const n = new FakeNode(kind) as FakeNode & Record<string, unknown>;
    for (const p of params) n[p] = new FakeParam();
    this.made.push(n);
    return n;
  }
  createOscillator = () => Object.assign(this.node("osc", ["frequency", "detune"]), { type: "sine", setPeriodicWave() {} });
  createGain = () => this.node("gain", ["gain"]);
  createBiquadFilter = () => Object.assign(this.node("filter", ["frequency", "Q"]), { type: "lowpass" });
  createBufferSource = () => Object.assign(this.node("source", ["playbackRate", "detune"]), { buffer: null as unknown, loop: false });
  createStereoPanner = () => this.node("panner", ["pan"]);
  createWaveShaper = () => Object.assign(this.node("shaper", []), { curve: null, oversample: "none" });
  createConvolver = () => Object.assign(this.node("convolver", []), { buffer: null });
  createDynamicsCompressor = () => this.node("compressor", ["threshold", "knee", "ratio", "attack", "release"]);
  createDelay = () => this.node("delay", ["delayTime"]);
  createPeriodicWave = () => ({});
  createBuffer = (_ch: number, length: number) => ({ length, getChannelData: () => new Float32Array(length) });
  decodeAudioData = (data: ArrayBuffer) => Promise.resolve({ duration: 1, bytes: data.byteLength });
  count = (kind: string) => this.made.filter((n) => n.kind === kind).length;
}

const fake = () => new FakeCtx() as FakeCtx & BaseAudioContext;
const noBytes = () => Promise.resolve(new ArrayBuffer(8));
const ALL = Object.keys(VOICES);
const midiOf = (f: number) => 69 + 12 * Math.log2(f / 440);
const sampledTracks = Object.values(TRACKS).filter(usesSamples);

/** Every note an instrument plays in the sampled tracks, with how long it is held (seconds, at the track's slowest). */
function notesOf(inst: string): { midi: number; len: number }[] {
  const out: { midi: number; len: number }[] = [];
  for (const t of sampledTracks)
    for (const l of t.layers) {
      if (l.inst !== inst) continue;
      for (const bar of l.bars) {
        const toks = tokens(bar);
        toks.forEach((tok, s) => {
          let held = 1;
          while (s + held < STEPS_PER_BAR && toks[s + held] === "-") held++;
          for (const n of tok.split("+")) {
            const f = noteFreq(n);
            if (f) out.push({ midi: midiOf(f), len: held * stepSeconds(t, 0) * 0.95 });
          }
        });
      }
    }
  return out;
}

describe("the recordings", () => {
  test("every sampled instrument has its files", () => {
    for (const inst of ALL) {
      expect(urlsFor(inst).length).toBeGreaterThan(0);
      for (const url of urlsFor(inst)) expect(existsSync(url)).toBe(true);
    }
  });

  test("every note a track plays is near a recording, so re-pitching stays natural", () => {
    for (const inst of ALL) {
      const set = SAMPLE_SETS[VOICES[inst]!.set ?? inst]!;
      if (!("zones" in set)) continue;
      for (const { midi } of notesOf(inst)) expect(Math.abs(nearestZone(set.zones, midi).root - midi)).toBeLessThanOrEqual(inst === "timpani" ? 11 : 7);
    }
  });

  test("sustained instruments' recordings outlast the longest held note, even re-pitched up", () => {
    for (const inst of ["strings", "pad", "brass", "flute", "organ"]) {
      const voice = VOICES[inst]!;
      const set = SAMPLE_SETS[voice.set ?? inst]!;
      if (!("zones" in set)) throw new Error(inst);
      for (const { midi, len } of notesOf(inst)) {
        const rate = 2 ** ((midi - nearestZone(set.zones, midi).root) / 12);
        // The last quarter second of each recording is its fade.
        expect((len + voice.ring + voice.release) * rate).toBeLessThan(set.seconds - 0.25);
      }
    }
  });

  test("the nearest recording is re-pitched to the note", () => {
    const zones = [
      { root: 60, url: "a" },
      { root: 67, url: "b" },
    ];
    expect(nearestZone(zones, 62).url).toBe("a");
    expect(nearestZone(zones, 65).url).toBe("b");
  });
});

describe("playSample", () => {
  test("returns false (play the synth) until the recordings are decoded, then plays them", async () => {
    const ctx = fake();
    expect(playSample(ctx, ctx.createGain() as unknown as AudioNode, "piano", 0, 440, 0.5, 1)).toBe(false);
    await loadSamples(ctx, ["piano"], noBytes);
    expect(samplesReady(ctx, "piano")).toBe(true);
    const before = ctx.count("source");
    expect(playSample(ctx, ctx.createGain() as unknown as AudioNode, "piano", 0, 440, 0.5, 1)).toBe(true);
    expect(ctx.count("source")).toBe(before + 1);
    expect(ctx.count("osc")).toBe(0);
  });

  test("re-pitches by the distance to the recording's root", async () => {
    const ctx = fake();
    await loadSamples(ctx, ["strings"], noBytes);
    const set = SAMPLE_SETS.strings!;
    if (!("zones" in set)) throw new Error();
    const root = set.zones[3]!.root;
    playSample(ctx, ctx.createGain() as unknown as AudioNode, "strings", 0, 440 * 2 ** ((root + 1 - 69) / 12), 0.5, 1);
    const src = ctx.made.findLast((n) => n.kind === "source") as unknown as { playbackRate: FakeParam };
    expect(src.playbackRate.value).toBeCloseTo(2 ** (1 / 12), 5);
  });

  test("pad borrows the strings' recordings", async () => {
    const ctx = fake();
    await loadSamples(ctx, ["strings"], noBytes);
    expect(samplesReady(ctx, "pad")).toBe(true);
  });

  test("a failed download leaves the instrument on its synth voice", async () => {
    const ctx = fake();
    await loadSamples(ctx, ["flute"], () => Promise.reject(new Error("offline")));
    expect(playSample(ctx, ctx.createGain() as unknown as AudioNode, "flute", 0, 440, 0.5, 1)).toBe(false);
  });

  test("chiptune and sound-effect voices have no recordings; ?music=synth turns them all off", async () => {
    const ctx = fake();
    await loadSamples(ctx, ALL, noBytes);
    for (const inst of ["pulse", "lead", "chipnoise", "sonar", "bubble", "heart", "tick", "whistle"]) expect(playSample(ctx, ctx.createGain() as unknown as AudioNode, inst, 0, 440, 0.5, 1)).toBe(false);
    setSamplesEnabled(false);
    try {
      expect(playSample(ctx, ctx.createGain() as unknown as AudioNode, "piano", 0, 440, 0.5, 1)).toBe(false);
    } finally {
      setSamplesEnabled(true);
    }
  });
});

describe("tracks", () => {
  test("Tallest Tower (chiptune) and Racer (arcade) keep their synth voices; the rest use recordings", () => {
    for (const t of Object.values(TRACKS)) expect(usesSamples(t)).toBe(!t.id.startsWith("tower-") && !t.id.startsWith("racer-"));
  });

  test("a track on recordings makes far fewer audio nodes than on synth voices", async () => {
    for (const id of ["siege-battle", "dragon-battle", "land-play", "cup-quiz"] as const) {
      const track: Track = TRACKS[id];
      const seconds = 8 * STEPS_PER_BAR * stepSeconds(track, 1);
      const synth = fake();
      setSamplesEnabled(false);
      renderInto(synth, synth.createGain() as unknown as AudioNode, track, seconds, 1);
      setSamplesEnabled(true);
      const sampled = fake();
      await loadSamples(sampled, instrumentsOf(track), noBytes);
      renderInto(sampled, sampled.createGain() as unknown as AudioNode, track, seconds, 1);
      expect(sampled.made.length).toBeLessThan(synth.made.length * 0.7);
    }
  });
});
