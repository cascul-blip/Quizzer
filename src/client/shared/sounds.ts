/** Tiny synthesized sound effects (WebAudio), so no audio files need to be shipped. */

export type Sfx = "tick" | "tickHigh" | "timeUp" | "reveal" | "join" | "start" | "fanfare" | "thud" | "floor" | "rumble" | "roar";

const MUTE_KEY = "quizzer.muted";
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
})();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // storage unavailable: setting just won't persist
  }
}

/** Browsers only allow audio after a user gesture; call this from click/key handlers. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.2): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export function play(sfx: Sfx): void {
  if (muted || !ctx || ctx.state !== "running") return;
  switch (sfx) {
    case "tick":
      return tone(880, 0, 0.08, "square", 0.06);
    case "tickHigh":
      return tone(1320, 0, 0.1, "square", 0.09);
    case "timeUp":
      tone(330, 0, 0.25, "sawtooth", 0.12);
      return tone(220, 0.2, 0.45, "sawtooth", 0.12);
    case "reveal":
      tone(523.25, 0, 0.18, "triangle");
      tone(659.25, 0.1, 0.18, "triangle");
      return tone(783.99, 0.2, 0.35, "triangle");
    case "join":
      tone(660, 0, 0.08, "sine", 0.12);
      return tone(990, 0.06, 0.12, "sine", 0.12);
    case "start":
      [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.08, 0.2, "triangle", 0.15));
      return;
    case "thud":
      return tone(110, 0, 0.18, "sine", 0.3);
    case "floor":
      tone(784, 0, 0.12, "triangle", 0.14);
      return tone(1175, 0.08, 0.25, "triangle", 0.14);
    case "rumble":
      tone(55, 0, 1.2, "sine", 0.35);
      return tone(70, 0.3, 0.9, "triangle", 0.2);
    case "roar":
      [90, 118, 140, 75].forEach((f, i) => tone(f, i * 0.05, 1.1 - i * 0.1, "sawtooth", 0.13));
      return tone(45, 0.55, 0.6, "square", 0.2); // the smash
    case "fanfare":
      [523.25, 523.25, 523.25, 698.46, 880, 1046.5].forEach((f, i) => tone(f, i * 0.14, i === 5 ? 0.9 : 0.16, "triangle", 0.18));
      return;
  }
}
