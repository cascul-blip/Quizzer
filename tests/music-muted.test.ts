import { expect, test } from "bun:test";
import { MusicPlayer } from "../src/client/shared/music/engine.ts";
import { TRACKS } from "../src/client/shared/music/tracks.ts";

// An AudioContext stand-in that counts every node it makes.
class FakeParam {
  value = 0;
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
  setTargetAtTime() {}
  cancelScheduledValues() {}
}
class FakeCtx {
  currentTime = 0;
  sampleRate = 8000;
  state = "running";
  made = 0;
  destination = this.node([]);
  private node(params: string[], extra: object = {}) {
    this.made++;
    const n = Object.assign({ connect: <T>(x: T) => x, disconnect() {}, start() {}, stop() {}, setPeriodicWave() {} }, extra) as Record<string, unknown>;
    for (const p of params) n[p] = new FakeParam();
    return n;
  }
  createGain = () => this.node(["gain"]);
  createOscillator = () => this.node(["frequency", "detune"], { type: "sine" });
  createBiquadFilter = () => this.node(["frequency", "Q", "gain"], { type: "lowpass" });
  createBufferSource = () => this.node(["playbackRate", "detune"], { buffer: null, loop: false });
  createStereoPanner = () => this.node(["pan"]);
  createWaveShaper = () => this.node([], { curve: null, oversample: "none" });
  createConvolver = () => this.node([], { buffer: null });
  createDynamicsCompressor = () => this.node(["threshold", "knee", "ratio", "attack", "release"]);
  createDelay = () => this.node(["delayTime"]);
  createPeriodicWave = () => ({});
  createBuffer = (channels: number, length: number, sampleRate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, numberOfChannels: channels, getChannelData: (c: number) => data[c]! };
  };
}

test("with music off or muted, no notes are built; turning it back on brings them back", () => {
  const ctx = new FakeCtx();
  const music = new MusicPlayer(() => ctx as unknown as AudioContext, TRACKS, () => null);
  try {
    music.setLevel(0);
    music.play("racer-lobby");
    const silent = ctx.made;
    for (let i = 0; i < 40; i++) {
      ctx.currentTime += 0.1;
      music.play("racer-lobby");
    }
    expect(ctx.made).toBe(silent);
    music.setLevel(1);
    for (let i = 0; i < 40; i++) {
      ctx.currentTime += 0.1;
      music.play("racer-lobby");
    }
    expect(ctx.made).toBeGreaterThan(silent + 20);
  } finally {
    music.play(null);
  }
});
