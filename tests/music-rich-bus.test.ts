import { expect, spyOn, test } from "bun:test";
import { MusicPlayer, type Track } from "../src/client/shared/music/engine.ts";

// A stand-in AudioContext with just what the player and the rich bus build.
class FakeParam {
  value = 0;
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
  setTargetAtTime() {}
  cancelScheduledValues() {}
}
class FakeNode {
  disconnected = false;
  connect<T>(n: T): T {
    return n;
  }
  disconnect() {
    this.disconnected = true;
  }
}
class FakeCtx {
  currentTime = 0;
  sampleRate = 8000;
  state = "running";
  destination = new FakeNode();
  private node(params: string[], extra: object = {}) {
    const n = Object.assign(new FakeNode(), extra) as FakeNode & Record<string, unknown>;
    for (const p of params) n[p] = new FakeParam();
    return n;
  }
  createGain = () => this.node(["gain"]);
  createDynamicsCompressor = () => this.node(["threshold", "knee", "ratio", "attack", "release"]);
  createWaveShaper = () => this.node([], { curve: null, oversample: "none" });
  createConvolver = () => this.node([], { buffer: null });
  createBiquadFilter = () => this.node(["frequency", "Q", "gain"], { type: "lowpass" });
  createDelay = () => this.node(["delayTime"]);
  createBuffer = (channels: number, length: number, sampleRate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, numberOfChannels: channels, getChannelData: (c: number) => data[c]! };
  };
}

const track = (id: string, rich?: Track["rich"]): Track => ({ id, bpm: 120, bars: 1, layers: [], ...(rich ? { rich } : {}) });

test("the rich bus stays up until every rich track using it has faded out", () => {
  const ctx = new FakeCtx();
  const music = new MusicPlayer(() => ctx as unknown as AudioContext, { a: track("a", "arcade"), b: track("b", "arcade"), c: track("c") }, () => null);
  const bus = () => (music as unknown as { rich: { input: FakeNode } | null }).rich;
  const fadeOuts: (() => void)[] = [];
  const timeouts = spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
    fadeOuts.push(fn);
    return 0;
  }) as unknown as typeof setTimeout);
  try {
    music.play("a");
    const shared = bus();
    expect(shared).not.toBeNull();
    music.play("b"); // rich → rich: same bus
    expect(bus()).toBe(shared);
    music.play("c"); // → plain, while a and b both fade out through the bus
    expect(fadeOuts).toHaveLength(2);
    fadeOuts[0]!(); // a's fade is done, but b is still fading through the bus
    expect(bus()).toBe(shared);
    expect(shared!.input.disconnected).toBe(false);
    fadeOuts[1]!(); // b's fade is done: nothing uses the bus any more
    expect(bus()).toBeNull();
    expect(shared!.input.disconnected).toBe(true);
  } finally {
    timeouts.mockRestore();
    music.play(null);
  }
});
