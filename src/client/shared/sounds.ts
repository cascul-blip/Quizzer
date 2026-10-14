/** Tiny synthesized sound effects (WebAudio), so no audio files need to be shipped. */

export type Sfx = "tick" | "tickHigh" | "timeUp" | "reveal" | "join" | "start" | "fanfare" | "thud" | "floor" | "rumble" | "roar" | "whoosh" | "chomp" | "bubble" | "heartbeat" | "laser" | "alarm" | "plant" | "capture" | "conquer" | "gearUp" | "skid" | "crash" | "repair" | "leverClick" | "land" | "diceRoll" | "diceLand" | "clink" | "gulp" | "poison" | "survive" | "gunshot";

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
  for (const fn of muteListeners) fn();
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // storage unavailable: setting just won't persist
  }
}

/** The shared AudioContext (null until unlockAudio has run from a user gesture). */
export function getAudioContext(): AudioContext | null {
  return ctx;
}

const muteListeners = new Set<() => void>();
/** Called whenever sounds are muted or unmuted (music follows the mute button). */
export function onMuteChange(fn: () => void): () => void {
  muteListeners.add(fn);
  return () => muteListeners.delete(fn);
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
    case "land":
      // A heavy car hitting the road: a deep thump with a short crunch on top.
      tone(70, 0, 0.4, "sine", 0.45);
      tone(45, 0.03, 0.35, "triangle", 0.3);
      return tone(160, 0, 0.07, "square", 0.1);
    case "floor":
      tone(784, 0, 0.12, "triangle", 0.14);
      return tone(1175, 0.08, 0.25, "triangle", 0.14);
    case "rumble":
      tone(55, 0, 1.2, "sine", 0.35);
      return tone(70, 0.3, 0.9, "triangle", 0.2);
    case "roar":
      [90, 118, 140, 75].forEach((f, i) => tone(f, i * 0.05, 1.1 - i * 0.1, "sawtooth", 0.13));
      return tone(45, 0.55, 0.6, "square", 0.2); // the smash
    case "whoosh":
      [200, 320, 480, 640].forEach((f, i) => tone(f, i * 0.04, 0.3, "sawtooth", 0.05));
      return;
    case "chomp":
      tone(90, 0, 0.12, "square", 0.3);
      return tone(60, 0.1, 0.35, "square", 0.3);
    case "bubble":
      return tone(700 + Math.random() * 500, 0, 0.08, "sine", 0.08);
    case "heartbeat":
      tone(60, 0, 0.12, "sine", 0.4);
      return tone(55, 0.18, 0.14, "sine", 0.3);
    case "laser":
      // A falling zap, layered with a low buzz.
      [1800, 1500, 1200, 900, 600].forEach((f, i) => tone(f, i * 0.03, 0.12, "sawtooth", 0.06));
      return tone(80, 0, 0.6, "square", 0.12);
    case "alarm":
      [0, 0.3].forEach((t) => {
        tone(660, t, 0.14, "square", 0.1);
        tone(440, t + 0.14, 0.14, "square", 0.1);
      });
      return;
    case "plant":
      tone(196, 0, 0.09, "triangle", 0.22);
      return tone(392, 0.05, 0.12, "triangle", 0.12);
    case "capture":
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.06, 0.22, "triangle", 0.14));
      return;
    case "conquer":
      tone(65, 0, 0.9, "sawtooth", 0.2);
      [392, 392, 523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.1 + i * 0.12, i === 4 ? 0.7 : 0.14, "square", 0.09));
      return;
    case "gearUp":
      // Speed gained: quick rising square blips, the last one held a little.
      [330, 440, 554.37, 659.25, 880].forEach((f, i) => tone(f, i * 0.055, i === 4 ? 0.13 : 0.07, "square", 0.07));
      return;
    case "skid":
      // Speed lost: two detuned saws sliding down in small steps, like a tyre screech.
      [1500, 1380, 1260, 1130, 1010, 900, 800, 720].forEach((f, i) => {
        tone(f, i * 0.045, 0.09, "sawtooth", 0.04);
        tone(f * 1.07, i * 0.045, 0.09, "sawtooth", 0.035);
      });
      return;
    case "crash":
      // A harsh low crunch (clashing squares and saws), then a tone falling away.
      [47, 61, 83, 113].forEach((f, i) => tone(f, i * 0.015, 0.4 - i * 0.05, i % 2 ? "sawtooth" : "square", 0.16));
      [1900, 1370].forEach((f) => tone(f, 0, 0.05, "square", 0.05));
      [392, 330, 262, 196, 147, 98].forEach((f, i) => tone(f, 0.12 + i * 0.08, 0.16, "sawtooth", 0.08));
      return;
    case "repair":
      // Two ratchet clicks, then a bright rising two-note chime.
      [0, 0.09].forEach((t) => {
        tone(1700, t, 0.025, "square", 0.07);
        tone(240, t, 0.04, "square", 0.08);
      });
      tone(783.99, 0.2, 0.14, "triangle", 0.16);
      return tone(1174.66, 0.3, 0.24, "triangle", 0.16);
    case "leverClick":
      return tone(1500, 0, 0.025, "square", 0.035);
    case "diceRoll":
      // Dice rattling across a wooden table.
      [0, 0.07, 0.13, 0.22, 0.28, 0.37, 0.45, 0.56, 0.66, 0.8].forEach((t, i) => tone(500 + ((i * 337) % 600), t, 0.035, "square", 0.05));
      return;
    case "diceLand":
      tone(180, 0, 0.09, "triangle", 0.25);
      return tone(900, 0, 0.03, "square", 0.05);
    case "clink":
      // A tin cup set down.
      tone(2093, 0, 0.18, "sine", 0.08);
      return tone(3136, 0.01, 0.12, "sine", 0.05);
    case "gulp":
      // Three swallows, each a little lower.
      [0, 0.32, 0.64].forEach((t, i) => {
        tone(320 - i * 40, t, 0.07, "sine", 0.3);
        tone(140 - i * 15, t + 0.04, 0.12, "sine", 0.3);
      });
      return;
    case "poison":
      // A low thud, then a wail falling away.
      tone(70, 0, 0.5, "sine", 0.45);
      [660, 587, 523, 466, 415, 370, 330, 277, 233].forEach((f, i) => tone(f, 0.2 + i * 0.09, 0.16, "sawtooth", 0.07));
      return tone(55, 1.05, 0.8, "triangle", 0.3);
    case "survive":
      // A relieved twang up the scale.
      [220, 277.18, 329.63, 440].forEach((f, i) => tone(f, i * 0.07, 0.35, "sawtooth", 0.07));
      return tone(880, 0.3, 0.4, "triangle", 0.1);
    case "gunshot":
      // A pistol crack with a ricochet.
      tone(120, 0, 0.12, "square", 0.3);
      tone(60, 0, 0.3, "sine", 0.35);
      [2400, 2000, 1600, 1250].forEach((f, i) => tone(f, 0.12 + i * 0.05, 0.06, "sine", 0.06));
      return;
    case "fanfare":
      [523.25, 523.25, 523.25, 698.46, 880, 1046.5].forEach((f, i) => tone(f, i * 0.14, i === 5 ? 0.9 : 0.16, "triangle", 0.18));
      return;
  }
}

export interface Rev {
  /** 0 = idle, 1 = fully charged. */
  set(level: number): void;
  stop(): void;
}

/** A continuous engine rev whose pitch and volume follow the boost charge. Call from a press handler. `volume` scales how loud it is. */
export function startRev(volume = 1): Rev | null {
  unlockAudio();
  if (muted || !ctx) return null;
  const c = ctx;
  const main = c.createOscillator();
  const grit = c.createOscillator();
  const filter = c.createBiquadFilter();
  const gain = c.createGain();
  main.type = "sawtooth";
  grit.type = "square";
  filter.type = "lowpass";
  gain.gain.value = 0.0001;
  main.frequency.value = 55;
  grit.frequency.value = 57;
  main.connect(filter);
  grit.connect(filter);
  filter.connect(gain).connect(c.destination);
  main.start();
  grit.start();
  return {
    set(level) {
      const t = c.currentTime;
      const l = Math.max(0, Math.min(1, level));
      main.frequency.setTargetAtTime(55 + l * 230, t, 0.05);
      grit.frequency.setTargetAtTime(57 + l * 236, t, 0.05);
      filter.frequency.setTargetAtTime(350 + l * 2600, t, 0.05);
      gain.gain.setTargetAtTime((0.05 + l * 0.14) * volume, t, 0.05);
    },
    stop() {
      const t = c.currentTime;
      gain.gain.setTargetAtTime(0.0001, t, 0.06);
      main.stop(t + 0.4);
      grit.stop(t + 0.4);
    },
  };
}
