import { describe, expect, test } from "bun:test";
import { MusicPlayer } from "../src/client/shared/music/engine.ts";

class RecordingParam {
  value = 1;
  events: { at: number; value: number }[] = [];
  setTargetAtTime(value: number, at: number) {
    this.events.push({ at, value });
  }
  setValueAtTime(value: number, at: number) {
    this.events.push({ at, value });
  }
  cancelScheduledValues(at: number) {
    this.events = this.events.filter((e) => e.at < at);
  }
  targetGainAt(time: number): number {
    let v = this.value;
    let latest = -Infinity;
    for (const e of this.events) if (e.at <= time && e.at >= latest) [v, latest] = [e.value, e.at];
    return v;
  }
}

class RecordingGainContext {
  currentTime = 0;
  state = "running";
  destination = {};
  gains: { gain: RecordingParam; disconnected: boolean }[] = [];
  createGain() {
    const node = { gain: new RecordingParam(), disconnected: false, connect: <T>(n: T) => n, disconnect: () => (node.disconnected = true) };
    this.gains.push(node);
    return node;
  }
  createDynamicsCompressor() {
    return { threshold: { value: 0 }, ratio: { value: 0 }, connect: <T>(n: T) => n };
  }
  combinedMusicGainAt(time: number): number {
    return this.gains.filter((g) => !g.disconnected).reduce((n, g) => n * g.gain.targetGainAt(time), 1);
  }
}

function player() {
  const ctx = new RecordingGainContext();
  const music = new MusicPlayer(
    () => ctx as unknown as AudioContext,
    {},
    () => null,
  );
  // why: The missing sting initializes the output chain without scheduling any notes.
  music.sting("nothing");
  return { ctx, music };
}

describe("music level and ducking", () => {
  test("a duck dips the music and brings it back afterwards", () => {
    const { ctx, music } = player();
    const full = ctx.combinedMusicGainAt(0);
    music.duck(3000);
    expect(ctx.combinedMusicGainAt(1)).toBeCloseTo(full * (0.15 / 0.55));
    expect(ctx.combinedMusicGainAt(10)).toBeCloseTo(full);
  });

  test("muting during a duck stays muted when the duck ends", () => {
    const { ctx, music } = player();
    music.duck(3000);
    ctx.currentTime = 1;
    music.setLevel(0);
    expect(ctx.combinedMusicGainAt(10)).toBe(0);
  });

  test("a volume change during a duck is kept when the duck ends", () => {
    const { ctx, music } = player();
    music.duck(3000);
    ctx.currentTime = 1;
    music.setLevel(0.5);
    expect(ctx.combinedMusicGainAt(10)).toBeCloseTo(0.5 * 0.55);
  });
});
