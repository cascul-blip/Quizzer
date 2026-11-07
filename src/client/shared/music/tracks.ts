/**
 * The built-in soundtrack: loops composed or arranged for each game mode.
 * Classic = upbeat game show, Tallest Tower = retro chiptune,
 * Sled Squad (submarine IDs) = Jingle Bells, arranged for a vintage Christmas band, Tower Fight = medieval battle,
 * Robot Attack = Christian Christmas carols for the snowman; Beethoven and Grieg for the robot,
 * Land Grab = calm ambient piano that grows into an orchestra as rings close,
 * Racer = sunny late-80s arcade-racing chiptune (tempo follows the car's speed), in the rich arcade sound (see rich.ts),
 * Cup of Death = original spaghetti-western themes: whistle, twangy guitar, galloping hooves,
 * Dragon's Hoard = a dark cave, a heroic battle with brass and choir, war drums under the fire, a plucky scramble,
 * Bomb Squad = spy-jazz (bass, brushes, vibraphone) that picks up a tick and more layers as the bomb runs down.
 * Kingdom Siege = a pastoral recorder-and-lute lobby, a marching battle with snare, tabor, recorders and brass,
 *   church bells for a victory and a low brass lament for a fallen castle. These three use the rich sound (see rich.ts).
 * Showdown = original Spaghetti Western music in the shape of a title theme: electric-guitar tremolo,
 *   a sparse whistle, flute in the gaps, anvil, whip and "hup!" stabs, the trumpet taking the tune as time
 *   runs out, and a one-shot draw sting. In D minor (the podium in D major), apart from Cup of Death's A minor.
 * Santa's Sleigh Run = public-domain Christmas carols with sleigh bells: "O Come, All Ye Faithful" (Adeste Fideles)
 *   on flute and glockenspiel in the lobby, "Joy to the World" (in D) for the rounds, building from
 *   sleigh bells and pizzicato at the start of the quiz to the full band, faster, while the sleighs fly, and
 *   "Hark! The Herald Angels Sing" (Mendelssohn) on brass for the podium.
 * Any of these can be replaced by an audio file in data/music/<id>.<ext>.
 */
import type { MusicTrackId } from "../../../shared/music-tracks.ts";
import type { Track } from "./engine.ts";
import { ROBOT_SKIN, type RobotSkin } from "../robot-skin.ts";

// ---------- composing helpers (each returns one 16-step bar) ----------

/** Notes with lengths in 16th steps: seq(["C5", 2], [".", 2], ["E5", 4], …). Must total 16. */
const seq = (...parts: [string, number][]) =>
  parts.flatMap(([tok, len]) => (tok === "." ? Array(len).fill(".") : [tok, ...Array(len - 1).fill("-")])).join(" ");
/** A note or chord held for the whole bar. */
const hold = (tok: string) => seq([tok, 16]);
/** Drum pattern from a compact 16-character string like "x...x...x...x...". */
const drum = (s: string) => s.split("").join(" ");
/** A single hit/ping on step 0 (e.g. a sonar note), silent otherwise. */
const once = (tok: string) => seq([tok, 1], [".", 15]);
/** Cycle through notes, one every `every` steps. */
const arp = (notes: string[], every = 1) => Array.from({ length: 16 }, (_, i) => (i % every === 0 ? notes[(i / every) % notes.length] : ".")).join(" ");
/** Eighth-note bass bouncing between a low and a high note. */
const bounce = (low: string, high: string) => arp([low, high], 2);
/** Repeat a note on the steps marked "x". */
const pump = (note: string, pattern: string) => pattern.split("").map((c) => (c === "x" ? note : ".")).join(" ");
const chord = (notes: string) => notes.split(" ").join("+");
const rest = drum("................");

// ---------- Classic: upbeat game show ----------

const classicLobby: Track = {
  id: "classic-lobby",
  bpm: 124,
  bars: 4,
  swing: 0.08,
  layers: [
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.9 },
    { inst: "clap", bars: [drum("....x.......x...")], vol: 0.8 },
    { inst: "hat", bars: [drum("..x...x...x...x.")], vol: 0.8 },
    { inst: "bass", bars: [bounce("C2", "C3"), bounce("A1", "A2"), bounce("F1", "F2"), bounce("G1", "G2")] },
    { inst: "pad", bars: [hold(chord("C4 E4 G4")), hold(chord("A3 C4 E4")), hold(chord("F3 A3 C4")), hold(chord("G3 B3 D4"))], vol: 0.8 },
    {
      inst: "lead",
      bars: [
        seq(["E5", 2], ["G5", 2], ["C6", 2], [".", 2], ["G5", 2], ["E5", 2], ["D5", 2], [".", 2]),
        seq(["C5", 2], ["E5", 2], ["A5", 2], [".", 2], ["G5", 2], ["E5", 2], ["C5", 2], [".", 2]),
        seq(["A4", 2], ["C5", 2], ["F5", 2], [".", 2], ["E5", 2], ["D5", 2], ["C5", 2], [".", 2]),
        seq(["B4", 2], ["D5", 2], ["G5", 3], [".", 1], ["A5", 2], ["G5", 2], ["F5", 2], ["D5", 2]),
      ],
    },
    { inst: "pluck", bars: [arp(["C5", "E5", "G5", "E5"], 2), arp(["A4", "C5", "E5", "C5"], 2), arp(["F4", "A4", "C5", "A4"], 2), arp(["G4", "B4", "D5", "B4"], 2)], vol: 0.45 },
  ],
};

const classicQuestion: Track = {
  id: "classic-question",
  bpm: 108,
  bars: 4,
  tempoBoost: 0.4,
  layers: [
    { inst: "tick", bars: [drum("x.x.x.x.x.x.x.x.")], vol: 0.9 },
    { inst: "bass", bars: [pump("A1", "x.x.x.x.x.x.x.x."), pump("F1", "x.x.x.x.x.x.x.x."), pump("D2", "x.x.x.x.x.x.x.x."), pump("E1", "x.x.x.x.x.x.x.x.")], vol: 0.8 },
    { inst: "pad", bars: [hold(chord("A3 C4 E4")), hold(chord("F3 A3 C4")), hold(chord("D3 F3 A3")), hold(chord("E3 G#3 B3"))], vol: 0.7 },
    { inst: "kick", bars: [drum("x.......x.......")], from: 0.3, to: 0.6 },
    { inst: "kick", bars: [drum("x...x...x...x...")], from: 0.6 },
    { inst: "hat", bars: [drum("xxxxxxxxxxxxxxxx")], vol: 0.45, from: 0.5 },
    { inst: "pulse", bars: [arp(["A4", "C5", "E5", "C5"]), arp(["F4", "A4", "C5", "A4"]), arp(["D4", "F4", "A4", "F4"]), arp(["E4", "G#4", "B4", "G#4"])], vol: 0.5, from: 0.6 },
    { inst: "snare", bars: [drum("....x.......x..."), drum("....x.......x..."), drum("....x.......x..."), drum("....x...x.x.xxxx")], vol: 0.8, from: 0.8 },
    {
      inst: "lead",
      bars: [
        seq(["E5", 2], [".", 2], ["D5", 2], [".", 2], ["C5", 2], [".", 2], ["B4", 2], [".", 2]),
        seq(["C5", 2], [".", 2], ["A4", 2], [".", 2], ["C5", 2], [".", 2], ["F5", 4]),
        seq(["F5", 2], [".", 2], ["E5", 2], [".", 2], ["D5", 2], [".", 2], ["A4", 4]),
        seq(["G#4", 4], ["B4", 4], ["E5", 4], ["G#5", 4]),
      ],
      from: 0.8,
    },
  ],
};

const classicLeaderboard: Track = {
  id: "classic-leaderboard",
  bpm: 116,
  bars: 4,
  swing: 0.1,
  layers: [
    { inst: "kick", bars: [drum("x.....x...x.....")], vol: 0.85 },
    { inst: "snare", bars: [drum("....x.......x...")], vol: 0.6 },
    { inst: "hat", bars: [drum("x.x.x.x.x.x.x.x.")], vol: 0.55 },
    {
      inst: "bass",
      bars: [
        seq(["F2", 3], ["F2", 1], [".", 2], ["F3", 2], [".", 2], ["C3", 2], ["A2", 2], ["F2", 2]),
        seq(["D2", 3], ["D2", 1], [".", 2], ["D3", 2], [".", 2], ["A2", 2], ["F2", 2], ["D2", 2]),
        seq(["Bb1", 3], ["Bb1", 1], [".", 2], ["Bb2", 2], [".", 2], ["F2", 2], ["D2", 2], ["Bb1", 2]),
        seq(["C2", 3], ["C2", 1], [".", 2], ["C3", 2], [".", 2], ["G2", 2], ["E2", 2], ["C2", 2]),
      ],
    },
    {
      inst: "pluck",
      bars: [
        pump(chord("F4 A4 C5"), "..x...x...x...x."),
        pump(chord("D4 F4 A4"), "..x...x...x...x."),
        pump(chord("D4 F4 Bb4"), "..x...x...x...x."),
        pump(chord("E4 G4 C5"), "..x...x...x...x."),
      ],
      vol: 0.55,
    },
    {
      inst: "bell",
      bars: [
        seq(["C6", 2], ["A5", 2], ["F5", 4], ["G5", 2], ["A5", 2], ["C6", 4]),
        seq(["D6", 2], ["C6", 2], ["A5", 4], ["F5", 8]),
        seq(["Bb5", 2], ["A5", 2], ["G5", 4], ["F5", 2], ["G5", 2], ["Bb5", 4]),
        seq(["C6", 4], ["G5", 4], ["E5", 4], ["C5", 4]),
      ],
      vol: 0.7,
    },
  ],
};

const classicResults: Track = {
  id: "classic-results",
  bpm: 96,
  bars: 4,
  layers: [
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.8 },
    { inst: "snare", bars: [drum("....x...x.x.x..."), drum("....x.......x..."), drum("....x...x.x.x..."), drum("x.x.x.x.xxxxxxxx")], vol: 0.6 },
    { inst: "pad", bars: [hold(chord("C4 E4 G4")), hold(chord("F3 A3 C4")), hold(chord("G3 B3 D4")), hold(chord("C4 E4 G4"))] },
    { inst: "bass", bars: [bounce("C2", "G2"), bounce("F1", "C2"), bounce("G1", "D2"), bounce("C2", "G2")] },
    {
      inst: "brass",
      bars: [
        seq(["G4", 2], ["C5", 2], ["E5", 2], ["G5", 6], [".", 1], ["E5", 1], ["G5", 2]),
        seq(["A5", 6], ["G5", 2], ["F5", 2], ["E5", 2], ["F5", 4]),
        seq(["D5", 2], ["E5", 2], ["F5", 2], ["G5", 6], ["F5", 2], ["D5", 2]),
        seq(["C5", 8], ["E5", 4], ["C5", 4]),
      ],
    },
    { inst: "bell", bars: [arp(["C6", "G5", "E6", "G5"], 2), arp(["C6", "A5", "F5", "A5"], 2), arp(["B5", "G5", "D6", "G5"], 2), arp(["C6", "G5", "E6", "C7"], 2)], vol: 0.35 },
  ],
};

// ---------- Tallest Tower: retro arcade (chiptune, so it keeps the synth voices) ----------

const towerLobby: Track = {
  id: "tower-lobby",
  samples: false,
  bpm: 120,
  bars: 4,
  layers: [
    { inst: "tribass", bars: [bounce("G2", "G3"), bounce("E2", "E3"), bounce("C2", "C3"), bounce("D2", "D3")] },
    { inst: "pulse", bars: [arp(["G4", "B4", "D5", "B4"]), arp(["E4", "G4", "B4", "G4"]), arp(["C4", "E4", "G4", "E4"]), arp(["D4", "F#4", "A4", "F#4"])], vol: 0.45 },
    { inst: "chipnoise", bars: [drum("..x...x...x...x.")], vol: 0.5 },
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.7 },
    {
      inst: "lead",
      bars: [
        seq(["D5", 4], ["B4", 2], ["G4", 2], ["A4", 4], ["B4", 4]),
        seq(["G5", 4], ["E5", 2], ["B4", 2], ["D5", 8]),
        seq(["E5", 4], ["C5", 2], ["G4", 2], ["E5", 2], ["D5", 2], ["C5", 4]),
        seq(["A4", 4], ["B4", 2], ["C5", 2], ["D5", 8]),
      ],
      vol: 0.8,
    },
  ],
};

const towerPlay: Track = {
  id: "tower-play",
  samples: false,
  bpm: 148,
  bars: 4,
  tempoBoost: 0.2,
  layers: [
    { inst: "tribass", bars: [pump("E2", "x.x.x.x.x.x.x.x."), pump("C2", "x.x.x.x.x.x.x.x."), pump("G2", "x.x.x.x.x.x.x.x."), pump("D2", "x.x.x.x.x.x.x.x.")] },
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.75 },
    { inst: "chipnoise", bars: [drum("....o.......o...")], vol: 0.8 },
    { inst: "pulse", bars: [arp(["E4", "G4", "B4", "G4"]), arp(["C4", "E4", "G4", "E4"]), arp(["G4", "B4", "D5", "B4"]), arp(["D4", "F#4", "A4", "F#4"])], vol: 0.4 },
    {
      inst: "lead",
      bars: [
        seq(["E5", 2], ["G5", 2], ["B5", 2], ["A5", 2], ["G5", 2], ["F#5", 2], ["E5", 2], ["D5", 2]),
        seq(["C5", 2], ["E5", 2], ["G5", 4], ["E5", 2], ["G5", 2], ["C6", 4]),
        seq(["B4", 2], ["D5", 2], ["G5", 2], ["B5", 2], ["A5", 2], ["G5", 2], ["D5", 4]),
        seq(["A4", 2], ["D5", 2], ["F#5", 2], ["A5", 4], ["F#5", 2], ["D5", 2], ["F#5", 2]),
      ],
      vol: 0.85,
      from: 0.4,
    },
    { inst: "chipnoise", bars: [drum("xxxxxxxxxxxxxxxx")], vol: 0.3, from: 0.75 },
    { inst: "pulse", bars: [arp(["B5", "G5", "E5", "G5"]), arp(["G5", "E5", "C5", "E5"]), arp(["D6", "B5", "G5", "B5"]), arp(["A5", "F#5", "D5", "F#5"])], vol: 0.3, from: 0.75 },
  ],
};

const towerResults: Track = {
  id: "tower-results",
  samples: false,
  bpm: 132,
  bars: 4,
  layers: [
    { inst: "tribass", bars: [bounce("C2", "C3"), bounce("F2", "F3"), bounce("G2", "G3"), bounce("C2", "C3")] },
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.7 },
    { inst: "chipnoise", bars: [drum("..x...x...x...x.")], vol: 0.5 },
    { inst: "pulse", bars: [arp(["C5", "E5", "G5", "E5"]), arp(["F4", "A4", "C5", "A4"]), arp(["G4", "B4", "D5", "B4"]), arp(["C5", "E5", "G5", "C6"])], vol: 0.4 },
    {
      inst: "lead",
      bars: [
        seq(["C5", 2], ["E5", 2], ["G5", 2], ["C6", 6], ["G5", 2], ["C6", 2]),
        seq(["A5", 4], ["F5", 2], ["A5", 2], ["C6", 8]),
        seq(["B5", 2], ["A5", 2], ["G5", 2], ["F5", 2], ["D5", 4], ["G5", 4]),
        seq(["C6", 6], [".", 2], ["C6", 2], ["C6", 2], ["C6", 4]),
      ],
    },
  ],
};

// ---------- Sled Squad: original arrangements of the public-domain Jingle Bells ----------
// James Lord Pierpont, 1857/1859. Familiar refrain in C major, with new accompaniment.
// Source/provenance: samples/CREDITS.md. Keep the tune present even at zero intensity.
const JINGLE_BELLS = [
  seq(["E5", 4], ["E5", 4], ["E5", 8]),
  seq(["E5", 4], ["E5", 4], ["E5", 8]),
  seq(["E5", 4], ["G5", 4], ["C5", 6], ["D5", 2]),
  hold("E5"),
  seq(["F5", 4], ["F5", 4], ["F5", 6], ["F5", 2]),
  seq(["F5", 4], ["E5", 4], ["E5", 4], ["E5", 2], ["E5", 2]),
  seq(["E5", 4], ["D5", 4], ["D5", 4], ["E5", 4]),
  seq(["D5", 8], ["G5", 8]),
  seq(["E5", 4], ["E5", 4], ["E5", 8]),
  seq(["E5", 4], ["E5", 4], ["E5", 8]),
  seq(["E5", 4], ["G5", 4], ["C5", 6], ["D5", 2]),
  hold("E5"),
  seq(["F5", 4], ["F5", 4], ["F5", 4], ["F5", 4]),
  seq(["F5", 4], ["E5", 4], ["E5", 4], ["E5", 2], ["E5", 2]),
  seq(["G5", 4], ["G5", 4], ["F5", 4], ["D5", 4]),
  seq(["C5", 12], [".", 4]),
];
const JINGLE_CHORDS = ["C", "C", "C", "C", "F", "C", "G7", "G7", "C", "C", "C", "C", "F", "C", "G7", "C"];
const JINGLE_VOICINGS: Record<string, string> = { C: "C4+E4+G4", F: "C4+F4+A4", G7: "B3+D4+F4+G4" };
const JINGLE_ROOTS: Record<string, [string, string]> = { C: ["C2", "G2"], F: ["F2", "C3"], G7: ["G2", "D3"] };
const JINGLE_PADS = JINGLE_CHORDS.map(c => hold(JINGLE_VOICINGS[c]!));
const JINGLE_COMP = JINGLE_CHORDS.map(c => pump(JINGLE_VOICINGS[c]!, "....x.......x..."));
const JINGLE_BASS = JINGLE_CHORDS.map(c => {
  const [root, fifth] = JINGLE_ROOTS[c]!;
  return seq([root, 3], [".", 1], [fifth, 3], [".", 1], [root, 3], [".", 1], [fifth, 3], [".", 1]);
});
const JINGLE_BELLS_UP = JINGLE_BELLS.map(bar => bar.replace(/([A-G][#b]?)(\d)/g, (_, n, oct) => `${n}${Number(oct) + 1}`));
const JINGLE_BELLS_DOWN = JINGLE_BELLS.map(bar => bar.replace(/([A-G][#b]?)(\d)/g, (_, n, oct) => `${n}${Number(oct) - 1}`));
const SLED_BELLS = drum("o.x.x.x.o.x.x.x.");

const submarineLobby: Track = {
  id: "submarine-lobby", bpm: 100, bars: JINGLE_BELLS.length, reverb: .3,
  layers: [
    { inst: "flute", bars: JINGLE_BELLS, vol: .5 },
    { inst: "bell", bars: JINGLE_BELLS_UP, vol: .18 },
    { inst: "strings", bars: JINGLE_PADS, vol: .28 },
    { inst: "piano", bars: JINGLE_BASS, vol: .4 },
    { inst: "pluck", bars: JINGLE_COMP, vol: .25 },
    { inst: "hat", bars: [SLED_BELLS], vol: .22 },
  ],
};

const submarineChase: Track = {
  id: "submarine-chase", bpm: 120, bars: JINGLE_BELLS.length, tempoBoost: .25, swing: .06, reverb: .25,
  layers: [
    { inst: "brass", bars: JINGLE_BELLS, vol: .58 },
    { inst: "bell", bars: JINGLE_BELLS_UP, vol: .2 },
    { inst: "piano", bars: JINGLE_BASS, vol: .55 },
    { inst: "pluck", bars: JINGLE_COMP, vol: .36 },
    { inst: "strings", bars: JINGLE_PADS, vol: .3 },
    { inst: "hat", bars: [SLED_BELLS], vol: .32 },
    { inst: "kick", bars: [drum("x.......x.......")], vol: .3 },
    { inst: "snare", bars: [drum("....x.......x...")], vol: .24, from: .35 },
    { inst: "flute", bars: JINGLE_BELLS, vol: .3, from: .65 },
    { inst: "hat", bars: [drum("..x...x...x...x.")], vol: .22, from: .8 },
    { inst: "cymbal", bars: [once("x"), ...Array(15).fill(rest)], vol: .22, from: .8 },
  ],
};

// Quiet piano and glockenspiel leave room for spoken symbol instructions.
const submarineDive: Track = {
  id: "submarine-dive", bpm: 88, bars: JINGLE_BELLS.length, reverb: .25,
  layers: [
    { inst: "piano", bars: JINGLE_BELLS_DOWN, vol: .32 },
    { inst: "bell", bars: JINGLE_BELLS, vol: .12 },
    { inst: "strings", bars: JINGLE_PADS, vol: .18 },
    { inst: "pluck", bars: JINGLE_CHORDS.map(c => hold(JINGLE_ROOTS[c]![0].replace(/(\d)$/, n => String(Number(n) + 1)))), vol: .24 },
  ],
};

const submarineResults: Track = {
  id: "submarine-results", bpm: 108, bars: JINGLE_BELLS.length, reverb: .35,
  layers: [
    { inst: "brass", bars: JINGLE_BELLS, vol: .6 },
    { inst: "bell", bars: JINGLE_BELLS_UP, vol: .26 },
    { inst: "strings", bars: JINGLE_PADS, vol: .36 },
    { inst: "piano", bars: JINGLE_BASS, vol: .5 },
    { inst: "pluck", bars: JINGLE_COMP, vol: .28 },
    { inst: "hat", bars: [SLED_BELLS], vol: .25 },
    { inst: "snare", bars: [drum("....x.......x...")], vol: .2 },
    { inst: "cymbal", bars: [once("x"), ...Array(15).fill(rest)], vol: .2 },
  ],
};

// ---------- Tower Fight: medieval battle ----------

const fightLobby: Track = {
  id: "fight-lobby",
  bpm: 92,
  bars: 4,
  layers: [
    { inst: "taiko", bars: [drum("o.....x.x...x...")], vol: 0.8 },
    { inst: "pad", bars: [hold(chord("D3 A3")), hold(chord("C3 G3")), hold(chord("D3 A3")), hold(chord("A2 E3"))], vol: 0.8 },
    { inst: "tribass", bars: [hold("D2"), hold("C2"), hold("D2"), hold("A1")], vol: 0.7 },
    {
      inst: "brass",
      bars: [
        seq(["D4", 2], ["D4", 1], [".", 1], ["A4", 4], ["G4", 2], ["F4", 2], ["E4", 4]),
        seq(["F4", 4], ["E4", 2], ["D4", 2], ["C4", 4], ["D4", 4]),
        seq(["D4", 2], ["D4", 1], [".", 1], ["A4", 4], ["G4", 2], ["F4", 2], ["E4", 4]),
        seq(["A4", 4], ["C5", 2], ["A4", 2], ["D5", 8]),
      ],
      vol: 0.9,
    },
  ],
};

const fightPlay: Track = {
  id: "fight-play",
  bpm: 116,
  bars: 4,
  tempoBoost: 0.25,
  layers: [
    { inst: "taiko", bars: [drum("o..x..x.o..x.x..")], vol: 0.7 },
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.4 },
    {
      inst: "bass",
      bars: [
        arp(["D2", ".", "D2", ".", "F2", ".", "D2", ".", "A2", ".", "D2", ".", "F2", ".", "E2", "."]),
        arp(["Bb1", ".", "Bb1", ".", "D2", ".", "Bb1", ".", "F2", ".", "Bb1", ".", "D2", ".", "C2", "."]),
        arp(["C2", ".", "C2", ".", "E2", ".", "C2", ".", "G2", ".", "C2", ".", "E2", ".", "D2", "."]),
        arp(["A1", ".", "A1", ".", "C#2", ".", "A1", ".", "E2", ".", "A1", ".", "C#2", ".", "E2", "."]),
      ],
      vol: 0.65,
    },
    { inst: "pad", bars: [hold(chord("D3 F3 A3")), hold(chord("Bb2 D3 F3")), hold(chord("C3 E3 G3")), hold(chord("A2 C#3 E3"))], vol: 0.6 },
    {
      inst: "brass",
      bars: [
        seq(["D5", 3], ["A4", 1], ["D5", 2], ["F5", 2], ["E5", 3], ["D5", 1], ["C5", 2], ["A4", 2]),
        seq(["Bb4", 4], ["D5", 2], ["F5", 2], ["G5", 4], ["F5", 2], ["D5", 2]),
        seq(["C5", 3], ["G4", 1], ["C5", 2], ["E5", 2], ["G5", 4], ["E5", 2], ["C5", 2]),
        seq(["A4", 2], ["C#5", 2], ["E5", 2], ["A5", 6], ["G5", 2], ["E5", 2]),
      ],
      from: 0.3,
    },
    { inst: "snare", bars: [drum("....x.......x.xx")], vol: 0.7, from: 0.6 },
    { inst: "hat", bars: [drum("x.x.x.x.x.x.x.x.")], vol: 0.45, from: 0.6 },
    { inst: "taiko", bars: [drum("x.x.x.x.x.x.x.x.")], vol: 0.28, from: 0.8 },
  ],
};

const fightResults: Track = {
  id: "fight-results",
  bpm: 100,
  bars: 4,
  layers: [
    { inst: "taiko", bars: [drum("o...x...o...x.x."), drum("o...x...o...x.x."), drum("o...x...o...x.x."), drum("o.x.o.x.oxxxxxxx")], vol: 0.7 },
    { inst: "pad", bars: [hold(chord("D3 F#3 A3")), hold(chord("G3 B3 D4")), hold(chord("A3 C#4 E4")), hold(chord("D3 F#3 A3"))] },
    { inst: "tribass", bars: [bounce("D2", "A2"), bounce("G1", "D2"), bounce("A1", "E2"), bounce("D2", "A2")] },
    {
      inst: "brass",
      bars: [
        seq(["A4", 2], ["D5", 2], ["F#5", 2], ["A5", 6], ["F#5", 2], ["A5", 2]),
        seq(["B5", 4], ["A5", 2], ["G5", 2], ["D5", 8]),
        seq(["C#5", 2], ["E5", 2], ["A5", 2], ["G5", 2], ["F#5", 4], ["E5", 4]),
        seq(["D5", 8], ["A5", 4], ["D6", 4]),
      ],
    },
  ],
};

// ---------- Robot Attack: Romantic orchestra ----------
// Famous public-domain themes arranged for a synth orchestra: strings, brass, flute,
// pizzicato (pluck), double bass (tribass), timpani and cymbals.

/** Move every note in these bars up (or down) by whole octaves. */
const shift = (bars: string[], by: number) => bars.map((b) => b.replace(/\d/g, (d) => String(Number(d) + by)));
/** Four quarter notes. */
const quarters = (a: string, b: string, c: string, d: string) => seq([a, 4], [b, 4], [c, 4], [d, 4]);
/** An 8-bar form: four bars of one pattern, then four of another. */
const halves = (a: string, b: string) => [a, a, a, a, b, b, b, b];

// Lobby: Beethoven, Symphony No. 7, Allegretto. The solemn long-short-short-long-long march in A minor.
const march = (first: string, second = first) => seq([first, 4], [first, 2], [first, 2], [second, 4], [second, 4]);

const robotLobby: Track = {
  id: "robot-lobby",
  bpm: 72,
  bars: 8,
  layers: [
    {
      inst: "strings",
      bars: [
        march(chord("A2 E3 C4 E4")),
        march(chord("G#2 E3 B3 E4")),
        march(chord("G#2 E3 B3 E4"), chord("A2 E3 C4 E4")),
        march(chord("C3 G3 E4 G4")),
        march(chord("B2 G3 D4 G4")),
        march(chord("B2 G3 D4 G4"), chord("C3 G3 E4 G4")),
        march(chord("B2 F#3 D#4 F#4")),
        march(chord("E3 G#3 B3 E4")),
      ],
      vol: 0.8,
    },
    { inst: "tribass", bars: [march("A1"), march("E2"), march("E2", "A1"), march("C2"), march("G2"), march("G2", "C2"), march("B1"), march("E2")], vol: 0.7 },
    { inst: "timpani", bars: [once("A2"), once("E3"), once("E3"), once("C3"), once("G2"), once("G2"), once("B2"), once("E3")], vol: 0.35 },
    // A flute line floats over the second half.
    {
      inst: "flute",
      bars: [rest, rest, rest, rest, seq(["D5", 8], ["B4", 4], ["D5", 4]), seq(["D5", 8], ["E5", 8]), seq(["F#5", 8], ["D#5", 4], ["F#5", 4]), seq(["E5", 12], [".", 4])],
      vol: 0.6,
    },
  ],
};

// Quiz: Grieg, In the Hall of the Mountain King. Like the original, it starts as tiptoeing
// pizzicato and ends as the full orchestra at about twice the speed.
const MOUNTAIN_KING = [
  seq(["B2", 2], ["C#3", 2], ["D3", 2], ["E3", 2], ["F#3", 2], ["D3", 2], ["F#3", 4]),
  seq(["F3", 2], ["C#3", 2], ["F3", 4], ["E3", 2], ["C3", 2], ["E3", 4]),
  seq(["B2", 2], ["C#3", 2], ["D3", 2], ["E3", 2], ["F#3", 2], ["D3", 2], ["F#3", 2], ["B3", 2]),
  seq(["A3", 2], ["F#3", 2], ["D3", 2], ["F#3", 2], ["A3", 8]),
  seq(["F#3", 2], ["G#3", 2], ["A#3", 2], ["B3", 2], ["C#4", 2], ["A#3", 2], ["C#4", 4]),
  seq(["D4", 2], ["A#3", 2], ["D4", 4], ["C#4", 2], ["A#3", 2], ["C#4", 4]),
  seq(["F#3", 2], ["G#3", 2], ["A#3", 2], ["B3", 2], ["C#4", 2], ["A#3", 2], ["C#4", 4]),
  seq(["D4", 2], ["A#3", 2], ["D4", 4], ["C#4", 8]),
];

const robotQuiz: Track = {
  id: "robot-quiz",
  bpm: 80,
  bars: 8,
  // From a creeping 80 BPM at the start of the round to a frantic 160 as time runs out.
  tempoBoost: 1,
  layers: [
    { inst: "pluck", bars: MOUNTAIN_KING, vol: 0.9 },
    { inst: "tribass", bars: halves(arp(["B1", "F#2"], 4), arp(["F#1", "C#2"], 4)), vol: 0.8 },
    { inst: "strings", bars: shift(MOUNTAIN_KING, 1), vol: 0.8, from: 0.3 },
    { inst: "timpani", bars: halves(pump("B2", "x.......x......."), pump("F#2", "x.......x.......")), vol: 0.5, from: 0.45, to: 0.8 },
    { inst: "brass", bars: halves(pump(chord("B3 D4 F#4"), "..x...x...x...x."), pump(chord("A#3 C#4 F#4"), "..x...x...x...x.")), vol: 0.5, from: 0.55 },
    { inst: "flute", bars: shift(MOUNTAIN_KING, 2), vol: 0.6, from: 0.7 },
    { inst: "timpani", bars: halves(pump("B2", "x...x...x...x..."), pump("F#2", "x...x...x...x...")), vol: 0.55, from: 0.8 },
    { inst: "cymbal", bars: [drum("x.......x.......")], vol: 0.6, from: 0.85 },
  ],
};

// Movement and attack: Beethoven, Symphony No. 5. Fate knocks at the door just before the lasers fire.
const FATE = [
  seq([".", 1], ["G4", 1], ["G4", 1], ["G4", 1], ["Eb4", 8], [".", 1], ["F4", 1], ["F4", 1], ["F4", 1]),
  seq(["D4", 8], [".", 1], ["G4", 1], ["G4", 1], ["G4", 1], ["Eb4", 1], ["Ab4", 1], ["Ab4", 1], ["Ab4", 1]),
  seq(["G4", 1], ["Eb5", 1], ["Eb5", 1], ["Eb5", 1], ["C5", 8], [".", 1], ["G4", 1], ["G4", 1], ["G4", 1]),
  seq(["D4", 1], ["Ab4", 1], ["Ab4", 1], ["Ab4", 1], ["G4", 1], ["F5", 1], ["F5", 1], ["F5", 1], ["D5", 8]),
];

const robotMove: Track = {
  id: "robot-move",
  bpm: 108,
  bars: 4,
  layers: [
    { inst: "strings", bars: FATE },
    { inst: "strings", bars: shift(FATE, -1), vol: 0.9 },
    { inst: "brass", bars: shift(FATE, -1), vol: 0.6 },
    {
      inst: "tribass",
      bars: [
        seq([".", 4], ["Eb2", 8], [".", 4]),
        seq(["D2", 8], ["C2", 2], ["C2", 2], ["C2", 2], ["C2", 2]),
        seq(["C2", 2], ["C2", 2], ["C2", 8], ["B1", 2], ["B1", 2]),
        seq(["B1", 2], ["B1", 2], ["B1", 2], ["B1", 2], ["G1", 8]),
      ],
      vol: 0.8,
    },
    { inst: "timpani", bars: [seq([".", 4], ["G2", 1], [".", 11]), once("G2"), seq([".", 4], ["C3", 1], [".", 11]), seq([".", 8], ["G2", 1], [".", 7])], vol: 0.7 },
  ],
};

// Final results: Beethoven, Symphony No. 9, Ode to Joy, for the survivors.
const ODE_OPENING = [quarters("F#4", "F#4", "G4", "A4"), quarters("A4", "G4", "F#4", "E4"), quarters("D4", "D4", "E4", "F#4")];
const ODE = [...ODE_OPENING, seq(["F#4", 6], ["E4", 2], ["E4", 8]), ...ODE_OPENING, seq(["E4", 6], ["D4", 2], ["D4", 8])];
const ODE_D = chord("D3 F#3 A3");
const ODE_A = chord("C#3 E3 A3");

const robotResults: Track = {
  id: "robot-results",
  bpm: 104,
  bars: 8,
  layers: [
    { inst: "strings", bars: shift(ODE, 1), vol: 0.9 },
    { inst: "brass", bars: ODE, vol: 0.7 },
    {
      inst: "strings",
      bars: [hold(ODE_D), seq([ODE_D, 8], [ODE_A, 8]), hold(ODE_D), hold(ODE_A), hold(ODE_D), seq([ODE_D, 8], [ODE_A, 8]), hold(ODE_D), seq([ODE_A, 8], [ODE_D, 8])],
      vol: 0.6,
    },
    {
      inst: "tribass",
      bars: [
        quarters("D2", "A2", "D2", "A2"),
        quarters("D2", "D2", "A1", "A1"),
        quarters("D2", "A2", "D2", "A2"),
        quarters("A1", "A1", "A1", "A1"),
        quarters("D2", "A2", "D2", "A2"),
        quarters("D2", "D2", "A1", "A1"),
        quarters("D2", "A2", "D2", "A2"),
        quarters("A1", "A1", "D2", "D2"),
      ],
      vol: 0.8,
    },
    { inst: "timpani", bars: [once("D3"), once("D3"), once("D3"), once("A2"), once("D3"), once("D3"), once("D3"), seq(["A2", 1], [".", 7], ["D3", 1], [".", 7])], vol: 0.5 },
    { inst: "cymbal", bars: [drum("x..............."), rest, rest, rest], vol: 0.5 },
  ],
};

// ---------- Land Grab: calm ambient piano that grows into an orchestra ----------
// Sparse piano in a big hall while the land is quiet. As a team gets close to closing
// a ring the same four chords (Am F C G) speed up and gather strings, brass and drums.

/** One note every eighth, up through the chord and back down. */
const rolled = (notes: string) => arp(notes.split(" "), 2);
/** Steady eighth notes. */
const eighths = (tok: string) => pump(tok, "x.x.x.x.x.x.x.x.");

const landLobby: Track = {
  id: "land-lobby",
  bpm: 62,
  bars: 8,
  reverb: 0.4,
  layers: [
    {
      inst: "piano",
      bars: [
        seq(["F3+C4", 4], ["E4", 4], ["A4", 8]),
        seq(["C3+G3", 4], ["E4", 4], ["B4", 4], ["G4", 4]),
        seq(["F3+C4", 4], ["A4", 4], ["C5", 4], ["E5", 4]),
        seq(["G3+D4", 4], [".", 4], ["D5", 8]),
        seq(["F3+C4", 4], ["E5", 4], ["C5", 8]),
        seq(["E3+B3", 4], ["G4", 4], ["B4", 4], ["D5", 4]),
        seq(["D3+A3", 4], ["F4", 4], ["A4", 4], ["C5", 4]),
        seq(["G3+D4", 4], ["B4", 4], ["G4", 8]),
      ],
    },
    // A few high notes, far apart.
    { inst: "piano", bars: [rest, seq([".", 10], ["G5", 2], ["E5", 4]), rest, seq([".", 8], ["B5", 4], ["G5", 4]), rest, rest, seq([".", 12], ["E5", 4]), rest], vol: 0.4 },
    {
      inst: "pad",
      bars: [
        hold(chord("F3 A3 C4")),
        hold(chord("E3 G3 C4")),
        hold(chord("F3 A3 C4")),
        hold(chord("G3 B3 D4")),
        hold(chord("F3 A3 C4")),
        hold(chord("E3 G3 B3")),
        hold(chord("D3 F3 A3")),
        hold(chord("G3 B3 D4")),
      ],
      vol: 0.5,
    },
  ],
};

const LAND_THEME = [
  seq(["E5", 6], ["C5", 2], ["B4", 4], ["C5", 4]),
  seq(["A4", 8], ["C5", 4], ["F5", 4]),
  seq(["E5", 6], ["D5", 2], ["C5", 4], ["G4", 4]),
  seq(["D5", 12], [".", 4]),
  seq(["E5", 6], ["C5", 2], ["B4", 4], ["C5", 4]),
  seq(["A5", 8], ["G5", 4], ["F5", 4]),
  seq(["G5", 6], ["E5", 2], ["C5", 4], ["E5", 4]),
  seq(["D5", 8], ["B4", 8]),
];

const landPlay: Track = {
  id: "land-play",
  // 66 BPM while the land is quiet, about 109 when a ring is about to close.
  bpm: 66,
  bars: 8,
  tempoBoost: 0.65,
  reverb: 0.35,
  layers: [
    // Quiet land: a chord, a long gap, a few notes.
    {
      inst: "piano",
      bars: [
        seq(["A3+E4", 4], [".", 4], ["C5", 4], ["B4", 4]),
        seq(["F3+C4", 4], [".", 4], ["A4", 8]),
        seq(["C3+G3", 4], [".", 2], ["E4", 2], ["G4", 4], ["E5", 4]),
        seq(["G3+D4", 4], [".", 4], ["D5", 6], [".", 2]),
        seq(["A3+E4", 4], [".", 2], ["E5", 2], ["C5", 4], ["B4", 4]),
        seq(["F3+C4", 4], ["A4", 4], ["C5", 8]),
        seq(["C3+G3", 4], [".", 4], ["G4", 4], ["E4", 4]),
        seq(["G3+D4", 4], [".", 4], ["B4", 8]),
      ],
      to: 0.25,
    },
    { inst: "pad", bars: [hold(chord("A3 C4 E4")), hold(chord("F3 A3 C4")), hold(chord("G3 C4 E4")), hold(chord("G3 B3 D4"))], vol: 0.5 },
    // Something is stirring: the piano starts to flow and picks up the theme.
    { inst: "piano", bars: [rolled("A3 E4 A4 C5 E5 C5 A4 E4"), rolled("F3 C4 F4 A4 C5 A4 F4 C4"), rolled("C3 G3 C4 E4 G4 E4 C4 G3"), rolled("G3 D4 G4 B4 D5 B4 G4 D4")], vol: 0.6, from: 0.25, to: 0.85 },
    { inst: "piano", bars: LAND_THEME, from: 0.25, to: 0.45 },
    { inst: "tribass", bars: [hold("A2"), hold("F2"), hold("C2"), hold("G2")], vol: 0.6, from: 0.25, to: 0.65 },
    // A ring is taking shape: strings take the theme over a heartbeat.
    { inst: "strings", bars: LAND_THEME, vol: 0.9, from: 0.45 },
    { inst: "strings", bars: [hold(chord("A3 C4 E4")), hold(chord("F3 A3 C4")), hold(chord("G3 C4 E4")), hold(chord("G3 B3 D4"))], vol: 0.55, from: 0.45, to: 0.65 },
    { inst: "heart", bars: [drum("x.......x.......")], vol: 0.6, from: 0.45, to: 0.65 },
    // Nearly closed: driving low strings, brass and timpani.
    { inst: "strings", bars: [eighths(chord("A2 E3")), eighths(chord("F2 C3")), eighths(chord("C3 G3")), eighths(chord("G2 D3"))], vol: 0.75, from: 0.65 },
    { inst: "tribass", bars: [eighths("A1"), eighths("F1"), eighths("C2"), eighths("G1")], vol: 0.7, from: 0.65 },
    { inst: "brass", bars: shift(LAND_THEME, -1), vol: 0.8, from: 0.65 },
    { inst: "timpani", bars: [pump("A2", "x...x...x...x..."), pump("F2", "x...x...x...x..."), pump("C3", "x...x...x...x..."), pump("G2", "x...x...x...x...")], vol: 0.5, from: 0.65 },
    // One tile from closing: everything at once.
    { inst: "piano", bars: [arp(["A4", "C5", "E5", "A5"]), arp(["F4", "A4", "C5", "F5"]), arp(["G4", "C5", "E5", "G5"]), arp(["G4", "B4", "D5", "G5"])], vol: 0.5, from: 0.85 },
    { inst: "strings", bars: shift(LAND_THEME, 1), vol: 0.6, from: 0.85 },
    { inst: "taiko", bars: [drum("o..x..x.o..x.x..")], vol: 0.6, from: 0.85 },
    { inst: "cymbal", bars: [drum("x..............."), rest], vol: 0.6, from: 0.85 },
  ],
};

const landResults: Track = {
  id: "land-results",
  bpm: 72,
  bars: 8,
  reverb: 0.3,
  layers: [
    {
      inst: "piano",
      bars: [
        seq(["E5", 4], ["G5", 4], ["C6", 8]),
        seq(["B5", 4], ["G5", 4], ["D5", 8]),
        seq(["C5", 4], ["E5", 4], ["A5", 8]),
        seq(["A5", 4], ["G5", 4], ["F5", 8]),
        seq(["E5", 4], ["G5", 4], ["C6", 8]),
        seq(["D6", 6], ["B5", 2], ["G5", 8]),
        seq(["A5", 4], ["F5", 4], ["C5", 4], ["D5", 4]),
        seq(["C5", 12], [".", 4]),
      ],
    },
    {
      inst: "piano",
      bars: [
        rolled("C3 G3 C4 E4 G4 E4 C4 G3"),
        rolled("B2 G3 B3 D4 G4 D4 B3 G3"),
        rolled("A2 E3 A3 C4 E4 C4 A3 E3"),
        rolled("F2 C3 F3 A3 C4 A3 F3 C3"),
        rolled("C3 G3 C4 E4 G4 E4 C4 G3"),
        rolled("G2 D3 G3 B3 D4 B3 G3 D3"),
        rolled("F2 C3 F3 A3 C4 A3 F3 C3"),
        rolled("C3 G3 C4 E4 G4 E4 C4 G3"),
      ],
      vol: 0.6,
    },
    {
      inst: "strings",
      bars: [
        hold(chord("E3 G3 C4")),
        hold(chord("D3 G3 B3")),
        hold(chord("E3 A3 C4")),
        hold(chord("F3 A3 C4")),
        hold(chord("E3 G3 C4")),
        hold(chord("D3 G3 B3")),
        hold(chord("F3 A3 C4")),
        hold(chord("E3 G3 C4")),
      ],
      vol: 0.55,
    },
    { inst: "tribass", bars: [hold("C2"), hold("B1"), hold("A1"), hold("F1"), hold("C2"), hold("G1"), hold("F1"), hold("C2")], vol: 0.6 },
  ],
};

// ---------- Racer: sunny coastal-drive arcade chiptune ----------
// A major, in the IV-V-iii-vi mould of late-80s arcade racers: octave-hopping
// triangle bass, syncopated square lead, pulse stabs and arpeggios, noise drums.

/** Driving eighth-note octave bass: low low HIGH low low HIGH low HIGH. */
const octaves = (low: string, high: string) => arp([low, low, high, low, low, high, low, high], 2);
/** Short syncopated chord stabs. */
const stabs = (notes: string) => pump(chord(notes), "..x..x..x...x.x.");

const RACER_LOBBY_ROOTS = ["A1", "F#1", "D2", "E2"];

const racerLobby: Track = {
  id: "racer-lobby",
  rich: "arcade",
  bpm: 104,
  bars: 8,
  swing: 0.08,
  layers: [
    { inst: "kick", bars: [drum("x.....x...x.....")], vol: 0.75 },
    { inst: "chipnoise", bars: [drum("....o.......o..."), drum("....o.......o.x.")], vol: 0.6 },
    { inst: "hat", bars: [drum("..x...x...x...x.")], vol: 0.6 },
    {
      inst: "tribass",
      bars: RACER_LOBBY_ROOTS.map((r) => {
        const up = r.replace(/\d/, (d) => String(Number(d) + 1));
        return seq([r, 3], [r, 1], [".", 2], [up, 2], [".", 2], [r, 2], [up, 2], [r, 2]);
      }),
      vol: 0.9,
    },
    { inst: "pulse", bars: [stabs("E4 A4 C#5"), stabs("F#4 A4 C#5"), stabs("F#4 A4 D5"), stabs("E4 G#4 B4")], vol: 0.4 },
    {
      inst: "lead",
      bars: [
        seq(["E5", 4], ["C#5", 2], ["E5", 2], ["A5", 6], [".", 2]),
        seq(["A5", 2], ["G#5", 2], ["F#5", 4], ["C#5", 6], [".", 2]),
        seq(["F#5", 4], ["D5", 2], ["F#5", 2], ["A5", 4], ["F#5", 4]),
        seq(["G#5", 3], ["F#5", 3], ["E5", 2], ["B4", 6], [".", 2]),
        seq(["C#6", 4], ["A5", 2], ["E5", 2], ["A5", 6], [".", 2]),
        seq(["C#6", 2], ["B5", 2], ["A5", 4], ["F#5", 6], [".", 2]),
        seq(["D6", 3], ["C#6", 3], ["A5", 2], ["F#5", 4], ["A5", 4]),
        seq(["B5", 4], ["G#5", 4], ["E5", 4], ["G#5", 2], ["B5", 2]),
      ],
      vol: 0.7,
      echo: 0.3,
    },
  ],
};

// 16 bars: an 8-bar theme (D E C#m F#m / D E A E) and an 8-bar bridge (Bm E A F#m / Bm C#m D E).
const RACER_ROOTS = ["D2", "E2", "C#2", "F#2", "D2", "E2", "A1", "E2", "B1", "E2", "A1", "F#2", "B1", "C#2", "D2", "E2"];
const RACER_CHORDS = [
  "F#4 A4 C#5",
  "E4 G#4 B4",
  "E4 G#4 C#5",
  "F#4 A4 C#5",
  "F#4 A4 D5",
  "E4 G#4 B4",
  "E4 A4 C#5",
  "E4 G#4 B4",
  "D4 F#4 B4",
  "E4 G#4 B4",
  "E4 A4 C#5",
  "F#4 A4 C#5",
  "D4 F#4 B4",
  "E4 G#4 C#5",
  "F#4 A4 D5",
  "E4 G#4 B4",
];
const octaveUp = (note: string, by = 1) => note.replace(/\d/, (d) => String(Number(d) + by));

const racerDrive: Track = {
  id: "racer-drive",
  rich: "arcade",
  // 112 BPM while crawling, about 162 at full speed.
  bpm: 112,
  bars: 16,
  tempoBoost: 0.45,
  layers: [
    // Crawling or crashed: just a limping kick and bass.
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.8, to: 0.15 },
    { inst: "tribass", bars: RACER_ROOTS.map((r) => pump(r, "x...x.x.x...x.x.")), vol: 0.85, to: 0.15 },
    // Rolling: the full rhythm section.
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.8, from: 0.15 },
    { inst: "tribass", bars: RACER_ROOTS.map((r) => octaves(r, octaveUp(r))), from: 0.15 },
    { inst: "chipnoise", bars: [drum("....o.......o...")], vol: 0.8, from: 0.15 },
    { inst: "pulse", bars: RACER_CHORDS.map(stabs), vol: 0.4, from: 0.15 },
    { inst: "hat", bars: [drum("..x...x...x...x.")], vol: 0.6, from: 0.3, to: 0.75 },
    {
      inst: "lead",
      bars: [
        seq(["F#5", 3], ["A5", 3], ["F#5", 2], [".", 2], ["E5", 2], ["F#5", 2], ["A5", 2]),
        seq(["G#5", 3], ["B5", 3], ["G#5", 2], [".", 2], ["E5", 2], ["G#5", 2], ["B5", 2]),
        seq(["C#6", 3], ["B5", 3], ["G#5", 2], ["E5", 2], ["G#5", 2], ["B5", 4]),
        seq(["A5", 6], [".", 2], ["F#5", 2], ["A5", 2], ["C#6", 4]),
        seq(["D6", 3], ["C#6", 3], ["A5", 2], [".", 2], ["F#5", 2], ["A5", 2], ["D6", 2]),
        seq(["E6", 3], ["D6", 3], ["B5", 2], [".", 2], ["G#5", 2], ["B5", 2], ["E6", 2]),
        seq(["C#6", 3], ["B5", 3], ["A5", 2], ["E5", 2], ["A5", 2], ["C#6", 4]),
        seq(["B5", 4], ["G#5", 2], ["E5", 2], ["F#5", 2], ["G#5", 2], ["B5", 2], ["E5", 2]),
        seq(["D5", 2], ["F#5", 2], ["B5", 4], ["A5", 2], ["F#5", 2], ["D5", 2], ["F#5", 2]),
        seq(["E5", 2], ["G#5", 2], ["B5", 4], ["G#5", 2], ["E5", 2], ["G#5", 4]),
        seq(["C#5", 2], ["E5", 2], ["A5", 4], ["G#5", 2], ["A5", 2], ["C#6", 4]),
        seq(["C#6", 3], ["A5", 3], ["F#5", 6], [".", 2], ["A5", 2]),
        seq(["B5", 3], ["D6", 3], ["B5", 2], [".", 2], ["F#5", 2], ["B5", 2], ["D6", 2]),
        seq(["C#6", 3], ["E6", 3], ["C#6", 2], [".", 2], ["G#5", 2], ["C#6", 2], ["E6", 2]),
        seq(["F#6", 4], ["E6", 2], ["D6", 2], ["A5", 2], ["D6", 2], ["F#6", 4]),
        seq(["E6", 3], ["D6", 3], ["B5", 2], ["G#5", 2], ["B5", 2], ["E6", 1], [".", 1], ["E6", 2]),
      ],
      vol: 0.85,
      from: 0.3,
      echo: 0.25,
    },
    // Cruising: snare with a fill every four bars.
    { inst: "snare", bars: [drum("....x.......x..."), drum("....x.......x..."), drum("....x.......x..."), drum("....x.....x.x.xx")], vol: 0.55, from: 0.5 },
    // Fast: sixteenth-note arpeggios.
    {
      inst: "pulse",
      bars: RACER_CHORDS.map((c) => {
        const [a, b, d] = c.split(" ").map((n) => octaveUp(n)) as [string, string, string];
        return arp([a, b, d, b]);
      }),
      vol: 0.3,
      from: 0.6,
    },
    // Flat out: busy hats and a sparkling top line.
    { inst: "chipnoise", bars: [drum("xxxxxxxxxxxxxxxx")], vol: 0.28, from: 0.75 },
    { inst: "openhat", bars: [drum("..x...x...x...x.")], vol: 0.5, from: 0.75 },
    {
      inst: "pulse",
      bars: RACER_CHORDS.map((c) => {
        const [a, b, d] = c.split(" ").map((n) => octaveUp(n, 2)) as [string, string, string];
        return arp([d, ".", b, a, ".", b, d, "."]);
      }),
      vol: 0.22,
      from: 0.87,
    },
  ],
};

const racerResults: Track = {
  id: "racer-results",
  rich: "arcade",
  bpm: 138,
  bars: 4,
  layers: [
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.75 },
    { inst: "chipnoise", bars: [drum("....o.......o..."), drum("....o.......o..."), drum("....o.......o..."), drum("....o...o.o.oooo")], vol: 0.7 },
    { inst: "hat", bars: [drum("..x...x...x...x.")], vol: 0.6 },
    { inst: "tribass", bars: [octaves("A1", "A2"), octaves("D2", "D3"), octaves("E2", "E3"), octaves("A1", "A2")] },
    { inst: "pulse", bars: [arp(["A4", "C#5", "E5", "C#5"]), arp(["A4", "D5", "F#5", "D5"]), arp(["G#4", "B4", "E5", "B4"]), arp(["A4", "C#5", "E5", "A5"])], vol: 0.35 },
    {
      inst: "lead",
      bars: [
        seq(["E5", 2], ["A5", 2], ["C#6", 2], ["E6", 6], ["C#6", 2], ["E6", 2]),
        seq(["F#6", 4], ["D6", 2], ["F#6", 2], ["A6", 8]),
        seq(["G#6", 2], ["F#6", 2], ["E6", 2], ["D6", 2], ["B5", 4], ["E6", 4]),
        seq(["A6", 3], ["E6", 3], ["A6", 2], [".", 2], ["A6", 2], ["A6", 4]),
      ],
      vol: 0.8,
      echo: 0.25,
    },
  ],
};


// ---------- Cup of Death: spaghetti western (original themes) ----------

/** Boom-chick bass: the root on the beat, the fifth in between. */
const boomChick = (root: string, fifth: string) => seq([root, 4], [fifth, 4], [root, 4], [fifth, 4]);
const GALLOP = drum("x.xxx.xxx.xxx.xx");
const AM = chord("A3 C4 E4");
const G_ = chord("G3 B3 D4");
const F_ = chord("F3 A3 C4");
const E_ = chord("E3 G#3 B3");

const cupLobby: Track = {
  id: "cup-lobby",
  bpm: 120,
  bars: 4,
  swing: 0.15,
  layers: [
    // A honky-tonk saloon piano, oom-pah in the left hand.
    {
      inst: "piano",
      bars: [
        seq(["G2", 4], [chord("B3 D4"), 4], ["D2", 4], [chord("B3 D4"), 4]),
        seq(["C3", 4], [chord("C4 E4"), 4], ["G2", 4], [chord("C4 E4"), 4]),
        seq(["G2", 4], [chord("B3 D4"), 4], ["D2", 4], [chord("B3 D4"), 4]),
        seq(["D2", 4], [chord("C4 F#4"), 4], ["A2", 4], [chord("C4 F#4"), 4]),
      ],
      vol: 0.8,
    },
    {
      inst: "piano",
      bars: [
        seq(["D5", 2], ["E5", 2], ["D5", 2], ["B4", 2], ["G4", 4], ["B4", 2], ["D5", 2]),
        seq(["E5", 2], ["G5", 2], ["E5", 2], ["C5", 2], ["E5", 4], ["D5", 2], ["C5", 2]),
        seq(["B4", 2], ["D5", 2], ["G5", 4], ["F#5", 2], ["E5", 2], ["D5", 4]),
        seq(["C5", 2], ["A4", 2], ["F#4", 2], ["A4", 2], ["D5", 6], [".", 2]),
      ],
    },
    { inst: "woodblock", bars: [drum("x...x...x...x...")], vol: 0.35 },
  ],
};

const CUP_THEME = [
  seq(["A4", 2], ["E5", 6], ["D5", 2], ["E5", 2], ["C5", 4]),
  seq(["B4", 2], ["D5", 6], ["C5", 2], ["B4", 2], ["G4", 4]),
  seq(["A4", 2], ["C5", 2], ["F5", 8], ["E5", 2], ["D5", 2]),
  seq(["E5", 12], [".", 4]),
  seq(["A5", 4], ["G5", 2], ["E5", 2], ["A5", 4], ["G5", 2], ["E5", 2]),
  seq(["D5", 2], ["E5", 2], ["G5", 8], ["E5", 2], ["D5", 2]),
  seq(["C5", 4], ["D5", 4], ["B4", 4], ["G#4", 4]),
  seq(["A4", 12], [".", 4]),
];
const CUP_CHORDS = [AM, G_, F_, E_, AM, G_, E_, AM];
const CUP_BASS = [boomChick("A2", "E2"), boomChick("G2", "D2"), boomChick("F2", "C3"), boomChick("E2", "B2"), boomChick("A2", "E2"), boomChick("G2", "D2"), boomChick("E2", "B2"), boomChick("A2", "E2")];
const CUP_ROOTS = ["A2", "G2", "F2", "E2", "A2", "G2", "E2", "A2"];

const cupQuiz: Track = {
  id: "cup-quiz",
  bpm: 96,
  bars: 8,
  // From a dusty trot at the start of the round to a full gallop as time runs out.
  tempoBoost: 0.7,
  reverb: 0.25,
  layers: [
    { inst: "whistle", bars: CUP_THEME },
    { inst: "twang", bars: CUP_BASS, vol: 0.8 },
    { inst: "twang", bars: CUP_CHORDS.map((c) => pump(c, "..x...x...x...x.")), vol: 0.45, from: 0.2 },
    { inst: "woodblock", bars: [GALLOP], vol: 0.5, from: 0.25 },
    { inst: "strings", bars: CUP_CHORDS.map(hold), vol: 0.7, from: 0.4 },
    { inst: "timpani", bars: CUP_ROOTS.map((r) => pump(r, "x.......x.......")), vol: 0.5, from: 0.5 },
    { inst: "brass", bars: CUP_CHORDS.map((c) => pump(c, "x.......x.x.....")), vol: 0.45, from: 0.65 },
    { inst: "bell", bars: [once("E4"), rest], vol: 0.7, from: 0.75 },
    { inst: "snare", bars: [drum("....x.......x..."), drum("....x.......x..."), drum("....x.......x..."), drum("....x...x.x.xxxx")], vol: 0.6, from: 0.85 },
  ],
};

const cupDrink: Track = {
  id: "cup-drink",
  bpm: 66,
  bars: 4,
  tempoBoost: 0.3,
  reverb: 0.35,
  layers: [
    { inst: "heart", bars: [drum("x.......x.......")], vol: 0.9 },
    { inst: "strings", bars: [AM, F_, chord("D3 F3 A3"), E_].map((c) => pump(c, "xxxxxxxxxxxxxxxx")), vol: 0.35 },
    { inst: "twang", bars: [seq(["A2", 8], [".", 8]), seq(["F2", 8], [".", 8]), seq(["D2", 8], [".", 8]), seq(["E2", 8], [".", 8])], vol: 0.8 },
    { inst: "whistle", bars: [seq([".", 8], ["E5", 8]), seq(["F5", 8], ["E5", 8]), seq(["D5", 12], [".", 4]), seq(["G#4", 8], ["B4", 8])], vol: 0.7 },
    { inst: "bell", bars: [once("A3")], vol: 0.6 },
    { inst: "timpani", bars: [pump("A2", "x...x...x...x..."), pump("F2", "x...x...x...x..."), pump("D2", "x...x...x...x..."), pump("E2", "x.x.x.x.xxxxxxxx")], vol: 0.45, from: 0.6 },
  ],
};

const cupResults: Track = {
  id: "cup-results",
  bpm: 104,
  bars: 4,
  reverb: 0.25,
  layers: [
    {
      inst: "brass",
      bars: [
        seq(["E4", 2], ["A4", 2], ["C#5", 4], ["E5", 6], ["C#5", 2]),
        seq(["D5", 4], ["F#5", 4], ["A5", 6], ["F#5", 2]),
        seq(["E5", 2], ["F#5", 2], ["G#5", 2], ["A5", 2], ["B5", 4], ["G#5", 4]),
        seq(["A5", 12], [".", 4]),
      ],
    },
    { inst: "whistle", bars: [seq([".", 8], ["A5", 8]), seq([".", 8], ["F#5", 8]), seq([".", 8], ["E5", 8]), seq([".", 4], ["E5", 4], ["A5", 8])], vol: 0.5 },
    { inst: "strings", bars: [hold(chord("A3 C#4 E4")), hold(chord("D4 F#4 A4")), hold(chord("E3 G#3 B3")), hold(chord("A3 C#4 E4"))], vol: 0.8 },
    { inst: "twang", bars: [boomChick("A2", "E2"), boomChick("D2", "A2"), boomChick("E2", "B2"), boomChick("A2", "E2")], vol: 0.8 },
    { inst: "timpani", bars: [pump("A2", "x.......x.x....."), pump("D2", "x.......x.x....."), pump("E2", "x.......x.x....."), pump("A2", "x...x...x.x.x...")], vol: 0.5 },
    { inst: "woodblock", bars: [GALLOP], vol: 0.45 },
    { inst: "cymbal", bars: [rest, rest, rest, once("x")], vol: 0.6 },
  ],
};

// ---------- Dragon's Hoard: deep in a mountain cave ----------

const DRAGON_DM = chord("D3 F3 A3");
const DRAGON_BB = chord("Bb2 D3 F3");
const DRAGON_F = chord("F3 A3 C4");
const DRAGON_C = chord("C3 E3 G3");
const DRAGON_GM = chord("G2 Bb2 D3");
const DRAGON_A = chord("A2 C#3 E3");

const dragonLobby: Track = {
  id: "dragon-lobby",
  bpm: 58,
  bars: 4,
  reverb: 0.45,
  layers: [
    // Slow, deep strings.
    { inst: "strings", bars: [hold(chord("D2 A2 D3")), hold(chord("Bb1 F2 D3")), hold(chord("G1 D2 Bb2")), hold(chord("A1 E2 C#3"))], vol: 0.7 },
    // The dragon breathing in and out in its sleep.
    { inst: "pad", bars: [seq([DRAGON_DM, 6], [".", 2], [DRAGON_DM, 6], [".", 2]), seq([DRAGON_BB, 6], [".", 2], [DRAGON_BB, 6], [".", 2]), seq([DRAGON_GM, 6], [".", 2], [DRAGON_GM, 6], [".", 2]), seq([DRAGON_A, 6], [".", 2], [DRAGON_A, 6], [".", 2])], vol: 0.35 },
    { inst: "heart", bars: [drum("x.......x.......")], vol: 0.3 },
    // Water dripping somewhere in the dark.
    { inst: "bell", bars: [once("A4"), rest, once("F4"), rest], vol: 0.3 },
    {
      inst: "flute",
      bars: [seq(["D5", 6], ["E5", 2], ["F5", 8]), seq(["E5", 4], ["D5", 4], ["C#5", 8]), seq(["D5", 6], ["A4", 2], ["Bb4", 8]), seq(["A4", 12], [".", 4])],
      vol: 0.45,
    },
  ],
};

const DRAGON_CHORDS = [DRAGON_DM, DRAGON_BB, DRAGON_F, DRAGON_C, DRAGON_DM, DRAGON_BB, DRAGON_GM, DRAGON_A];
const DRAGON_ROOTS = ["D2", "Bb1", "F2", "C2", "D2", "Bb1", "G1", "A1"];

const dragonBattle: Track = {
  id: "dragon-battle",
  bpm: 108,
  bars: 8,
  // Faster and fuller as the dragon weakens and the battle clock runs down.
  tempoBoost: 0.35,
  reverb: 0.25,
  layers: [
    {
      inst: "brass",
      bars: [
        seq(["D4", 2], ["A4", 6], ["G4", 2], ["F4", 2], ["E4", 2], ["F4", 2]),
        seq(["D4", 4], ["F4", 4], ["Bb4", 8]),
        seq(["A4", 2], ["C5", 6], ["Bb4", 2], ["A4", 2], ["G4", 2], ["A4", 2]),
        seq(["G4", 4], ["E4", 4], ["C4", 8]),
        seq(["D4", 2], ["A4", 6], ["G4", 2], ["F4", 2], ["E4", 2], ["F4", 2]),
        seq(["D5", 4], ["C5", 2], ["Bb4", 2], ["A4", 4], ["F4", 4]),
        seq(["G4", 2], ["Bb4", 2], ["D5", 8], ["C5", 2], ["Bb4", 2]),
        seq(["A4", 12], [".", 4]),
      ],
    },
    { inst: "strings", bars: DRAGON_CHORDS.map((c) => pump(c, "x.x.x.x.x.x.x.x.")), vol: 0.4 },
    { inst: "bass", bars: DRAGON_ROOTS.map((r) => pump(r, "x.x.x.x.x.x.x.x.")), vol: 0.75 },
    { inst: "taiko", bars: [drum("x.....x.x.......")], vol: 0.8 },
    // The choir.
    { inst: "organ", bars: DRAGON_CHORDS.map(hold), vol: 0.4, from: 0.35 },
    { inst: "timpani", bars: DRAGON_ROOTS.map((r) => pump(r, "x.......x.......")), vol: 0.55, from: 0.3 },
    { inst: "snare", bars: [drum("....x.......x..."), drum("....x.......x..."), drum("....x.......x..."), drum("....x...x.x.xxxx")], vol: 0.6, from: 0.5 },
    { inst: "hat", bars: [drum("x.x.x.x.x.x.x.x.")], vol: 0.45, from: 0.6 },
    { inst: "cymbal", bars: [once("x"), rest, rest, rest], vol: 0.55, from: 0.75 },
  ],
};

const dragonFire: Track = {
  id: "dragon-fire",
  bpm: 76,
  bars: 4,
  // A rumble that rises through the warning, then war drums under the rune question.
  tempoBoost: 0.5,
  reverb: 0.35,
  layers: [
    { inst: "timpani", bars: [pump("D2", "xxxxxxxxxxxxxxxx")], vol: 0.35 },
    { inst: "strings", bars: [DRAGON_DM, chord("Eb3 G3 Bb3"), DRAGON_DM, chord("C#3 E3 A3")].map((c) => pump(c, "xxxxxxxxxxxxxxxx")), vol: 0.35 },
    { inst: "tribass", bars: [hold("D1"), hold("Eb1"), hold("D1"), hold("A0")], vol: 0.6 },
    { inst: "taiko", bars: [drum("x..x..x.x..x..x.")], vol: 0.9, from: 0.4 },
    { inst: "taiko", bars: [drum("x.x.x.x.x.x.x.x.")], vol: 0.5, from: 0.7 },
    { inst: "brass", bars: [DRAGON_DM, chord("Eb3 G3 Bb3"), DRAGON_DM, chord("C#3 E3 A3")].map((c) => pump(c, "x.......x.x.....")), vol: 0.5, from: 0.6 },
  ],
};

const dragonScramble: Track = {
  id: "dragon-scramble",
  bpm: 132,
  bars: 4,
  // Speeds up as the scramble clock runs out.
  tempoBoost: 0.35,
  swing: 0.1,
  layers: [
    {
      inst: "pluck",
      bars: [
        seq(["F5", 2], ["A5", 2], ["C6", 2], ["A5", 2], ["F5", 2], ["G5", 2], ["A5", 4]),
        seq(["D5", 2], ["F5", 2], ["A5", 2], ["F5", 2], ["D5", 2], ["E5", 2], ["F5", 4]),
        seq(["Bb4", 2], ["D5", 2], ["F5", 2], ["D5", 2], ["G5", 2], ["F5", 2], ["D5", 4]),
        seq(["C5", 2], ["E5", 2], ["G5", 2], ["Bb5", 2], ["A5", 4], ["G5", 4]),
      ],
    },
    { inst: "bass", bars: [bounce("F2", "F3"), bounce("D2", "D3"), bounce("Bb1", "Bb2"), bounce("C2", "C3")], vol: 0.75 },
    { inst: "woodblock", bars: [drum("x...x...x...x...")], vol: 0.4 },
    // Coins.
    { inst: "bell", bars: [pump("A6", "......x.......x."), pump("F6", "......x.......x.")], vol: 0.3 },
    { inst: "pluck", bars: [chord("F4 A4 C5"), chord("D4 F4 A4"), chord("D4 F4 Bb4"), chord("E4 G4 C5")].map((c) => pump(c, "..x...x...x...x.")), vol: 0.4, from: 0.3 },
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.7, from: 0.4 },
    { inst: "hat", bars: [drum("..x...x...x...x.")], vol: 0.5, from: 0.5 },
    { inst: "snare", bars: [drum("....x.......x..."), drum("....x.......x..."), drum("....x.......x..."), drum("....x...x.x.xxxx")], vol: 0.55, from: 0.7 },
    { inst: "pulse", bars: [arp(["F5", "A5", "C6", "A5"]), arp(["D5", "F5", "A5", "F5"]), arp(["Bb4", "D5", "F5", "D5"]), arp(["C5", "E5", "G5", "E5"])], vol: 0.35, from: 0.8 },
  ],
};

const dragonResults: Track = {
  id: "dragon-results",
  bpm: 100,
  bars: 4,
  reverb: 0.3,
  layers: [
    {
      inst: "brass",
      bars: [
        seq(["D4", 2], ["F#4", 2], ["A4", 4], ["D5", 6], ["A4", 2]),
        seq(["G4", 2], ["B4", 2], ["D5", 4], ["G5", 6], ["D5", 2]),
        seq(["A4", 2], ["C#5", 2], ["E5", 4], ["A5", 4], ["G5", 2], ["E5", 2]),
        seq(["D5", 12], [".", 4]),
      ],
    },
    { inst: "organ", bars: [hold(chord("D3 F#3 A3")), hold(chord("G3 B3 D4")), hold(chord("A3 C#4 E4")), hold(chord("D3 F#3 A3"))], vol: 0.4 },
    { inst: "strings", bars: [hold(chord("D4 F#4 A4")), hold(chord("D4 G4 B4")), hold(chord("C#4 E4 A4")), hold(chord("D4 F#4 A4"))], vol: 0.6 },
    { inst: "bass", bars: [bounce("D2", "A2"), bounce("G1", "D2"), bounce("A1", "E2"), bounce("D2", "A2")], vol: 0.7 },
    { inst: "timpani", bars: [pump("D2", "x.......x.x....."), pump("G2", "x.......x.x....."), pump("A2", "x.......x.x....."), pump("D2", "x...x...x.x.x...")], vol: 0.55 },
    { inst: "snare", bars: [drum("....x.......x..."), drum("....x.......x..."), drum("....x.......x..."), drum("x.x.x.x.xxxxxxxx")], vol: 0.5 },
    { inst: "cymbal", bars: [once("x"), rest, rest, once("x")], vol: 0.55 },
  ],
};

// ---------- Bomb Squad: spy jazz in a disposal room ----------

const bombLobby: Track = {
  id: "bomb-lobby",
  bpm: 92,
  bars: 4,
  swing: 0.14,
  reverb: 0.28,
  layers: [
    { inst: "bass", bars: [bounce("C2", "G2"), bounce("Ab1", "Eb2"), bounce("Bb1", "F2"), bounce("G1", "D2")], vol: 0.8 },
    // Brushes.
    { inst: "hat", bars: [drum("x.x.x.x.x.x.x.x.")], vol: 0.32 },
    { inst: "snare", bars: [drum("..x...x...x...x.")], vol: 0.2 },
    {
      inst: "bell",
      bars: [
        seq(["Eb5", 2], [".", 2], ["G5", 2], [".", 2], ["Bb5", 2], ["G5", 2], [".", 4]),
        seq(["C5", 2], [".", 2], ["Eb5", 4], ["D5", 2], [".", 2], ["Bb4", 4]),
        seq(["F5", 2], ["G5", 2], ["Ab5", 4], ["G5", 2], [".", 2], ["Eb5", 4]),
        seq(["D5", 4], ["Bb4", 4], ["C5", 8]),
      ],
      vol: 0.42,
    },
    { inst: "pad", bars: [hold(chord("C3 Eb3 G3")), hold(chord("Ab2 C3 Eb3")), hold(chord("Bb2 D3 F3")), hold(chord("G2 Bb2 D3"))], vol: 0.32 },
  ],
};

const bombDefuse: Track = {
  id: "bomb-defuse",
  bpm: 104,
  bars: 4,
  tempoBoost: 0.48,
  swing: 0.08,
  layers: [
    { inst: "tick", bars: [drum("x.x.x.x.x.x.x.x.")], vol: 0.7 },
    { inst: "bass", bars: [pump("C2", "x.x.x.x.x.x.x.x."), pump("Ab1", "x.x.x.x.x.x.x.x."), pump("Bb1", "x.x.x.x.x.x.x.x."), pump("G1", "x.x.x.x.x.x.x.x.")], vol: 0.75 },
    { inst: "hat", bars: [drum("x.x.x.x.x.x.x.x.")], vol: 0.4, from: 0.35 },
    { inst: "snare", bars: [drum("....x.......x...")], vol: 0.45, from: 0.45 },
    { inst: "pulse", bars: [arp(["Eb4", "G4", "Bb4", "G4"]), arp(["C4", "Eb4", "Ab4", "Eb4"]), arp(["D4", "F4", "Bb4", "F4"]), arp(["D4", "G4", "Bb4", "G4"])], vol: 0.4, from: 0.62 },
    { inst: "strings", bars: [hold(chord("C4 Eb4 G4")), hold(chord("Ab3 C4 Eb4")), hold(chord("Bb3 D4 F4")), hold(chord("G3 Bb3 D4"))], vol: 0.4, from: 0.75 },
  ],
};

const bombResults: Track = {
  id: "bomb-results",
  bpm: 84,
  bars: 4,
  reverb: 0.4,
  layers: [
    // A deep boom and a ringing low chord when the bomb exploded (low intensity).
    { inst: "timpani", bars: [pump("C2", "x.......x......."), pump("Ab1", "x.......x......."), pump("Bb1", "x.......x......."), pump("G1", "x...x...x.x.x...")], vol: 0.6, to: 0.45 },
    { inst: "strings", bars: [hold(chord("C3 Eb3 G3")), hold(chord("Ab2 C3 Eb3")), hold(chord("Bb2 D3 F3")), hold(chord("C3 Eb3 G3"))], vol: 0.55, to: 0.45 },
    // Fanfare when the class defused it (high intensity).
    {
      inst: "bell",
      bars: [
        seq(["C5", 2], ["E5", 2], ["G5", 4], ["C6", 8]),
        seq(["G5", 4], ["E5", 4], ["C5", 8]),
        seq(["D5", 2], ["F5", 2], ["A5", 4], ["D6", 8]),
        seq(["C6", 12], [".", 4]),
      ],
      vol: 0.5,
      from: 0.55,
    },
    { inst: "piano", bars: [hold(chord("C4 E4 G4")), hold(chord("F3 A3 C4")), hold(chord("G3 B3 D4")), hold(chord("C4 E4 G4"))], vol: 0.45, from: 0.55 },
    { inst: "cymbal", bars: [once("x"), rest, rest, once("x")], vol: 0.4, from: 0.55 },
  ],
};

// ---------- Kingdom Siege: a tabletop kingdom under siege ----------

const SIEGE_G = chord("G3 B3 D4");
const SIEGE_C = chord("C4 E4 G4");
const SIEGE_D = chord("D4 F#4 A4");
const SIEGE_EM = chord("E3 G3 B3");

const siegeLobby: Track = {
  id: "siege-lobby",
  rich: true,
  bpm: 84,
  bars: 4,
  swing: 0.12,
  reverb: 0.3,
  layers: [
    // The lute.
    { inst: "pluck", bars: [arp(["G3", "D4", "B4", "D4"], 2), arp(["C4", "G4", "E5", "G4"], 2), arp(["E3", "B3", "G4", "B3"], 2), arp(["D4", "A4", "F#5", "A4"], 2)], vol: 0.5 },
    { inst: "bass", bars: [pump("G2", "x.......x......."), pump("C2", "x.......x......."), pump("E2", "x.......x......."), pump("D2", "x.......x.......")], vol: 0.5 },
    // A soft tabor.
    { inst: "woodblock", bars: [drum("x.....x.x.......")], vol: 0.25 },
    // The recorder.
    {
      inst: "flute",
      bars: [
        seq(["B4", 4], ["A4", 2], ["G4", 2], ["A4", 4], ["B4", 4]),
        seq(["C5", 4], ["E5", 4], ["D5", 4], ["C5", 4]),
        seq(["B4", 2], ["A4", 2], ["G4", 4], ["E4", 4], ["G4", 4]),
        seq(["A4", 6], ["F#4", 2], ["D4", 8]),
      ],
      vol: 0.5,
    },
    { inst: "pad", bars: [hold(SIEGE_G), hold(SIEGE_C), hold(SIEGE_EM), hold(SIEGE_D)], vol: 0.25 },
  ],
};

const SIEGE_MARCH = [chord("Bb3 D4 F4"), chord("Eb4 G4 Bb4"), chord("F3 A3 C4"), chord("G3 Bb3 D4"), chord("Bb3 D4 F4"), chord("Eb4 G4 Bb4"), chord("C4 Eb4 G4"), chord("F3 A3 C4")];
const SIEGE_ROOTS = ["Bb1", "Eb2", "F2", "G1", "Bb1", "Eb2", "C2", "F2"];

const siegeBattle: Track = {
  id: "siege-battle",
  rich: true,
  bpm: 112,
  bars: 8,
  // Below 0.15 is a build break: drums and a held chord. More layers as monsters fill the
  // board and hearts are lost; low brass and timpani for a giant (0.85 and up).
  tempoBoost: 0.3,
  reverb: 0.22,
  layers: [
    // The marching snare and tabor, always there.
    { inst: "snare", bars: [drum("x..xx.x.x..xx.x."), drum("x..xx.x.x..xx.x."), drum("x..xx.x.x..xx.x."), drum("x..xx.x.x.xxxxxx")], vol: 0.45 },
    { inst: "woodblock", bars: [drum("x...x...x...x...")], vol: 0.3 },
    { inst: "pad", bars: SIEGE_MARCH.map(hold), vol: 0.35, to: 0.15 },
    { inst: "bass", bars: SIEGE_ROOTS.map((r) => pump(r, "x...x...x...x...")), vol: 0.7, from: 0.15 },
    {
      inst: "flute",
      bars: [
        seq(["F5", 3], ["F5", 1], ["Bb5", 4], ["A5", 2], ["G5", 2], ["F5", 4]),
        seq(["G5", 3], ["G5", 1], ["Eb5", 4], ["G5", 4], ["Bb5", 4]),
        seq(["A5", 3], ["G5", 1], ["F5", 4], ["C5", 4], ["F5", 4]),
        seq(["D5", 4], ["G5", 4], ["F5", 2], ["Eb5", 2], ["D5", 4]),
        seq(["F5", 3], ["F5", 1], ["Bb5", 4], ["A5", 2], ["G5", 2], ["F5", 4]),
        seq(["Eb5", 2], ["F5", 2], ["G5", 4], ["Bb5", 4], ["G5", 4]),
        seq(["G5", 3], ["F5", 1], ["Eb5", 4], ["C5", 4], ["G5", 4]),
        seq(["F5", 12], [".", 4]),
      ],
      vol: 0.5,
      from: 0.15,
    },
    { inst: "strings", bars: SIEGE_MARCH.map((c) => pump(c, "x.x.x.x.x.x.x.x.")), vol: 0.3, from: 0.35 },
    { inst: "brass", bars: SIEGE_MARCH.map((c) => pump(c, "x.......x.x.....")), vol: 0.45, from: 0.5 },
    { inst: "hat", bars: [drum("..x...x...x...x.")], vol: 0.35, from: 0.6 },
    { inst: "cymbal", bars: [once("x"), rest, rest, rest], vol: 0.45, from: 0.7 },
    // The giant.
    { inst: "tribass", bars: SIEGE_ROOTS.map((r) => pump(r.replace(/\d/, (n) => String(Number(n) - 1)), "x.......x.......")), vol: 0.6, from: 0.85 },
    { inst: "timpani", bars: SIEGE_ROOTS.map((r) => pump(r.replace("1", "2"), "x.....x.x.......")), vol: 0.6, from: 0.85 },
  ],
};

const siegeResults: Track = {
  id: "siege-results",
  rich: true,
  bpm: 92,
  bars: 4,
  reverb: 0.42,
  layers: [
    // A slow, low brass lament for a fallen castle (low intensity).
    {
      inst: "brass",
      bars: [seq(["G3", 8], ["F3", 4], ["Eb3", 4]), seq(["D3", 12], [".", 4]), seq(["C3", 8], ["D3", 4], ["Eb3", 4]), seq(["D3", 12], [".", 4])],
      vol: 0.5,
      to: 0.45,
    },
    { inst: "strings", bars: [hold(chord("G2 Bb2 D3")), hold(chord("D2 F#2 A2")), hold(chord("C2 Eb2 G2")), hold(chord("D2 F#2 A2"))], vol: 0.45, to: 0.45 },
    { inst: "timpani", bars: [once("G1"), rest, once("C2"), once("D2")], vol: 0.4, to: 0.45 },
    // A bright fanfare with church bells when the kingdom stands (high intensity).
    {
      inst: "brass",
      bars: [
        seq(["G4", 2], ["B4", 2], ["D5", 4], ["G5", 6], ["D5", 2]),
        seq(["C5", 2], ["E5", 2], ["G5", 4], ["C6", 6], ["G5", 2]),
        seq(["D5", 2], ["F#5", 2], ["A5", 4], ["D6", 4], ["C6", 2], ["A5", 2]),
        seq(["G5", 12], [".", 4]),
      ],
      vol: 0.55,
      from: 0.55,
    },
    { inst: "bell", bars: [seq(["G4", 8], ["D4", 8]), seq(["C5", 8], ["G4", 8]), seq(["D5", 8], ["A4", 8]), seq(["G4", 8], ["G3", 8])], vol: 0.45, from: 0.55 },
    { inst: "organ", bars: [hold(SIEGE_G), hold(SIEGE_C), hold(SIEGE_D), hold(SIEGE_G)], vol: 0.35, from: 0.55 },
    { inst: "snare", bars: [drum("....x.......x..."), drum("....x.......x..."), drum("....x.......x..."), drum("x.x.x.x.xxxxxxxx")], vol: 0.45, from: 0.55 },
    { inst: "cymbal", bars: [once("x"), rest, rest, once("x")], vol: 0.45, from: 0.55 },
  ],
};

// ---------- Showdown: a quick-draw standoff at High Noon ----------
// Original title-theme shape, not a transcription of any film cue. D minor: a 16th-note electric-guitar
// tremolo on the chord, a low root on beats 1 and 3, and a sparse whistle that leaves gaps for the flute.
// The trumpet takes the same tune an octave down as the clock runs out. The podium lifts the first half
// into D major. Cup of Death stays in A minor, with its stepwise whistle and boom-chick bass.

/** Chords per bar: Dm F C Dm | Gm Dm A Dm. */
const SHOW_CHORDS = ["D3 F3 A3", "F3 A3 C4", "C3 E3 G3", "D3 F3 A3", "G3 Bb3 D4", "D3 F3 A3", "C#3 E3 A3", "D3 F3 A3"].map(chord);
/** Low guitar roots, one per bar. */
const SHOW_BASS = ["D2", "F2", "C3", "D2", "G2", "D2", "A2", "D2"];
/** Shimmering tremolo: the chord restruck on every 16th. */
const tremolo = (chordTok: string) => pump(chordTok, "xxxxxxxxxxxxxxxx");
/** The guitar's low root, held across beats 1 and 3. */
const guitarPulse = (root: string) => seq([root, 4], [".", 4], [root, 4], [".", 4]);
/**
 * The whistled tune. Long notes, and a rest before the first one, so each loop opens on guitar alone.
 * The rests are where the flute answers.
 */
const SHOW_THEME = [
  seq([".", 6], ["A5", 10]),
  seq(["G5", 6], ["F5", 6], [".", 4]),
  seq(["C6", 8], [".", 8]),
  seq(["D5", 10], [".", 6]),
  seq([".", 4], ["F5", 6], ["D5", 6]),
  seq(["Bb4", 6], [".", 4], ["A4", 6]),
  seq(["E5", 4], [".", 2], ["C#5", 4], ["A5", 6]),
  seq(["D5", 12], [".", 4]),
];
/** Short flute turns, only in the whistle's rests. Bar 1 stays empty so the guitar has the street. */
const SHOW_FLUTE = [
  rest,
  seq([".", 12], ["A5", 2], ["G5", 2]),
  seq([".", 8], ["E5", 2], ["G5", 2], [".", 4]),
  seq([".", 10], ["A5", 2], ["F5", 2], [".", 2]),
  seq(["C5", 2], ["D5", 2], [".", 12]),
  seq([".", 6], ["C5", 2], ["D5", 2], [".", 6]),
  seq([".", 4], ["G5", 2], [".", 10]),
  seq([".", 12], ["A5", 4]),
];
/** The same first phrase, with the 3rd and 7th raised, over D G A D. */
const SHOW_SUNSET = [
  seq([".", 6], ["A5", 10]),
  seq(["G5", 6], ["F#5", 6], [".", 4]),
  seq(["C#6", 8], [".", 8]),
  seq(["D5", 10], [".", 6]),
];
const SUN_CHORDS = ["D3 F#3 A3", "G3 B3 D4", "A3 C#4 E4", "D3 F#3 A3"].map(chord);
const SUN_ROOTS = ["D2", "G2", "A2", "D2"];
/** The jaw harp boings the D drone on the same beats as the low guitar. */
const SHOW_BOING = pump("D3", "x.......x.......");
/** Anvil: a hard, high, short ring. */
const anvil = (pattern: string) => pump("D6", pattern);
/** Whip cracks and the chanted "hup!" land at the end of every other bar. */
const SHOW_WHIP = [rest, drum("............o..."), rest, drum("o.........o....."), rest, drum("............o..."), rest, drum("o.........o.o...")];
const SHOW_HUP = [rest, drum("............x.x."), rest, drum("............x.x."), rest, drum("............x.x."), rest, drum("............x.xx")];

const showdownLobby: Track = {
  id: "showdown-lobby",
  bpm: 76,
  bars: 4,
  reverb: 0.62,
  layers: [
    // An empty street: tremolo guitar, the low root, and the whistle's first phrase. No hooves, no whip.
    { inst: "twang", bars: SHOW_CHORDS.slice(0, 4).map(tremolo), vol: 0.4 },
    { inst: "twang", bars: SHOW_BASS.slice(0, 4).map(guitarPulse), vol: 0.52 },
    { inst: "whistle", bars: SHOW_THEME.slice(0, 4), vol: 0.55 },
    { inst: "jawharp", bars: [SHOW_BOING, rest, SHOW_BOING, rest], vol: 0.32 },
    { inst: "bell", bars: [anvil("x..............."), rest, rest, rest], vol: 0.28 },
  ],
};

const showdown: Track = {
  id: "showdown",
  bpm: 92,
  bars: 8,
  // From a slow ride into town (intro, ~0.3) to a full gallop with the trumpet on the tune as time runs out (1).
  tempoBoost: 0.35,
  reverb: 0.48,
  layers: [
    // Always there: the tremolo bed, the low root, hooves at a walk, an anvil ping, the jaw harp.
    { inst: "twang", bars: SHOW_CHORDS.map(tremolo), vol: 0.26 },
    { inst: "twang", bars: SHOW_BASS.map(guitarPulse), vol: 0.58 },
    { inst: "woodblock", bars: [drum("x.......x.......")], vol: 0.3, to: 0.45 },
    { inst: "bell", bars: [anvil("x..............."), rest, rest, rest], vol: 0.32, to: 0.7 },
    { inst: "jawharp", bars: [SHOW_BOING], vol: 0.45 },
    // The whistle is already on the tune in the intro. The flute answers in the gaps once the question opens.
    { inst: "whistle", bars: SHOW_THEME, vol: 0.72, from: 0.15 },
    { inst: "flute", bars: SHOW_FLUTE, vol: 0.32, from: 0.35 },
    // Into a gallop, with the timpani on the roots.
    { inst: "woodblock", bars: [GALLOP], vol: 0.45, from: 0.45 },
    { inst: "timpani", bars: SHOW_BASS.map((r) => pump(r, "x.......x.......")), vol: 0.45, from: 0.45 },
    // Whip cracks and the chanted "hup!" (low brass stab and a drum).
    { inst: "clap", bars: SHOW_WHIP, vol: 0.55, from: 0.55 },
    { inst: "taiko", bars: SHOW_HUP, vol: 0.5, from: 0.55 },
    { inst: "brass", bars: SHOW_HUP.map((b) => b.replace(/x/g, chord("D3 A3"))), vol: 0.4, from: 0.55 },
    // The anvil on every offbeat and the strings sawing underneath.
    { inst: "bell", bars: [anvil("....x.......x...")], vol: 0.28, from: 0.7 },
    { inst: "strings", bars: SHOW_CHORDS.map((c) => pump(c, "xxxxxxxxxxxxxxxx")), vol: 0.22, from: 0.7 },
    // Last seconds: the trumpet takes the tune an octave down, the snare drives.
    { inst: "brass", bars: shift(SHOW_THEME, -1), vol: 0.58, from: 0.8 },
    { inst: "snare", bars: [drum("....x.......x..."), drum("....x.......x..."), drum("....x.......x..."), drum("....x...x.x.xxxx")], vol: 0.42, from: 0.9 },
    { inst: "cymbal", bars: [rest, rest, rest, rest, rest, rest, rest, once("x")], vol: 0.5, from: 0.9 },
  ],
};

/** The draw: a whip crack, a rising trumpet call, and the whistle hanging on its last note. Played once by MusicPlayer.sting. */
const showdownDraw: Track = {
  id: "showdown-draw",
  bpm: 132,
  bars: 2,
  reverb: 0.5,
  layers: [
    { inst: "clap", bars: [drum("o..............."), rest], vol: 0.8 },
    { inst: "bell", bars: [seq([".", 2], ["D6", 2], [".", 12]), rest], vol: 0.55 },
    { inst: "brass", bars: [seq(["D4", 3], ["F4", 3], ["A4", 4], ["D5", 3], ["A5", 3]), rest], vol: 0.8 },
    { inst: "timpani", bars: [seq(["A2", 2], ["D2", 14]), rest], vol: 0.75 },
    { inst: "twang", bars: [seq([".", 2], ["D2", 2], ["A2", 2], ["D3", 10]), seq(["D3", 8], [".", 8])], vol: 0.7 },
    { inst: "whistle", bars: [seq([".", 13], ["A5", 3]), seq(["A5", 16])], vol: 0.55 },
    { inst: "jawharp", bars: [seq(["D3", 6], [".", 10]), rest], vol: 0.6 },
  ],
};

const showdownResults: Track = {
  id: "showdown-results",
  bpm: 104,
  bars: 4,
  reverb: 0.4,
  layers: [
    // Riding off into the sunset, in D major: trumpet on the tune, the whistle above it, a full gallop.
    { inst: "brass", bars: shift(SHOW_SUNSET, -1), vol: 0.8 },
    { inst: "whistle", bars: SHOW_SUNSET, vol: 0.42 },
    { inst: "strings", bars: SUN_CHORDS.map(hold), vol: 0.5 },
    { inst: "twang", bars: SUN_CHORDS.map(tremolo), vol: 0.24 },
    { inst: "twang", bars: SUN_ROOTS.map(guitarPulse), vol: 0.6 },
    { inst: "woodblock", bars: [GALLOP], vol: 0.4 },
    { inst: "jawharp", bars: [SHOW_BOING], vol: 0.4 },
    { inst: "timpani", bars: SUN_ROOTS.map((r) => pump(r, "x.......x.x.....")), vol: 0.48 },
    { inst: "clap", bars: [rest, drum("............o..."), rest, drum("o...............")], vol: 0.45 },
    { inst: "bell", bars: [anvil("x..............."), rest, anvil("x..............."), once("D6")], vol: 0.28 },
    { inst: "cymbal", bars: [rest, rest, rest, once("x")], vol: 0.5 },
  ],
};

// ---------- Santa's Sleigh Run: public-domain Christmas carols ----------
// The lobby is "O Come, All Ye Faithful" (Adeste Fideles, J. F. Wade, 18th c.), the rounds are
// "Joy to the World" (the later "O Come, O Come, Emmanuel" and "God Rest Ye Merry Gentlemen" arrangements are kept as
// sleighFlightEmmanuel and sleighFlightGodRest) and the podium is "Hark! The Herald Angels
// Sing" (Mendelssohn, 1840). Sleigh bells (a bright hat pattern) jingle through all three.
// The melodies are written one bar per 16 steps (a quarter note = 4 steps); the harmony is given
// as one chord per beat and turned into bass, pads and accompaniment by the helpers below.

/** Close-voiced triads (around middle C) for the carols' chords. */
const XMAS_CHORDS: Record<string, string> = {
  G: "G3 B3 D4",
  D: "F#3 A3 D4",
  D7: "F#3 C4 D4",
  A: "A3 C#4 E4",
  A7: "G3 C#4 E4",
  Em: "G3 B3 E4",
  C: "G3 C4 E4",
  Am: "A3 C4 E4",
  B7: "F#3 A3 D#4",
  Bm: "F#3 B3 D4",
};
const XMAS_ROOTS: Record<string, string> = { G: "G2", D: "D2", D7: "D2", A: "A2", A7: "A2", Em: "E2", C: "C3", Am: "A2", B7: "B2", Bm: "B2" };

/** One bar from four beats of chords: each beat's 4 steps follow `beat` ("x" = play, "-" = hold, "." = rest). */
const beats = (q: string[], beat: string, pick: (chordName: string, step: number) => string) =>
  q.flatMap((c, b) => beat.split("").map((ch, i) => (ch === "x" ? pick(c, b * 4 + i) : ch))).join(" ");
/** The chords held as a pad, re-struck only when they change. */
const padBar = (q: string[]) => {
  const parts: [string, number][] = [];
  for (const c of q) {
    const last = parts[parts.length - 1];
    if (last && last[0] === chord(XMAS_CHORDS[c]!)) last[1] += 4;
    else parts.push([chord(XMAS_CHORDS[c]!), 4]);
  }
  return seq(...parts);
};
/** The root on every beat. */
const rootBeats = (q: string[]) => beats(q, "x---", (c) => XMAS_ROOTS[c]!);
/** Eighth notes bouncing between the root and its octave. */
const rootBounce = (q: string[]) => beats(q, "x.x.", (c, i) => (i % 4 === 0 ? XMAS_ROOTS[c]! : octaveUp(XMAS_ROOTS[c]!)));
/** A chord on the off-beat ("oom-pah"), an octave up. */
const offbeatChords = (q: string[]) => beats(q, "..x.", (c) => chord(XMAS_CHORDS[c]!.split(" ").map((n) => octaveUp(n)).join(" ")));
/** Broken chords in eighths, an octave up. */
const brokenChords = (q: string[]) =>
  beats(q, "x.x.", (c, i) => {
    const notes = XMAS_CHORDS[c]!.split(" ");
    return octaveUp(notes[(i / 2) % 3]!);
  });
/** Sleigh bells. */
const BELLS_8THS = drum("o.x.x.x.o.x.x.x.");
const BELLS_16THS = drum("o.xxx.xxo.xxx.xx");
const BELLS_SHAKE = drum("xxxxxxxxoxxxxxxx");

// O Come, All Ye Faithful in G, 4/4. Bar 20 ends with the pickup "O" back into bar 1.
const ADESTE = [
  seq(["G4", 8], ["D4", 4], ["G4", 4]), // come, all ye
  seq(["A4", 8], ["D4", 8]), // faith-ful,
  seq(["B4", 4], ["A4", 4], ["B4", 4], ["C5", 4]), // joy-ful and tri-
  seq(["B4", 8], ["A4", 4], ["G4", 4]), // um-phant, O
  seq(["G4", 8], ["F#4", 4], ["E4", 4]), // come ye, O
  seq(["F#4", 4], ["G4", 4], ["A4", 4], ["B4", 4]), // come ye to Beth-
  seq(["F#4", 8], ["E4", 6], ["D4", 2]), // le-hem;
  seq(["D4", 12], [".", 4]),
  seq(["D5", 8], ["C5", 4], ["B4", 4]), // Come and be-
  seq(["C5", 8], ["B4", 8]), // hold Him,
  seq(["A4", 4], ["B4", 4], ["G4", 4], ["A4", 4]), // born the King of
  seq(["F#4", 6], ["E4", 2], ["D4", 4], ["G4", 4]), // an-gels; O
  seq(["G4", 4], ["F#4", 4], ["G4", 4], ["A4", 4]), // come, let us a-
  seq(["G4", 8], ["D4", 4], ["B4", 4]), // dore Him, O
  seq(["B4", 4], ["A4", 4], ["B4", 4], ["C5", 4]), // come, let us a-
  seq(["B4", 8], ["A4", 4], ["B4", 4]), // dore Him, O
  seq(["C5", 4], ["B4", 4], ["A4", 4], ["G4", 4]), // come, let us a-
  seq(["F#4", 8], ["G4", 4], ["C5", 4]), // dore Him, Christ
  seq(["B4", 8], ["A4", 6], ["G4", 2]), // the Lord.
  seq(["G4", 12], ["G4", 4]), // … O
];
const ADESTE_HARMONY = [
  ["G", "G", "D", "G"], ["D", "D", "D", "D"], ["G", "D", "G", "C"], ["G", "G", "D", "G"],
  ["G", "G", "D", "C"], ["D", "Em", "D", "G"], ["D", "D", "A", "A"], ["D", "D", "D", "D"],
  ["G", "G", "D7", "G"], ["C", "C", "G", "G"], ["D", "G", "C", "D"], ["D", "A", "D", "G"],
  ["G", "D", "G", "D"], ["G", "G", "D", "G"], ["G", "D", "G", "C"], ["G", "G", "D", "G"],
  ["C", "G", "D", "Em"], ["D", "D", "G", "C"], ["G", "G", "D7", "D7"], ["G", "G", "G", "G"],
];

const sleighLobby: Track = {
  id: "sleigh-lobby",
  bpm: 92,
  bars: 20,
  reverb: 0.35,
  layers: [
    // Flute on the tune with a glockenspiel an octave up, strings and a walking pizzicato bass.
    { inst: "flute", bars: ADESTE, vol: 0.55 },
    { inst: "bell", bars: shift(ADESTE, 1), vol: 0.22 },
    { inst: "strings", bars: ADESTE_HARMONY.map(padBar), vol: 0.4 },
    { inst: "bass", bars: ADESTE_HARMONY.map(rootBeats), vol: 0.6 },
    { inst: "piano", bars: ADESTE_HARMONY.map(brokenChords), vol: 0.22 },
    { inst: "hat", bars: [drum("x...x...x...x...")], vol: 0.35 },
    { inst: "cymbal", bars: [once("x"), ...Array(19).fill(rest)], vol: 0.25 },
  ],
};

// Joy to the World in D (the hymn's 2/4 bars paired into 4/4). The tune is 9½ bars; bar 10
// holds the last note while the bells shake into the repeat.
const ANTIOCH = [
  seq(["D5", 4], ["C#5", 3], ["B4", 1], ["A4", 6], ["G4", 2]), // Joy to the world! the
  seq(["F#4", 4], ["E4", 4], ["D4", 6], ["A4", 2]), // Lord is come; Let
  seq(["B4", 6], ["B4", 2], ["C#5", 6], ["C#5", 2]), // earth re-ceive her
  seq(["D5", 6], ["D5", 2], ["D5", 2], ["C#5", 2], ["B4", 2], ["A4", 2]), // King; Let ev-ery heart pre-
  seq(["A4", 3], ["G4", 1], ["F#4", 2], ["D5", 2], ["D5", 2], ["C#5", 2], ["B4", 2], ["A4", 2]), // pare Him room, And heav-en and na-
  seq(["A4", 3], ["G4", 1], ["F#4", 2], ["F#4", 2], ["F#4", 2], ["F#4", 2], ["F#4", 2], ["F#4", 1], ["G4", 1]), // ture sing, And heav-en and na-
  seq(["A4", 6], ["G4", 1], ["F#4", 1], ["E4", 2], ["E4", 2], ["E4", 2], ["E4", 1], ["F#4", 1]), // ture sing, And heav-en and na-
  seq(["G4", 6], ["F#4", 1], ["E4", 1], ["D4", 2], ["D5", 4], ["B4", 2]), // ture sing, And heav-en, and
  seq(["A4", 3], ["G4", 1], ["F#4", 2], ["G4", 2], ["F#4", 4], ["E4", 4]), // heav-en and na-ture
  seq(["D4", 8], [".", 8]), // sing.
];
const ANTIOCH_HARMONY = [
  ["D", "D", "D", "D"], ["D", "A", "D", "D"], ["G", "G", "A", "A"], ["D", "D", "D", "D"], ["A7", "D", "D", "D"],
  ["A7", "D", "D", "D"], ["D", "D", "A", "A"], ["A7", "A7", "D", "G"], ["D", "D", "D", "A7"], ["D", "D", "D", "D"],
];

/** The rounds' track: "Joy to the World". */
const sleighFlight: Track = {
  id: "sleigh-flight",
  // 104 BPM as the quiz starts, about 140 once the reindeer are flying.
  bpm: 104,
  bars: 10,
  tempoBoost: 0.35,
  reverb: 0.25,
  layers: [
    // Quiz start: a few sleigh bells, held strings and a root note per beat.
    { inst: "hat", bars: [BELLS_8THS], vol: 0.4, to: 0.7 },
    { inst: "strings", bars: ANTIOCH_HARMONY.map(padBar), vol: 0.35, to: 0.75 },
    { inst: "bass", bars: ANTIOCH_HARMONY.map(rootBeats), vol: 0.6, to: 0.5 },
    // Warming up: the tune on pizzicato, the woodblock clip-clop of hooves.
    { inst: "pluck", bars: ANTIOCH, vol: 0.55, from: 0.2, to: 0.75 },
    { inst: "woodblock", bars: [drum("x..x....x..x....")], vol: 0.3, from: 0.3 },
    // Building: an oom-pah piano, a bouncing bass and a soft kick.
    { inst: "piano", bars: ANTIOCH_HARMONY.map(offbeatChords), vol: 0.3, from: 0.4 },
    { inst: "bass", bars: ANTIOCH_HARMONY.map(rootBounce), vol: 0.7, from: 0.5 },
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.6, from: 0.4, to: 0.75 },
    // The glockenspiel takes the tune as the quiz nears its end.
    { inst: "bell", bars: shift(ANTIOCH, 1), vol: 0.4, from: 0.55 },
    // Intro and flight: the full band, brass on the tune, faster sleigh bells, backbeat.
    { inst: "brass", bars: ANTIOCH, vol: 0.65, from: 0.75 },
    { inst: "strings", bars: ANTIOCH_HARMONY.map(brokenChords), vol: 0.35, from: 0.75 },
    { inst: "flute", bars: shift(ANTIOCH, 1), vol: 0.3, from: 0.85 },
    { inst: "hat", bars: [BELLS_16THS], vol: 0.45, from: 0.7 },
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.8, from: 0.75 },
    { inst: "snare", bars: [drum("....x.......x..."), drum("....x.......x..."), drum("....x.......x..."), drum("....x.......x..."), drum("....x...x.x.xxxx")], vol: 0.5, from: 0.75 },
    { inst: "cymbal", bars: [once("x"), rest, rest, rest, rest, rest, rest, rest, rest, rest], vol: 0.45, from: 0.75 },
    // The last bar's bells shake into the repeat.
    { inst: "openhat", bars: [rest, rest, rest, rest, rest, rest, rest, rest, rest, BELLS_SHAKE], vol: 0.3, from: 0.6 },
  ],
};

// O Come, O Come, Emmanuel ("Veni Emmanuel", a 15th-century French processional tune) in E minor,
// 4/4. Six lines of three bars; the refrain ("Rejoice! Rejoice!") ends like the second line.
const EMMANUEL = [
  seq(["E4", 4], ["G4", 4], ["B4", 4], ["B4", 4]), // O come, O come,
  seq(["B4", 4], ["A4", 4], ["C5", 4], ["B4", 4]), // Em-man-u-
  seq(["A4", 4], ["G4", 12]), // el,
  seq(["A4", 4], ["B4", 4], ["G4", 4], ["E4", 4]), // And ran-som cap-
  seq(["G4", 4], ["A4", 4], ["F#4", 4], ["E4", 4]), // tive Is-ra-
  seq(["D4", 4], ["E4", 12]), // el,
  seq(["A4", 4], ["A4", 4], ["E4", 4], ["E4", 4]), // That mourns in lone-
  seq(["F#4", 4], ["G4", 4], ["F#4", 4], ["E4", 4]), // ly ex-ile
  seq(["D4", 12], [".", 4]), // here
  seq(["G4", 4], ["A4", 4], ["B4", 4], ["B4", 4]), // Un-til the Son
  seq(["B4", 4], ["A4", 4], ["C5", 4], ["B4", 4]), // of God ap-
  seq(["A4", 4], ["G4", 12]), // pear.
  seq(["D5", 4], ["D5", 4], ["B4", 4], ["B4", 4]), // Re-joice! Re-joice!
  seq(["B4", 4], ["A4", 4], ["C5", 4], ["B4", 4]), // Em-man-u-
  seq(["A4", 4], ["G4", 12]), // el
  seq(["A4", 4], ["B4", 4], ["G4", 4], ["E4", 4]), // Shall come to thee,
  seq(["G4", 4], ["A4", 4], ["F#4", 4], ["E4", 4]), // O Is-ra-
  seq(["D4", 4], ["E4", 12]), // el.
];
const EMMANUEL_HARMONY = [
  ["Em", "Em", "Em", "G"], ["G", "D", "Am", "Em"], ["D", "G", "G", "G"],
  ["D", "G", "Em", "C"], ["C", "Am", "D", "Em"], ["D", "Em", "Em", "Em"],
  ["Am", "D", "Am", "C"], ["D", "G", "D", "Em"], ["G", "G", "D", "D"],
  ["Em", "D", "G", "G"], ["G", "D", "Am", "Em"], ["D", "G", "G", "G"],
  ["G", "D", "G", "Em"], ["G", "D", "Am", "Em"], ["D", "G", "G", "G"],
  ["D", "G", "Em", "C"], ["C", "Am", "B7", "Em"], ["D", "Em", "Em", "Em"],
];
/** A backbeat with a fill at the end of each line (every third bar). */
const EMMANUEL_SNARE = Array.from({ length: 18 }, (_, i) => drum(i % 3 === 2 ? "....x...x.x.xxxx" : "....x.......x..."));

/**
 * An alternative rounds track, "O Come, O Come, Emmanuel", kept so it can come back: put it in TRACKS as
 * "sleigh-flight" in place of sleighFlight (and switch the notes in the header and the docs).
 */
export const sleighFlightEmmanuel: Track = {
  id: "sleigh-flight",
  // 100 BPM as the quiz starts, about 140 once the reindeer are flying.
  bpm: 100,
  bars: 18,
  tempoBoost: 0.35,
  reverb: 0.25,
  layers: [
    // Quiz start: a few sleigh bells, held strings and a root note per beat.
    { inst: "hat", bars: [BELLS_8THS], vol: 0.4, to: 0.7 },
    { inst: "strings", bars: EMMANUEL_HARMONY.map(padBar), vol: 0.35, to: 0.75 },
    { inst: "bass", bars: EMMANUEL_HARMONY.map(rootBeats), vol: 0.6, to: 0.5 },
    // Warming up: the tune on pizzicato, the woodblock clip-clop of hooves.
    { inst: "pluck", bars: EMMANUEL, vol: 0.55, from: 0.2, to: 0.75 },
    { inst: "woodblock", bars: [drum("x..x....x..x....")], vol: 0.3, from: 0.3 },
    // Building: an oom-pah piano, a bouncing bass and a soft kick.
    { inst: "piano", bars: EMMANUEL_HARMONY.map(offbeatChords), vol: 0.3, from: 0.4 },
    { inst: "bass", bars: EMMANUEL_HARMONY.map(rootBounce), vol: 0.7, from: 0.5 },
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.6, from: 0.4, to: 0.75 },
    // The glockenspiel takes the tune as the quiz nears its end.
    { inst: "bell", bars: shift(EMMANUEL, 1), vol: 0.4, from: 0.55 },
    // Intro and flight: the full band, brass on the tune, faster sleigh bells, backbeat.
    { inst: "brass", bars: EMMANUEL, vol: 0.65, from: 0.75 },
    { inst: "strings", bars: EMMANUEL_HARMONY.map(brokenChords), vol: 0.35, from: 0.75 },
    { inst: "flute", bars: shift(EMMANUEL, 1), vol: 0.3, from: 0.85 },
    { inst: "hat", bars: [BELLS_16THS], vol: 0.45, from: 0.7 },
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.8, from: 0.75 },
    { inst: "snare", bars: EMMANUEL_SNARE, vol: 0.5, from: 0.75 },
    // A cymbal at the top and at the start of the refrain.
    { inst: "cymbal", bars: Array.from({ length: 18 }, (_, i) => ([0, 12].includes(i) ? once("x") : rest)), vol: 0.45, from: 0.75 },
    // The last bar's bells shake into the repeat.
    { inst: "openhat", bars: [...Array(17).fill(rest), BELLS_SHAKE], vol: 0.3, from: 0.6 },
  ],
};

// God Rest Ye Merry Gentlemen (traditional English carol) in E minor, 4/4, read off the pianotv.net
// sheet music (one chord per bar, as written there). Bar 19 is the first ending, whose last beat is
// the pickup "God" back into bar 1. Bars 13-18 are the refrain ("O tidings of comfort and joy").
const GOD_REST = [
  seq(["E4", 4], ["B4", 4], ["B4", 4], ["A4", 4]), // rest ye mer-ry
  seq(["G4", 4], ["F#4", 4], ["E4", 4], ["D4", 4]), // gen-tle-men, let
  seq(["E4", 4], ["F#4", 4], ["G4", 4], ["A4", 4]), // noth-ing you dis-
  seq(["B4", 12], ["E4", 4]), // may. Re-
  seq(["E4", 4], ["B4", 4], ["B4", 4], ["A4", 4]), // mem-ber Christ our
  seq(["G4", 4], ["F#4", 4], ["E4", 4], ["D4", 4]), // Sav-ior was
  seq(["E4", 4], ["F#4", 4], ["G4", 4], ["A4", 4]), // born on Christ-mas
  seq(["B4", 12], ["B4", 4]), // Day to
  seq(["C5", 4], ["A4", 4], ["B4", 4], ["C5", 4]), // save us all from
  seq(["D5", 4], ["E5", 4], ["B4", 4], ["A4", 4]), // Sa-tan's pow'r when
  seq(["G4", 4], ["E4", 4], ["F#4", 4], ["G4", 4]), // we were gone a-
  seq(["A4", 8], ["G4", 4], ["A4", 4]), // stray. O
  seq(["B4", 8], ["C5", 4], ["B4", 4]), // ti-dings of
  seq(["B4", 4], ["A4", 4], ["G4", 4], ["F#4", 4]), // com-fort and
  seq(["E4", 8], ["G4", 2], ["F#4", 2], ["E4", 4]), // joy, com-fort and
  seq(["A4", 8], ["G4", 4], ["A4", 4]), // joy. O
  seq(["B4", 4], ["C5", 4], ["D5", 4], ["E5", 4]), // ti-dings of
  seq(["B4", 4], ["A4", 4], ["G4", 4], ["F#4", 4]), // com-fort and
  seq(["E4", 12], ["E4", 4]), // joy. God
];
const GOD_REST_HARMONY = ["Em", "Em", "C", "B7", "Em", "Em", "C", "B7", "Am", "Bm", "Em", "D", "G", "B7", "Em", "D", "G", "B7", "Em"].map((c) => [c, c, c, c]);
/** A backbeat with a fill at the end of each phrase. */
const GOD_REST_SNARE = GOD_REST.map((_, i) => drum([3, 7, 11, 15, 18].includes(i) ? "....x...x.x.xxxx" : "....x.......x..."));

/**
 * An alternative rounds track, "God Rest Ye Merry Gentlemen", kept so it can come back: put it in TRACKS as
 * "sleigh-flight" in place of sleighFlight (and switch the notes in the header and the docs).
 */
export const sleighFlightGodRest: Track = {
  id: "sleigh-flight",
  // 100 BPM as the quiz starts, about 140 once the reindeer are flying.
  bpm: 100,
  bars: 19,
  tempoBoost: 0.35,
  reverb: 0.25,
  layers: [
    // Quiz start: a few sleigh bells, held strings and a root note per beat.
    { inst: "hat", bars: [BELLS_8THS], vol: 0.4, to: 0.7 },
    { inst: "strings", bars: GOD_REST_HARMONY.map(padBar), vol: 0.35, to: 0.75 },
    { inst: "bass", bars: GOD_REST_HARMONY.map(rootBeats), vol: 0.6, to: 0.5 },
    // Warming up: the tune on pizzicato, the woodblock clip-clop of hooves.
    { inst: "pluck", bars: GOD_REST, vol: 0.55, from: 0.2, to: 0.75 },
    { inst: "woodblock", bars: [drum("x..x....x..x....")], vol: 0.3, from: 0.3 },
    // Building: an oom-pah piano, a bouncing bass and a soft kick.
    { inst: "piano", bars: GOD_REST_HARMONY.map(offbeatChords), vol: 0.3, from: 0.4 },
    { inst: "bass", bars: GOD_REST_HARMONY.map(rootBounce), vol: 0.7, from: 0.5 },
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.6, from: 0.4, to: 0.75 },
    // The glockenspiel takes the tune as the quiz nears its end.
    { inst: "bell", bars: shift(GOD_REST, 1), vol: 0.4, from: 0.55 },
    // Intro and flight: the full band, brass on the tune, faster sleigh bells, backbeat.
    { inst: "brass", bars: GOD_REST, vol: 0.65, from: 0.75 },
    { inst: "strings", bars: GOD_REST_HARMONY.map(brokenChords), vol: 0.35, from: 0.75 },
    { inst: "flute", bars: shift(GOD_REST, 1), vol: 0.3, from: 0.85 },
    { inst: "hat", bars: [BELLS_16THS], vol: 0.45, from: 0.7 },
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.8, from: 0.75 },
    { inst: "snare", bars: GOD_REST_SNARE, vol: 0.5, from: 0.75 },
    // A cymbal at the top and at the start of the refrain.
    { inst: "cymbal", bars: GOD_REST.map((_, i) => ([0, 12].includes(i) ? once("x") : rest)), vol: 0.45, from: 0.75 },
    // The last bar's bells shake into the repeat.
    { inst: "openhat", bars: [...Array(18).fill(rest), BELLS_SHAKE], vol: 0.3, from: 0.6 },
  ],
};

// Hark! The Herald Angels Sing in G, 4/4. The last couplet ("Hark! the herald angels sing,
// Glory to the newborn King!") repeats the music of the one before it.
const HARK_REFRAIN = [
  seq(["E5", 6], ["E5", 2], ["E5", 4], ["D5", 4]), // With th'an-gel-ic / Hark! the her-ald
  seq(["C5", 4], ["B4", 4], ["C5", 8]), // host pro-claim / an-gels sing
  seq(["A4", 6], ["B4", 2], ["C5", 4], ["D5", 4]), // Christ is born in / Glo-ry to the
  seq(["G4", 6], ["A4", 2], ["G4", 8]), // Beth-le-hem / new-born King!
];
const HARK = [
  seq(["D4", 4], ["G4", 4], ["G4", 6], ["F#4", 2]), // Hark! the her-ald
  seq(["G4", 4], ["B4", 4], ["B4", 4], ["A4", 4]), // an-gels sing,
  seq(["D5", 4], ["D5", 4], ["D5", 6], ["C5", 2]), // Glo-ry to the
  seq(["B4", 4], ["A4", 4], ["B4", 8]), // new-born King;
  seq(["D4", 4], ["G4", 4], ["G4", 6], ["F#4", 2]), // Peace on earth and
  seq(["G4", 4], ["B4", 4], ["B4", 4], ["A4", 4]), // mer-cy mild,
  seq(["D5", 4], ["A4", 4], ["A4", 6], ["F#4", 2]), // God and sin-ners
  seq(["F#4", 4], ["E4", 4], ["D4", 8]), // re-con-ciled!
  seq(["D5", 4], ["D5", 4], ["D5", 4], ["G4", 4]), // Joy-ful, all ye
  seq(["C5", 4], ["B4", 4], ["B4", 4], ["A4", 4]), // na-tions, rise,
  seq(["D5", 4], ["D5", 4], ["D5", 4], ["G4", 4]), // Join the tri-umph
  seq(["C5", 4], ["B4", 4], ["B4", 4], ["A4", 4]), // of the skies;
  ...HARK_REFRAIN,
  ...HARK_REFRAIN,
];
const HARK_REFRAIN_HARMONY = [["C", "C", "Am", "G"], ["C", "G", "Am", "D7"], ["D", "Em", "Am", "G"], ["G", "D7", "G", "G"]];
const HARK_HARMONY = [
  ["G", "G", "G", "D"], ["G", "Em", "G", "D"], ["G", "G", "G", "D7"], ["G", "D", "G", "G"],
  ["G", "G", "G", "D"], ["G", "Em", "G", "D"], ["D", "D", "D", "D"], ["D", "A7", "D", "D"],
  ["G", "D", "G", "C"], ["C", "G", "G", "D"], ["G", "D", "G", "C"], ["C", "G", "G", "D"],
  ...HARK_REFRAIN_HARMONY,
  ...HARK_REFRAIN_HARMONY,
];

const sleighResults: Track = {
  id: "sleigh-results",
  bpm: 100,
  bars: 20,
  tempoBoost: 0.08,
  reverb: 0.35,
  layers: [
    // A festive brass band on the tune, glockenspiel above, strings and sleigh bells.
    { inst: "brass", bars: HARK, vol: 0.7 },
    { inst: "bell", bars: shift(HARK, 1), vol: 0.3 },
    { inst: "strings", bars: HARK_HARMONY.map(padBar), vol: 0.4 },
    { inst: "bass", bars: HARK_HARMONY.map(rootBeats), vol: 0.7 },
    { inst: "piano", bars: HARK_HARMONY.map(offbeatChords), vol: 0.25 },
    { inst: "hat", bars: [BELLS_8THS], vol: 0.4 },
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.55 },
    { inst: "timpani", bars: HARK_HARMONY.map((q) => seq([XMAS_ROOTS[q[0]!]!, 8], [".", 8])), vol: 0.4 },
    { inst: "cymbal", bars: [once("x"), ...Array(11).fill(rest), once("x"), ...Array(7).fill(rest)], vol: 0.4 },
    // The celebration once every present is delivered: a flute descant, faster bells and a snare.
    { inst: "flute", bars: shift(HARK, 1), vol: 0.28, from: 0.8 },
    { inst: "hat", bars: [BELLS_16THS], vol: 0.35, from: 0.8 },
    { inst: "snare", bars: [drum("....x.......x...")], vol: 0.4, from: 0.8 },
  ],
};

// ---------- Evil Snowman: original arrangements of traditional Christian carols ----------
// Melody sources and CC0 instrument provenance: samples/CREDITS.md.
// Keep the tune present at zero intensity: late rounds can last only seven seconds.
const snowmanLobby: Track = {
  id: "robot-lobby", bpm: 92, bars: ADESTE.length, reverb: 0.3,
  layers: [
    { inst: "flute", bars: ADESTE, vol: 0.55 },
    { inst: "bell", bars: shift(ADESTE, 1), vol: 0.22 },
    { inst: "strings", bars: ADESTE_HARMONY.map(padBar), vol: 0.35 },
    { inst: "piano", bars: ADESTE_HARMONY.map(rootBeats), vol: 0.45 },
    { inst: "pluck", bars: ADESTE_HARMONY.map(brokenChords), vol: 0.25 },
    { inst: "hat", bars: [BELLS_8THS], vol: 0.22 },
  ],
};

const snowmanQuiz: Track = {
  id: "robot-quiz", bpm: 90, tempoBoost: 0.5, bars: GOD_REST.length, reverb: 0.25,
  layers: [
    { inst: "pluck", bars: GOD_REST, vol: 0.65 },
    { inst: "strings", bars: GOD_REST_HARMONY.map(padBar), vol: 0.3 },
    { inst: "piano", bars: GOD_REST_HARMONY.map(rootBeats), vol: 0.4 },
    { inst: "hat", bars: [BELLS_8THS], vol: 0.25 },
    { inst: "strings", bars: GOD_REST, vol: 0.35, from: 0.3 },
    { inst: "piano", bars: GOD_REST_HARMONY.map(offbeatChords), vol: 0.25, from: 0.4 },
    { inst: "timpani", bars: GOD_REST_HARMONY.map((q) => once(XMAS_ROOTS[q[0]!]!)), vol: 0.4, from: 0.5 },
    { inst: "bell", bars: shift(GOD_REST, 1), vol: 0.25, from: 0.55 },
    { inst: "brass", bars: GOD_REST, vol: 0.45, from: 0.7 },
    { inst: "snare", bars: GOD_REST_SNARE, vol: 0.35, from: 0.8 },
    { inst: "hat", bars: [BELLS_16THS], vol: 0.2, from: 0.85 },
  ],
};

const snowmanMove: Track = {
  id: "robot-move", bpm: 116, bars: EMMANUEL.length, reverb: 0.25,
  layers: [
    { inst: "strings", bars: EMMANUEL, vol: 0.65 },
    { inst: "brass", bars: EMMANUEL, vol: 0.4 },
    { inst: "bell", bars: shift(EMMANUEL, 1), vol: 0.25 },
    { inst: "strings", bars: EMMANUEL_HARMONY.map(padBar), vol: 0.3 },
    { inst: "piano", bars: EMMANUEL_HARMONY.map(rootBounce), vol: 0.5 },
    { inst: "timpani", bars: EMMANUEL_HARMONY.map((q) => seq([XMAS_ROOTS[q[0]!]!, 4], [".", 4], [XMAS_ROOTS[q[2]!]!, 4], [".", 4])), vol: 0.35 },
    { inst: "hat", bars: [BELLS_8THS], vol: 0.3 },
    { inst: "snare", bars: EMMANUEL_SNARE, vol: 0.3 },
  ],
};

const snowmanResults: Track = {
  id: "robot-results", bpm: 112, bars: ANTIOCH.length, reverb: 0.35,
  layers: [
    { inst: "brass", bars: ANTIOCH, vol: 0.65 },
    { inst: "strings", bars: ANTIOCH, vol: 0.4 },
    { inst: "bell", bars: shift(ANTIOCH, 1), vol: 0.3 },
    { inst: "strings", bars: ANTIOCH_HARMONY.map(padBar), vol: 0.35 },
    { inst: "piano", bars: ANTIOCH_HARMONY.map(rootBeats), vol: 0.5 },
    { inst: "pluck", bars: ANTIOCH_HARMONY.map(brokenChords), vol: 0.25 },
    { inst: "hat", bars: [BELLS_8THS], vol: 0.3 },
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.4 },
    { inst: "snare", bars: [drum("....x.......x...")], vol: 0.3 },
    { inst: "cymbal", bars: [once("x"), ...Array(ANTIOCH.length - 1).fill(rest)], vol: 0.3 },
  ],
};

type RobotMusicId = Extract<MusicTrackId, `robot-${string}`>;

/** Keep custom file IDs stable while the seasonal skin changes the built-in arrangements. */
export function robotTracksForSkin(skin: RobotSkin): Record<RobotMusicId, Track> {
  return skin === "snowman"
    ? { "robot-lobby": snowmanLobby, "robot-quiz": snowmanQuiz, "robot-move": snowmanMove, "robot-results": snowmanResults }
    : { "robot-lobby": robotLobby, "robot-quiz": robotQuiz, "robot-move": robotMove, "robot-results": robotResults };
}

export const TRACKS: Record<MusicTrackId, Track> = {
  "classic-lobby": classicLobby,
  "classic-question": classicQuestion,
  "classic-leaderboard": classicLeaderboard,
  "classic-results": classicResults,
  "tower-lobby": towerLobby,
  "tower-play": towerPlay,
  "tower-results": towerResults,
  "submarine-lobby": submarineLobby,
  "submarine-chase": submarineChase,
  "submarine-dive": submarineDive,
  "submarine-results": submarineResults,
  "fight-lobby": fightLobby,
  "fight-play": fightPlay,
  "fight-results": fightResults,
  ...robotTracksForSkin(ROBOT_SKIN),
  "land-lobby": landLobby,
  "land-play": landPlay,
  "land-results": landResults,
  "racer-lobby": racerLobby,
  "racer-drive": racerDrive,
  "racer-results": racerResults,
  "cup-lobby": cupLobby,
  "cup-quiz": cupQuiz,
  "cup-drink": cupDrink,
  "cup-results": cupResults,
  "dragon-lobby": dragonLobby,
  "dragon-battle": dragonBattle,
  "dragon-fire": dragonFire,
  "dragon-scramble": dragonScramble,
  "dragon-results": dragonResults,
  "bomb-lobby": bombLobby,
  "bomb-defuse": bombDefuse,
  "bomb-results": bombResults,
  "siege-lobby": siegeLobby,
  "siege-battle": siegeBattle,
  "siege-results": siegeResults,
  "showdown-lobby": showdownLobby,
  showdown,
  "showdown-draw": showdownDraw,
  "showdown-results": showdownResults,
  "sleigh-lobby": sleighLobby,
  "sleigh-flight": sleighFlight,
  "sleigh-results": sleighResults,
};
