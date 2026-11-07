import shotUrl from "./sfx/shot.mp3";

/** Tiny synthesized sound effects (WebAudio); a few use a bundled recording instead (RECORDINGS). */

type Sfx = "cheerBlast" | "tick" | "tickHigh" | "timeUp" | "reveal" | "join" | "start" | "fanfare" | "thud" | "floor" | "rumble" | "roar" | "whoosh" | "chomp" | "bubble" | "heartbeat" | "laser" | "alarm" | "plant" | "capture" | "conquer" | "gearUp" | "skid" | "crash" | "repair" | "leverClick" | "land" | "diceRoll" | "diceLand" | "clink" | "gulp" | "poison" | "survive" | "gunshot" | "starterPistol" | "dragonRoar" | "sword" | "fireWhoosh" | "shieldClang" | "coins" | "chestOpen" | "trapHiss" | "jackpot" | "snip" | "spark" | "wrongWire" | "moduleChime" | "keypad" | "defuse" | "explosion" | "bowTwang" | "arrowHit" | "swordClang" | "stoneThud" | "placeClack" | "upgradeChime" | "heartLost" | "giantHorn" | "drumRoll" | "wolfHowl" | "trollRoar" | "giantStomp" | "castleCrumble" | "victoryBells" | "deliver" | "jingle";

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
    loadRecordings(ctx);
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

let noiseBuf: AudioBuffer | null = null;

/** A burst of white noise through a filter (swept to `freqTo` if given), with a sharp attack and an exponential decay. */
function noise(start: number, dur: number, filter: BiquadFilterType, freq: number, gain: number, q = 0.7, freqTo?: number, out?: AudioNode): void {
  if (!ctx) return;
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + start;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t0);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
  f.Q.setValueAtTime(q, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(out ?? ctx.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/** A sine whose pitch drops from `from` to `to`: the low punch under a bang. */
function thump(from: number, to: number, start: number, dur: number, gain: number, out?: AudioNode): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out ?? ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** A soft-clipping overdrive bus: whatever plays into it comes out louder and grittier without harsh clipping. */
function driveBus(drive: number, level: number): AudioNode | undefined {
  if (!ctx) return undefined;
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  const shaper = ctx.createWaveShaper();
  shaper.curve = curve;
  shaper.oversample = "4x";
  const g = ctx.createGain();
  g.gain.value = level;
  shaper.connect(g).connect(ctx.destination);
  return shaper;
}

/** Recorded effects, decoded once the audio is unlocked; until then (or if loading fails) play() synthesizes them. */
const RECORDINGS = { gunshot: { url: shotUrl, gain: 0.6 } } satisfies Partial<Record<Sfx, { url: string; gain: number }>>;
const recorded = new Map<Sfx, AudioBuffer>();
let recordingsRequested = false;

function loadRecordings(ac: AudioContext): void {
  if (recordingsRequested) return;
  recordingsRequested = true;
  for (const [sfx, { url }] of Object.entries(RECORDINGS)) {
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => ac.decodeAudioData(data))
      .then((buf) => recorded.set(sfx as Sfx, buf))
      .catch(() => {}); // keep the synthesized version
  }
}

/** Plays a decoded recording; false if it isn't ready. */
function playRecording(sfx: keyof typeof RECORDINGS): boolean {
  const buf = recorded.get(sfx);
  if (!ctx || !buf) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = RECORDINGS[sfx].gain;
  src.connect(g).connect(ctx.destination);
  src.start();
  return true;
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
    case "cheerBlast":
      // Power up during the shake, then a rising rocket whoosh and glitter.
      tone(330, 0, 0.15, "triangle", 0.12);
      tone(440, 0.16, 0.15, "triangle", 0.14);
      tone(660, 0.32, 0.22, "triangle", 0.16);
      noise(0.6, 0.7, "bandpass", 350, 0.25, 0.7, 5000);
      [880, 1175, 1568, 2093].forEach((f, i) => tone(f, 0.65 + i * 0.12, 0.35, "sine", 0.1));
      break;
    case "poison":
      // A low thud, then a wail falling away.
      tone(70, 0, 0.5, "sine", 0.45);
      [660, 587, 523, 466, 415, 370, 330, 277, 233].forEach((f, i) => tone(f, 0.2 + i * 0.09, 0.16, "sawtooth", 0.07));
      return tone(55, 1.05, 0.8, "triangle", 0.3);
    case "survive":
      // A relieved twang up the scale.
      [220, 277.18, 329.63, 440].forEach((f, i) => tone(f, i * 0.07, 0.35, "sawtooth", 0.07));
      return tone(880, 0.3, 0.4, "triangle", 0.1);
    case "starterPistol":
      // A pistol crack with a ricochet (Cup's starting shot).
      tone(120, 0, 0.12, "square", 0.3);
      tone(60, 0, 0.3, "sine", 0.35);
      [2400, 2000, 1600, 1250].forEach((f, i) => tone(f, 0.12 + i * 0.05, 0.06, "sine", 0.06));
      return;
    case "gunshot":
    {
      if (playRecording("gunshot")) return;
      // A big revolver: a crack and a blast that darkens as it dies, a chest-thumping punch and a sub boom,
      // all driven hard through a soft clipper, then rolling echoes off the canyon walls.
      const bang = driveBus(4, 0.85);
      noise(0, 0.06, "highpass", 1500, 1, 0.7, undefined, bang);
      noise(0, 0.55, "lowpass", 4000, 1, 0.9, 250, bang);
      thump(140, 38, 0, 0.45, 1, bang);
      thump(65, 28, 0.01, 0.9, 0.8, bang);
      noise(0.2, 0.7, "lowpass", 900, 0.3, 0.7, 300);
      noise(0.48, 0.9, "lowpass", 650, 0.15, 0.7, 250);
      return;
    }
    case "dragonRoar":
      // A deep growl that swells and falls away, with a rasp on top.
      [62, 78, 93, 55].forEach((f, i) => tone(f, i * 0.08, 1.4 - i * 0.15, "sawtooth", 0.15));
      [180, 165, 150, 130, 110].forEach((f, i) => tone(f, 0.1 + i * 0.12, 0.25, "square", 0.05));
      return tone(40, 0.3, 1.1, "sine", 0.3);
    case "sword":
      // A quick metal swish and a ring.
      [2400, 1900, 1500].forEach((f, i) => tone(f, i * 0.02, 0.05, "sawtooth", 0.035));
      tone(1318.5, 0.05, 0.25, "triangle", 0.07);
      return tone(160, 0.05, 0.08, "square", 0.08);
    case "fireWhoosh":
      // A roaring rush of flame: rising, then falling saw clusters over a low rumble.
      [140, 220, 330, 480, 620, 480, 330, 220].forEach((f, i) => tone(f, i * 0.06, 0.28, "sawtooth", 0.05));
      return tone(55, 0, 0.9, "triangle", 0.25);
    case "shieldClang":
      // A big bell-like clang, two partials ringing out.
      tone(523.25, 0, 0.9, "triangle", 0.2);
      tone(1396.9, 0, 0.7, "sine", 0.1);
      tone(2093, 0, 0.4, "sine", 0.06);
      return tone(90, 0, 0.12, "square", 0.15);
    case "coins":
      // Coins tumbling: quick bright pings.
      [2637, 3136, 2349, 3520, 2794].forEach((f, i) => tone(f, i * 0.05 + Math.random() * 0.02, 0.09, "sine", 0.06));
      return;
    case "chestOpen":
      // A creaking lid, then a sparkle.
      [180, 200, 170, 210].forEach((f, i) => tone(f, i * 0.05, 0.07, "square", 0.05));
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, 0.22 + i * 0.05, 0.18, "triangle", 0.08));
      return;
    case "trapHiss":
      // A snake-like hiss (thin detuned saws), then a sad drop.
      [5200, 5600, 6000, 5400].forEach((f, i) => tone(f, i * 0.04, 0.4, "sawtooth", 0.015));
      tone(392, 0.35, 0.2, "triangle", 0.12);
      return tone(277.2, 0.5, 0.35, "triangle", 0.12);
    case "jackpot":
      // A bright rising run and a long chord.
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, i * 0.06, 0.18, "square", 0.06));
      [1046.5, 1318.5, 1568].forEach((f) => tone(f, 0.45, 0.9, "triangle", 0.1));
      return;
    case "fanfare":
      [523.25, 523.25, 523.25, 698.46, 880, 1046.5].forEach((f, i) => tone(f, i * 0.14, i === 5 ? 0.9 : 0.16, "triangle", 0.18));
      return;
    case "snip":
      tone(1800, 0, 0.04, "square", 0.05);
      return tone(900, 0.03, 0.06, "triangle", 0.08);
    case "spark":
      [2400, 1800, 3200, 1400].forEach((f, i) => tone(f, i * 0.02, 0.05, "sawtooth", 0.04));
      return;
    case "wrongWire":
      tone(140, 0, 0.18, "square", 0.16);
      return tone(90, 0.12, 0.28, "sawtooth", 0.12);
    case "moduleChime":
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.07, 0.22, "triangle", 0.12));
      return;
    case "keypad":
      return tone(880, 0, 0.06, "square", 0.05);
    case "defuse":
      [392, 523.25, 659.25, 784, 1046.5].forEach((f, i) => tone(f, i * 0.1, i === 4 ? 0.7 : 0.18, "triangle", 0.14));
      return;
    case "explosion":
      tone(70, 0, 0.7, "sine", 0.45);
      tone(45, 0.05, 0.9, "triangle", 0.35);
      [180, 120, 80, 50].forEach((f, i) => tone(f, i * 0.04, 0.4, "sawtooth", 0.12));
      return;
    // ---------- Kingdom Siege ----------
    case "bowTwang":
      // A plucked bowstring bending down.
      tone(330, 0, 0.12, "triangle", 0.1);
      return tone(196, 0.02, 0.18, "sawtooth", 0.04);
    case "arrowHit":
      tone(900, 0, 0.03, "square", 0.04);
      return tone(140, 0.01, 0.07, "triangle", 0.1);
    case "swordClang":
      // Steel on steel: a bright ring with a low knock.
      tone(1760, 0, 0.3, "triangle", 0.07);
      tone(2637, 0, 0.18, "sine", 0.04);
      return tone(180, 0, 0.06, "square", 0.08);
    case "stoneThud":
      tone(90, 0, 0.18, "sine", 0.3);
      return tone(60, 0.02, 0.12, "triangle", 0.2);
    case "placeClack":
      // A miniature set down on the board: a wooden clack and a little bounce.
      tone(1200, 0, 0.03, "square", 0.06);
      tone(600, 0.01, 0.05, "triangle", 0.1);
      return tone(900, 0.09, 0.03, "square", 0.03);
    case "upgradeChime":
      [783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.06, 0.25, "triangle", 0.1));
      return;
    case "heartLost":
      // Stones crashing from the castle wall.
      tone(70, 0, 0.5, "sine", 0.35);
      [160, 120, 95, 140, 80].forEach((f, i) => tone(f, i * 0.05, 0.12, "square", 0.08));
      return;
    case "giantHorn":
      // A long, low war horn with a swell.
      tone(110, 0, 1.6, "sawtooth", 0.12);
      tone(164.8, 0.05, 1.5, "sawtooth", 0.06);
      return tone(55, 0, 1.7, "triangle", 0.15);
    case "drumRoll":
      for (let i = 0; i < 18; i++) tone(180 + (i % 2) * 20, i * 0.055, 0.05, "square", 0.03 + i * 0.004);
      return tone(70, 1.0, 0.35, "sine", 0.35);
    case "wolfHowl":
      // A rising then falling howl.
      [440, 520, 600, 660, 640, 580, 500].forEach((f, i) => tone(f, i * 0.11, 0.2, "sine", 0.06));
      return;
    case "trollRoar":
      [90, 110, 80].forEach((f, i) => tone(f, i * 0.07, 0.8, "sawtooth", 0.12));
      return tone(45, 0.1, 0.7, "sine", 0.25);
    case "giantStomp":
      tone(48, 0, 0.6, "sine", 0.5);
      tone(36, 0.03, 0.7, "triangle", 0.35);
      return tone(120, 0, 0.1, "square", 0.12);
    case "castleCrumble":
      // Stone giving way: a long rumble with tumbling blocks.
      tone(45, 0, 2.2, "sine", 0.45);
      tone(60, 0.1, 1.8, "triangle", 0.3);
      for (let i = 0; i < 14; i++) tone(70 + ((i * 37) % 120), 0.15 + i * 0.12, 0.14, "square", 0.07);
      return;
    case "victoryBells":
      // Church bells pealing down the scale.
      [1046.5, 880, 784, 659.25, 784, 880, 1046.5, 784].forEach((f, i) => {
        tone(f, i * 0.28, 1.2, "sine", 0.1);
        tone(f * 2.4, i * 0.28, 0.6, "sine", 0.03);
      });
      return;
    case "deliver":
      // A present down the chimney: a soft low "ho" under a sparkling chime arpeggio.
      tone(98, 0, 0.45, "sine", 0.14);
      tone(147, 0.02, 0.4, "triangle", 0.05);
      [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => {
        tone(f, 0.05 + i * 0.06, 0.6, "sine", 0.08);
        tone(f * 2, 0.05 + i * 0.06, 0.25, "sine", 0.02);
      });
      noise(0.05, 0.5, "highpass", 7000, 0.04);
      return;
    case "jingle":
      // A quick shake of sleigh bells.
      for (let i = 0; i < 5; i++) shake(i * 0.07 + (i % 2) * 0.012, 0.11 - i * 0.012);
      return;
  }
}

/** One shake of sleigh bells: a few bursts of high, ringing band-passed noise with bright little tones. */
function shake(start: number, gain: number, out?: AudioNode): void {
  if (!ctx) return;
  for (let j = 0; j < 3; j++) noise(start + j * 0.018, 0.09, "bandpass", 6500 + j * 1300, gain, 4, undefined, out);
  for (const f of [2637, 3520, 4186]) {
    const t0 = ctx.currentTime + start + Math.random() * 0.02;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(f * (0.99 + Math.random() * 0.02), t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * 0.25, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    osc.connect(g).connect(out ?? ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.17);
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

export interface Jingle {
  /** 0 = barely moving (an occasional soft shake), 1 = full gallop (fast, loud shimmer). */
  set(level: number): void;
  stop(): void;
}

/** A looping sleigh-bell shimmer under a flying sleigh; its rate and loudness follow `level`. */
export function startJingle(volume = 1): Jingle | null {
  unlockAudio();
  if (muted || !ctx) return null;
  const c = ctx;
  const out = c.createGain();
  out.gain.value = 0.0001;
  out.connect(c.destination);
  let level = 0;
  let next = 0; // seconds from now until the next shake
  let beat = 0;
  const LOOKAHEAD = 0.1;
  const TICK_MS = 50;
  const timer = setInterval(() => {
    if (muted || c.state !== "running") return;
    next -= TICK_MS / 1000;
    while (next < LOOKAHEAD) {
      if (level > 0.02) {
        // Bells bounce on the reindeer's stride: strong-weak pairs.
        shake(Math.max(0, next), (beat % 2 === 0 ? 0.12 : 0.07) * (0.5 + level * 0.5), out);
        beat++;
      }
      next += 0.32 - level * 0.2 + Math.random() * 0.02;
    }
  }, TICK_MS);
  return {
    set(l) {
      level = Math.max(0, Math.min(1, l));
      out.gain.setTargetAtTime((level > 0.02 ? 0.35 + level * 0.65 : 0.0001) * volume, c.currentTime, 0.08);
    },
    stop() {
      clearInterval(timer);
      out.gain.setTargetAtTime(0.0001, c.currentTime, 0.06);
      setTimeout(() => out.disconnect(), 600);
    },
  };
}
