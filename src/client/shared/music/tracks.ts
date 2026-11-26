import type { MusicTrackId } from "../../../shared/music-tracks.ts";
import type { RobotSkin } from "../robot-skin.ts";
import { ROBOT_SKIN } from "../robot-skin.ts";
import type { Track } from "./engine.ts";

const seq = (...parts: [token: string, sixteenthSteps: number][]) =>
  parts.flatMap(([tok, len]) => (tok === "." ? Array(len).fill(".") : [tok, ...Array(len - 1).fill("-")])).join(" ");
const lyric = (_words: string, bar: string) => bar;
const hold = (tok: string) => seq([tok, 16]);
const drum = (compactPattern: string) => compactPattern.split("").join(" ");
const hitOnFirstStep = (tok: string) => seq([tok, 1], [".", 15]);
const arp = (notes: string[], every = 1) => Array.from({ length: 16 }, (_, i) => (i % every === 0 ? notes[(i / every) % notes.length] : ".")).join(" ");
const alternatingEighths = (low: string, high: string) => arp([low, high], 2);
const noteOnHits = (note: string, pattern: string) =>
  pattern
    .split("")
    .map((c) => (c === "x" ? note : "."))
    .join(" ");
const chord = (notes: string) => notes.split(" ").join("+");
const rest = drum("................");

const classicLobby: Track = {
  id: "classic-lobby",
  bpm: 124,
  bars: 4,
  swing: 0.08,
  layers: [
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.9 },
    { inst: "clap", bars: [drum("....x.......x...")], vol: 0.8 },
    { inst: "hat", bars: [drum("..x...x...x...x.")], vol: 0.8 },
    { inst: "bass", bars: [alternatingEighths("C2", "C3"), alternatingEighths("A1", "A2"), alternatingEighths("F1", "F2"), alternatingEighths("G1", "G2")] },
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
    {
      inst: "pluck",
      bars: [arp(["C5", "E5", "G5", "E5"], 2), arp(["A4", "C5", "E5", "C5"], 2), arp(["F4", "A4", "C5", "A4"], 2), arp(["G4", "B4", "D5", "B4"], 2)],
      vol: 0.45,
    },
  ],
};

const classicQuestion: Track = {
  id: "classic-question",
  bpm: 108,
  bars: 4,
  tempoBoost: 0.4,
  layers: [
    { inst: "tick", bars: [drum("x.x.x.x.x.x.x.x.")], vol: 0.9 },
    {
      inst: "bass",
      bars: [
        noteOnHits("A1", "x.x.x.x.x.x.x.x."),
        noteOnHits("F1", "x.x.x.x.x.x.x.x."),
        noteOnHits("D2", "x.x.x.x.x.x.x.x."),
        noteOnHits("E1", "x.x.x.x.x.x.x.x."),
      ],
      vol: 0.8,
    },
    { inst: "pad", bars: [hold(chord("A3 C4 E4")), hold(chord("F3 A3 C4")), hold(chord("D3 F3 A3")), hold(chord("E3 G#3 B3"))], vol: 0.7 },
    { inst: "kick", bars: [drum("x.......x.......")], from: 0.3, to: 0.6 },
    { inst: "kick", bars: [drum("x...x...x...x...")], from: 0.6 },
    { inst: "hat", bars: [drum("xxxxxxxxxxxxxxxx")], vol: 0.45, from: 0.5 },
    {
      inst: "pulse",
      bars: [arp(["A4", "C5", "E5", "C5"]), arp(["F4", "A4", "C5", "A4"]), arp(["D4", "F4", "A4", "F4"]), arp(["E4", "G#4", "B4", "G#4"])],
      vol: 0.5,
      from: 0.6,
    },
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
        noteOnHits(chord("F4 A4 C5"), "..x...x...x...x."),
        noteOnHits(chord("D4 F4 A4"), "..x...x...x...x."),
        noteOnHits(chord("D4 F4 Bb4"), "..x...x...x...x."),
        noteOnHits(chord("E4 G4 C5"), "..x...x...x...x."),
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
    { inst: "bass", bars: [alternatingEighths("C2", "G2"), alternatingEighths("F1", "C2"), alternatingEighths("G1", "D2"), alternatingEighths("C2", "G2")] },
    {
      inst: "brass",
      bars: [
        seq(["G4", 2], ["C5", 2], ["E5", 2], ["G5", 6], [".", 1], ["E5", 1], ["G5", 2]),
        seq(["A5", 6], ["G5", 2], ["F5", 2], ["E5", 2], ["F5", 4]),
        seq(["D5", 2], ["E5", 2], ["F5", 2], ["G5", 6], ["F5", 2], ["D5", 2]),
        seq(["C5", 8], ["E5", 4], ["C5", 4]),
      ],
    },
    {
      inst: "bell",
      bars: [arp(["C6", "G5", "E6", "G5"], 2), arp(["C6", "A5", "F5", "A5"], 2), arp(["B5", "G5", "D6", "G5"], 2), arp(["C6", "G5", "E6", "C7"], 2)],
      vol: 0.35,
    },
  ],
};

const towerLobby: Track = {
  id: "tower-lobby",
  samples: false,
  bpm: 120,
  bars: 4,
  layers: [
    { inst: "tribass", bars: [alternatingEighths("G2", "G3"), alternatingEighths("E2", "E3"), alternatingEighths("C2", "C3"), alternatingEighths("D2", "D3")] },
    {
      inst: "pulse",
      bars: [arp(["G4", "B4", "D5", "B4"]), arp(["E4", "G4", "B4", "G4"]), arp(["C4", "E4", "G4", "E4"]), arp(["D4", "F#4", "A4", "F#4"])],
      vol: 0.45,
    },
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
    {
      inst: "tribass",
      bars: [
        noteOnHits("E2", "x.x.x.x.x.x.x.x."),
        noteOnHits("C2", "x.x.x.x.x.x.x.x."),
        noteOnHits("G2", "x.x.x.x.x.x.x.x."),
        noteOnHits("D2", "x.x.x.x.x.x.x.x."),
      ],
    },
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.75 },
    { inst: "chipnoise", bars: [drum("....o.......o...")], vol: 0.8 },
    {
      inst: "pulse",
      bars: [arp(["E4", "G4", "B4", "G4"]), arp(["C4", "E4", "G4", "E4"]), arp(["G4", "B4", "D5", "B4"]), arp(["D4", "F#4", "A4", "F#4"])],
      vol: 0.4,
    },
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
    {
      inst: "pulse",
      bars: [arp(["B5", "G5", "E5", "G5"]), arp(["G5", "E5", "C5", "E5"]), arp(["D6", "B5", "G5", "B5"]), arp(["A5", "F#5", "D5", "F#5"])],
      vol: 0.3,
      from: 0.75,
    },
  ],
};

const towerResults: Track = {
  id: "tower-results",
  samples: false,
  bpm: 132,
  bars: 4,
  layers: [
    { inst: "tribass", bars: [alternatingEighths("C2", "C3"), alternatingEighths("F2", "F3"), alternatingEighths("G2", "G3"), alternatingEighths("C2", "C3")] },
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.7 },
    { inst: "chipnoise", bars: [drum("..x...x...x...x.")], vol: 0.5 },
    {
      inst: "pulse",
      bars: [arp(["C5", "E5", "G5", "E5"]), arp(["F4", "A4", "C5", "A4"]), arp(["G4", "B4", "D5", "B4"]), arp(["C5", "E5", "G5", "C6"])],
      vol: 0.4,
    },
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

// why: Pierpont’s 1857 melody is public domain. See samples/CREDITS.md.
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
const JINGLE_PADS = JINGLE_CHORDS.map((c) => hold(JINGLE_VOICINGS[c]!));
const JINGLE_COMP = JINGLE_CHORDS.map((c) => noteOnHits(JINGLE_VOICINGS[c]!, "....x.......x..."));
const JINGLE_BASS = JINGLE_CHORDS.map((c) => {
  const [root, fifth] = JINGLE_ROOTS[c]!;
  return seq([root, 3], [".", 1], [fifth, 3], [".", 1], [root, 3], [".", 1], [fifth, 3], [".", 1]);
});
const JINGLE_BELLS_UP = JINGLE_BELLS.map((bar) => bar.replace(/([A-G][#b]?)(\d)/g, (_, n, oct) => `${n}${Number(oct) + 1}`));
const JINGLE_BELLS_DOWN = JINGLE_BELLS.map((bar) => bar.replace(/([A-G][#b]?)(\d)/g, (_, n, oct) => `${n}${Number(oct) - 1}`));
const SLED_BELLS = drum("o.x.x.x.o.x.x.x.");

const submarineLobby: Track = {
  id: "submarine-lobby",
  bpm: 100,
  bars: JINGLE_BELLS.length,
  reverb: 0.3,
  layers: [
    { inst: "flute", bars: JINGLE_BELLS, vol: 0.5 },
    { inst: "bell", bars: JINGLE_BELLS_UP, vol: 0.18 },
    { inst: "strings", bars: JINGLE_PADS, vol: 0.28 },
    { inst: "piano", bars: JINGLE_BASS, vol: 0.4 },
    { inst: "pluck", bars: JINGLE_COMP, vol: 0.25 },
    { inst: "hat", bars: [SLED_BELLS], vol: 0.22 },
  ],
};

const submarineChase: Track = {
  id: "submarine-chase",
  bpm: 120,
  bars: JINGLE_BELLS.length,
  tempoBoost: 0.25,
  swing: 0.06,
  reverb: 0.25,
  layers: [
    { inst: "brass", bars: JINGLE_BELLS, vol: 0.58 },
    { inst: "bell", bars: JINGLE_BELLS_UP, vol: 0.2 },
    { inst: "piano", bars: JINGLE_BASS, vol: 0.55 },
    { inst: "pluck", bars: JINGLE_COMP, vol: 0.36 },
    { inst: "strings", bars: JINGLE_PADS, vol: 0.3 },
    { inst: "hat", bars: [SLED_BELLS], vol: 0.32 },
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.3 },
    { inst: "snare", bars: [drum("....x.......x...")], vol: 0.24, from: 0.35 },
    { inst: "flute", bars: JINGLE_BELLS, vol: 0.3, from: 0.65 },
    { inst: "hat", bars: [drum("..x...x...x...x.")], vol: 0.22, from: 0.8 },
    { inst: "cymbal", bars: [hitOnFirstStep("x"), ...Array(15).fill(rest)], vol: 0.22, from: 0.8 },
  ],
};

// why: Quiet piano and glockenspiel leave room for spoken symbol instructions.
const submarineDive: Track = {
  id: "submarine-dive",
  bpm: 88,
  bars: JINGLE_BELLS.length,
  reverb: 0.25,
  layers: [
    { inst: "piano", bars: JINGLE_BELLS_DOWN, vol: 0.32 },
    { inst: "bell", bars: JINGLE_BELLS, vol: 0.12 },
    { inst: "strings", bars: JINGLE_PADS, vol: 0.18 },
    { inst: "pluck", bars: JINGLE_CHORDS.map((c) => hold(JINGLE_ROOTS[c]![0].replace(/(\d)$/, (n) => String(Number(n) + 1)))), vol: 0.24 },
  ],
};

const submarineResults: Track = {
  id: "submarine-results",
  bpm: 108,
  bars: JINGLE_BELLS.length,
  reverb: 0.35,
  layers: [
    { inst: "brass", bars: JINGLE_BELLS, vol: 0.6 },
    { inst: "bell", bars: JINGLE_BELLS_UP, vol: 0.26 },
    { inst: "strings", bars: JINGLE_PADS, vol: 0.36 },
    { inst: "piano", bars: JINGLE_BASS, vol: 0.5 },
    { inst: "pluck", bars: JINGLE_COMP, vol: 0.28 },
    { inst: "hat", bars: [SLED_BELLS], vol: 0.25 },
    { inst: "snare", bars: [drum("....x.......x...")], vol: 0.2 },
    { inst: "cymbal", bars: [hitOnFirstStep("x"), ...Array(15).fill(rest)], vol: 0.2 },
  ],
};

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

// why: The public-domain Ein feste Burg score (Mutopia 2008/01/13-1237) starts with a pickup moved to step 0 here.
const fortressMelody = [
  seq(["C5", 4], ["C5", 4], ["C5", 4], ["G4", 2], ["A4", 2]),
  seq(["B4", 4], ["C5", 2], ["B4", 2], ["A4", 4], ["G4", 4]),
  seq(["C5", 4], ["B4", 4], ["A4", 4], ["G4", 4]),
  seq(["A4", 4], ["F4", 2], ["E4", 2], ["D4", 4], ["C4", 4]),
  seq(["C5", 4], ["C5", 4], ["C5", 4], ["G4", 2], ["A4", 2]),
  seq(["B4", 4], ["C5", 2], ["B4", 2], ["A4", 4], ["G4", 4]),
  seq(["C5", 4], ["B4", 4], ["A4", 4], ["G4", 4]),
  seq(["A4", 4], ["F4", 2], ["E4", 2], ["D4", 4], ["C4", 4]),
  seq(["C4", 4], ["G4", 4], ["A4", 4], ["G4", 4]),
  seq(["F#4", 4], ["G4", 12]),
  seq(["C4", 4], ["G4", 4], ["G4", 4], ["A4", 4]),
  seq(["B4", 4], ["C5", 12]),
  seq(["B4", 4], ["C5", 4], ["B4", 4], ["A4", 4]),
  seq(["A4", 4], ["G4", 12]),
  seq(["A4", 4], ["A4", 4], ["G4", 4], ["A4", 4]),
  seq(["F4", 4], ["E4", 12]),
  seq(["C5", 4], ["B4", 4], ["A4", 4], ["G4", 4]),
  seq(["A4", 4], ["F4", 2], ["E4", 2], ["D4", 4], ["C4", 4]),
];
const fortressHarmony = [
  ["C3 E3 G3", "C3 E3 G3"],
  ["G2 B2 D3", "D3 F#3 A3"],
  ["C3 E3 G3", "A2 C3 E3"],
  ["F2 A2 C3", "G2 B2 D3"],
  ["C3 E3 G3", "C3 E3 G3"],
  ["G2 B2 D3", "D3 F#3 A3"],
  ["C3 E3 G3", "A2 C3 E3"],
  ["F2 A2 C3", "G2 B2 D3"],
  ["C3 E3 G3", "A2 C3 E3"],
  ["D3 F#3 A3", "G2 B2 D3"],
  ["C3 E3 G3", "F2 A2 C3"],
  ["G2 B2 D3", "C3 E3 G3"],
  ["E3 G#3 B3", "A2 C3 E3"],
  ["D3 F#3 A3", "G2 B2 D3"],
  ["F2 A2 C3", "A2 C#3 E3"],
  ["D3 F3 A3", "E3 G#3 B3"],
  ["C3 E3 G3", "A2 C3 E3"],
  ["F2 A2 C3", "C3 E3 G3"],
];

const fightPlay: Track = {
  id: "fight-play",
  bpm: 112,
  bars: fortressMelody.length,
  tempoBoost: 0.15,
  rich: true,
  layers: [
    // why: Keeping the melody in the lowest intensity layer makes it audible from the start of battle.
    { inst: "brass", bars: fortressMelody, vol: 0.85 },
    { inst: "organ", bars: fortressHarmony.map(([a, b]) => seq([chord(a!), 8], [chord(b!), 8])), vol: 0.35 },
    { inst: "piano", bars: fortressHarmony.map(([a, b]) => seq([a!.split(" ")[0]!, 8], [b!.split(" ")[0]!, 8])), vol: 0.65 },
    { inst: "strings", bars: fortressHarmony.map(([a, b]) => seq([chord(a!), 8], [chord(b!), 8])), vol: 0.4, from: 0.3 },
    { inst: "taiko", bars: [drum("o.......x...x...")], vol: 0.45 },
    { inst: "snare", bars: [drum("....x.......x.xx")], vol: 0.55, from: 0.6 },
    { inst: "hat", bars: [drum("x.x.x.x.x.x.x.x.")], vol: 0.3, from: 0.6 },
    { inst: "timpani", bars: [seq(["C2", 4], [".", 4], ["G2", 4], [".", 4])], vol: 0.25, from: 0.8 },
  ],
};

const fightResults: Track = {
  id: "fight-results",
  bpm: 100,
  bars: 4,
  layers: [
    { inst: "taiko", bars: [drum("o...x...o...x.x."), drum("o...x...o...x.x."), drum("o...x...o...x.x."), drum("o.x.o.x.oxxxxxxx")], vol: 0.7 },
    { inst: "pad", bars: [hold(chord("D3 F#3 A3")), hold(chord("G3 B3 D4")), hold(chord("A3 C#4 E4")), hold(chord("D3 F#3 A3"))] },
    { inst: "tribass", bars: [alternatingEighths("D2", "A2"), alternatingEighths("G1", "D2"), alternatingEighths("A1", "E2"), alternatingEighths("D2", "A2")] },
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

const shiftOctaves = (bars: string[], by: number) => bars.map((b) => b.replace(/\d/g, (d) => String(Number(d) + by)));
const quarters = (a: string, b: string, c: string, d: string) => seq([a, 4], [b, 4], [c, 4], [d, 4]);
const halves = (a: string, b: string) => [a, a, a, a, b, b, b, b];

// why: The march comes from the Allegretto of Beethoven’s Seventh Symphony.
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
    {
      inst: "timpani",
      bars: [
        hitOnFirstStep("A2"),
        hitOnFirstStep("E3"),
        hitOnFirstStep("E3"),
        hitOnFirstStep("C3"),
        hitOnFirstStep("G2"),
        hitOnFirstStep("G2"),
        hitOnFirstStep("B2"),
        hitOnFirstStep("E3"),
      ],
      vol: 0.35,
    },
    {
      inst: "flute",
      bars: [
        rest,
        rest,
        rest,
        rest,
        seq(["D5", 8], ["B4", 4], ["D5", 4]),
        seq(["D5", 8], ["E5", 8]),
        seq(["F#5", 8], ["D#5", 4], ["F#5", 4]),
        seq(["E5", 12], [".", 4]),
      ],
      vol: 0.6,
    },
  ],
};

// why: Grieg’s In the Hall of the Mountain King gives the round its acceleration from a quiet opening.
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
  tempoBoost: 1,
  layers: [
    { inst: "pluck", bars: MOUNTAIN_KING, vol: 0.9 },
    { inst: "tribass", bars: halves(arp(["B1", "F#2"], 4), arp(["F#1", "C#2"], 4)), vol: 0.8 },
    { inst: "strings", bars: shiftOctaves(MOUNTAIN_KING, 1), vol: 0.8, from: 0.3 },
    { inst: "timpani", bars: halves(noteOnHits("B2", "x.......x......."), noteOnHits("F#2", "x.......x.......")), vol: 0.5, from: 0.45, to: 0.8 },
    {
      inst: "brass",
      bars: halves(noteOnHits(chord("B3 D4 F#4"), "..x...x...x...x."), noteOnHits(chord("A#3 C#4 F#4"), "..x...x...x...x.")),
      vol: 0.5,
      from: 0.55,
    },
    { inst: "flute", bars: shiftOctaves(MOUNTAIN_KING, 2), vol: 0.6, from: 0.7 },
    { inst: "timpani", bars: halves(noteOnHits("B2", "x...x...x...x..."), noteOnHits("F#2", "x...x...x...x...")), vol: 0.55, from: 0.8 },
    { inst: "cymbal", bars: [drum("x.......x.......")], vol: 0.6, from: 0.85 },
  ],
};

// why: Beethoven’s Fifth Symphony suggests fate knocking just before the lasers fire.
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
    { inst: "strings", bars: shiftOctaves(FATE, -1), vol: 0.9 },
    { inst: "brass", bars: shiftOctaves(FATE, -1), vol: 0.6 },
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
    {
      inst: "timpani",
      bars: [seq([".", 4], ["G2", 1], [".", 11]), hitOnFirstStep("G2"), seq([".", 4], ["C3", 1], [".", 11]), seq([".", 8], ["G2", 1], [".", 7])],
      vol: 0.7,
    },
  ],
};

// why: The survivors’ theme quotes Ode to Joy from Beethoven’s Ninth Symphony.
const ODE_OPENING = [quarters("F#4", "F#4", "G4", "A4"), quarters("A4", "G4", "F#4", "E4"), quarters("D4", "D4", "E4", "F#4")];
const ODE = [...ODE_OPENING, seq(["F#4", 6], ["E4", 2], ["E4", 8]), ...ODE_OPENING, seq(["E4", 6], ["D4", 2], ["D4", 8])];
const ODE_D = chord("D3 F#3 A3");
const ODE_A = chord("C#3 E3 A3");

const robotResults: Track = {
  id: "robot-results",
  bpm: 104,
  bars: 8,
  layers: [
    { inst: "strings", bars: shiftOctaves(ODE, 1), vol: 0.9 },
    { inst: "brass", bars: ODE, vol: 0.7 },
    {
      inst: "strings",
      bars: [
        hold(ODE_D),
        seq([ODE_D, 8], [ODE_A, 8]),
        hold(ODE_D),
        hold(ODE_A),
        hold(ODE_D),
        seq([ODE_D, 8], [ODE_A, 8]),
        hold(ODE_D),
        seq([ODE_A, 8], [ODE_D, 8]),
      ],
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
    {
      inst: "timpani",
      bars: [
        hitOnFirstStep("D3"),
        hitOnFirstStep("D3"),
        hitOnFirstStep("D3"),
        hitOnFirstStep("A2"),
        hitOnFirstStep("D3"),
        hitOnFirstStep("D3"),
        hitOnFirstStep("D3"),
        seq(["A2", 1], [".", 7], ["D3", 1], [".", 7]),
      ],
      vol: 0.5,
    },
    { inst: "cymbal", bars: [drum("x..............."), rest, rest, rest], vol: 0.5 },
  ],
};

const rolled = (notes: string) => arp(notes.split(" "), 2);
const eighths = (tok: string) => noteOnHits(tok, "x.x.x.x.x.x.x.x.");

// why: The public-domain Silent Night score (Mutopia 81) doubles its 6/8 note values here to fit twelve 16th-note steps.
const lullaby = (...parts: [token: string, sixteenthSteps: number][]) => seq(...parts);
const SILENT_NIGHT = [
  lullaby(["G4", 6], ["A4", 2], ["G4", 4]),
  lullaby(["E4", 12]),
  lullaby(["G4", 6], ["A4", 2], ["G4", 4]),
  lullaby(["E4", 12]),
  lullaby(["D5", 8], ["D5", 4]),
  lullaby(["B4", 12]),
  lullaby(["C5", 8], ["C5", 4]),
  lullaby(["G4", 12]),
  lullaby(["A4", 8], ["A4", 4]),
  lullaby(["C5", 6], ["B4", 2], ["A4", 4]),
  lullaby(["G4", 6], ["A4", 2], ["G4", 4]),
  lullaby(["E4", 12]),
  lullaby(["A4", 8], ["A4", 4]),
  lullaby(["C5", 6], ["B4", 2], ["A4", 4]),
  lullaby(["G4", 6], ["A4", 2], ["G4", 4]),
  lullaby(["E4", 12]),
  lullaby(["D5", 8], ["D5", 4]),
  lullaby(["F5", 6], ["D5", 2], ["B4", 4]),
  lullaby(["C5", 12]),
  lullaby(["E5", 12]),
  lullaby(["C5", 4], ["G4", 4], ["E4", 4]),
  lullaby(["G4", 6], ["F4", 2], ["D4", 4]),
  lullaby(["C4", 12]),
  lullaby(["C4", 8], [".", 4]),
];
// why: Align the accompaniment to all 24 melody bars so its harmony follows the full carol.
const SILENT_HARMONY = [
  "C3 E3 G3",
  "C3 E3 G3",
  "C3 E3 G3",
  "C3 E3 G3",
  "G2 B2 D3",
  "G2 B2 D3",
  "C3 E3 G3",
  "C3 E3 G3",
  "F2 A2 C3",
  "F2 A2 C3",
  "C3 E3 G3",
  "C3 E3 G3",
  "F2 A2 C3",
  "F2 A2 C3",
  "C3 E3 G3",
  "C3 E3 G3",
  "G2 B2 D3",
  "G2 B2 D3",
  "C3 E3 G3",
  "C3 E3 G3",
  "C3 E3 G3",
  "G2 B2 D3",
  "C3 E3 G3",
  "C3 E3 G3",
];
const silentChords = SILENT_HARMONY.map((notes) => lullaby([chord(notes), 6], [".", 6]));
const silentStrings = SILENT_HARMONY.map((notes) => lullaby([chord(notes), 12]));
const silentHarp = SILENT_HARMONY.map((notes) => {
  const [root, third, fifth] = notes.split(" ") as [string, string, string];
  return lullaby([root, 2], [fifth, 2], [third, 2], [fifth, 2], [third, 2], [fifth, 2]);
});
const silentBells = SILENT_HARMONY.map((_, bar) => (bar % 4 === 0 ? lullaby(["G5", 2], [".", 10]) : lullaby([".", 12])));

const christmasLandLobby: Track = {
  id: "land-christmas-lobby",
  bpm: 60,
  bars: 24,
  stepsPerBar: 12,
  reverb: 0.28,
  layers: [
    { inst: "piano", bars: SILENT_NIGHT, vol: 0.7 },
    { inst: "piano", bars: silentChords, vol: 0.3 },
    { inst: "strings", bars: silentStrings, vol: 0.16 },
    { inst: "bell", bars: silentBells, vol: 0.12 },
  ],
};
const christmasLandPlay: Track = {
  id: "land-christmas-play",
  bpm: 60,
  bars: 24,
  stepsPerBar: 12,
  tempoBoost: 1,
  reverb: 0.28,
  layers: [
    // why: The piano carries the melody across intensity changes so it keeps its place as layers enter.
    ...christmasLandLobby.layers,
    { inst: "pluck", bars: silentHarp, vol: 0.28, from: 0.25 },
    { inst: "strings", bars: SILENT_NIGHT, vol: 0.3, from: 0.45 },
    {
      inst: "piano",
      bars: SILENT_HARMONY.map((notes) => {
        const root = notes.split(" ")[0]!;
        return lullaby([root, 4], [".", 2], [root, 4], [".", 2]);
      }),
      vol: 0.3,
      from: 0.65,
    },
    { inst: "flute", bars: SILENT_NIGHT, vol: 0.32, from: 0.8 },
    { inst: "strings", bars: silentHarp, vol: 0.4, from: 0.65 },
    { inst: "brass", bars: SILENT_NIGHT, vol: 0.32, from: 0.8 },
    { inst: "snare", bars: [drum("....x.....x.")], vol: 0.22, from: 0.8 },
    {
      inst: "timpani",
      bars: SILENT_HARMONY.map((notes) => {
        const [root, , fifth] = notes.split(" ");
        return lullaby([root!, 2], [".", 2], [root!, 2], [".", 2], [fifth!, 2], [".", 2]);
      }),
      vol: 0.28,
      from: 0.85,
    },
    { inst: "bell", bars: shiftOctaves(SILENT_NIGHT, 1), vol: 0.2, from: 0.9 },
    { inst: "cymbal", bars: [lullaby(["x", 1], [".", 11]), lullaby([".", 12]), lullaby([".", 12]), lullaby([".", 12])], vol: 0.12, from: 0.9 },
  ],
};
const christmasLandResults: Track = {
  id: "land-christmas-results",
  bpm: 68,
  bars: 24,
  stepsPerBar: 12,
  reverb: 0.3,
  layers: [
    { inst: "piano", bars: SILENT_NIGHT, vol: 0.75 },
    { inst: "piano", bars: silentChords, vol: 0.3 },
    { inst: "strings", bars: silentStrings, vol: 0.25 },
    { inst: "pluck", bars: silentHarp, vol: 0.22 },
    { inst: "bell", bars: silentBells, vol: 0.18 },
  ],
};

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
    {
      inst: "piano",
      bars: [rest, seq([".", 10], ["G5", 2], ["E5", 4]), rest, seq([".", 8], ["B5", 4], ["G5", 4]), rest, rest, seq([".", 12], ["E5", 4]), rest],
      vol: 0.4,
    },
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
  bpm: 66,
  bars: 8,
  tempoBoost: 0.65,
  reverb: 0.35,
  layers: [
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
    {
      inst: "piano",
      bars: [rolled("A3 E4 A4 C5 E5 C5 A4 E4"), rolled("F3 C4 F4 A4 C5 A4 F4 C4"), rolled("C3 G3 C4 E4 G4 E4 C4 G3"), rolled("G3 D4 G4 B4 D5 B4 G4 D4")],
      vol: 0.6,
      from: 0.25,
      to: 0.85,
    },
    { inst: "piano", bars: LAND_THEME, from: 0.25, to: 0.45 },
    { inst: "tribass", bars: [hold("A2"), hold("F2"), hold("C2"), hold("G2")], vol: 0.6, from: 0.25, to: 0.65 },
    { inst: "strings", bars: LAND_THEME, vol: 0.9, from: 0.45 },
    {
      inst: "strings",
      bars: [hold(chord("A3 C4 E4")), hold(chord("F3 A3 C4")), hold(chord("G3 C4 E4")), hold(chord("G3 B3 D4"))],
      vol: 0.55,
      from: 0.45,
      to: 0.65,
    },
    { inst: "heart", bars: [drum("x.......x.......")], vol: 0.6, from: 0.45, to: 0.65 },
    { inst: "strings", bars: [eighths(chord("A2 E3")), eighths(chord("F2 C3")), eighths(chord("C3 G3")), eighths(chord("G2 D3"))], vol: 0.75, from: 0.65 },
    { inst: "tribass", bars: [eighths("A1"), eighths("F1"), eighths("C2"), eighths("G1")], vol: 0.7, from: 0.65 },
    { inst: "brass", bars: shiftOctaves(LAND_THEME, -1), vol: 0.8, from: 0.65 },
    {
      inst: "timpani",
      bars: [
        noteOnHits("A2", "x...x...x...x..."),
        noteOnHits("F2", "x...x...x...x..."),
        noteOnHits("C3", "x...x...x...x..."),
        noteOnHits("G2", "x...x...x...x..."),
      ],
      vol: 0.5,
      from: 0.65,
    },
    {
      inst: "piano",
      bars: [arp(["A4", "C5", "E5", "A5"]), arp(["F4", "A4", "C5", "F5"]), arp(["G4", "C5", "E5", "G5"]), arp(["G4", "B4", "D5", "G5"])],
      vol: 0.5,
      from: 0.85,
    },
    { inst: "strings", bars: shiftOctaves(LAND_THEME, 1), vol: 0.6, from: 0.85 },
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

// why: The IV–V–iii–vi progression evokes late-1980s arcade racers.

const octaves = (low: string, high: string) => arp([low, low, high, low, low, high, low, high], 2);
const stabs = (notes: string) => noteOnHits(chord(notes), "..x..x..x...x.x.");

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

const RACER_CRUISING_INTENSITY = 0.15;

const racerDrive: Track = {
  id: "racer-drive",
  rich: "arcade",
  bpm: 112,
  bars: 16,
  tempoBoost: 0.45,
  layers: [
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.8, to: RACER_CRUISING_INTENSITY },
    { inst: "tribass", bars: RACER_ROOTS.map((r) => noteOnHits(r, "x...x.x.x...x.x.")), vol: 0.85, to: RACER_CRUISING_INTENSITY },
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.8, from: RACER_CRUISING_INTENSITY },
    { inst: "tribass", bars: RACER_ROOTS.map((r) => octaves(r, octaveUp(r))), from: RACER_CRUISING_INTENSITY },
    { inst: "chipnoise", bars: [drum("....o.......o...")], vol: 0.8, from: RACER_CRUISING_INTENSITY },
    { inst: "pulse", bars: RACER_CHORDS.map(stabs), vol: 0.4, from: RACER_CRUISING_INTENSITY },
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
    { inst: "snare", bars: [drum("....x.......x..."), drum("....x.......x..."), drum("....x.......x..."), drum("....x.....x.x.xx")], vol: 0.55, from: 0.5 },
    {
      inst: "pulse",
      bars: RACER_CHORDS.map((c) => {
        const [a, b, d] = c.split(" ").map((n) => octaveUp(n)) as [string, string, string];
        return arp([a, b, d, b]);
      }),
      vol: 0.3,
      from: 0.6,
    },
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
    {
      inst: "pulse",
      bars: [arp(["A4", "C#5", "E5", "C#5"]), arp(["A4", "D5", "F#5", "D5"]), arp(["G#4", "B4", "E5", "B4"]), arp(["A4", "C#5", "E5", "A5"])],
      vol: 0.35,
    },
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
const CUP_BASS = [
  boomChick("A2", "E2"),
  boomChick("G2", "D2"),
  boomChick("F2", "C3"),
  boomChick("E2", "B2"),
  boomChick("A2", "E2"),
  boomChick("G2", "D2"),
  boomChick("E2", "B2"),
  boomChick("A2", "E2"),
];
const CUP_ROOTS = ["A2", "G2", "F2", "E2", "A2", "G2", "E2", "A2"];

const cupQuiz: Track = {
  id: "cup-quiz",
  bpm: 96,
  bars: 8,
  tempoBoost: 0.7,
  reverb: 0.25,
  layers: [
    { inst: "whistle", bars: CUP_THEME },
    { inst: "twang", bars: CUP_BASS, vol: 0.8 },
    { inst: "twang", bars: CUP_CHORDS.map((c) => noteOnHits(c, "..x...x...x...x.")), vol: 0.45, from: 0.2 },
    { inst: "woodblock", bars: [GALLOP], vol: 0.5, from: 0.25 },
    { inst: "strings", bars: CUP_CHORDS.map(hold), vol: 0.7, from: 0.4 },
    { inst: "timpani", bars: CUP_ROOTS.map((r) => noteOnHits(r, "x.......x.......")), vol: 0.5, from: 0.5 },
    { inst: "brass", bars: CUP_CHORDS.map((c) => noteOnHits(c, "x.......x.x.....")), vol: 0.45, from: 0.65 },
    { inst: "bell", bars: [hitOnFirstStep("E4"), rest], vol: 0.7, from: 0.75 },
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
    { inst: "strings", bars: [AM, F_, chord("D3 F3 A3"), E_].map((c) => noteOnHits(c, "xxxxxxxxxxxxxxxx")), vol: 0.35 },
    { inst: "twang", bars: [seq(["A2", 8], [".", 8]), seq(["F2", 8], [".", 8]), seq(["D2", 8], [".", 8]), seq(["E2", 8], [".", 8])], vol: 0.8 },
    { inst: "whistle", bars: [seq([".", 8], ["E5", 8]), seq(["F5", 8], ["E5", 8]), seq(["D5", 12], [".", 4]), seq(["G#4", 8], ["B4", 8])], vol: 0.7 },
    { inst: "bell", bars: [hitOnFirstStep("A3")], vol: 0.6 },
    {
      inst: "timpani",
      bars: [
        noteOnHits("A2", "x...x...x...x..."),
        noteOnHits("F2", "x...x...x...x..."),
        noteOnHits("D2", "x...x...x...x..."),
        noteOnHits("E2", "x.x.x.x.xxxxxxxx"),
      ],
      vol: 0.45,
      from: 0.6,
    },
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
    {
      inst: "timpani",
      bars: [
        noteOnHits("A2", "x.......x.x....."),
        noteOnHits("D2", "x.......x.x....."),
        noteOnHits("E2", "x.......x.x....."),
        noteOnHits("A2", "x...x...x.x.x..."),
      ],
      vol: 0.5,
    },
    { inst: "woodblock", bars: [GALLOP], vol: 0.45 },
    { inst: "cymbal", bars: [rest, rest, rest, hitOnFirstStep("x")], vol: 0.6 },
  ],
};

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
    {
      inst: "pluck",
      bars: [arp(["G3", "D4", "B4", "D4"], 2), arp(["C4", "G4", "E5", "G4"], 2), arp(["E3", "B3", "G4", "B3"], 2), arp(["D4", "A4", "F#5", "A4"], 2)],
      vol: 0.5,
    },
    {
      inst: "bass",
      bars: [
        noteOnHits("G2", "x.......x......."),
        noteOnHits("C2", "x.......x......."),
        noteOnHits("E2", "x.......x......."),
        noteOnHits("D2", "x.......x......."),
      ],
      vol: 0.5,
    },
    // why: The woodblock substitutes for a soft tabor.
    { inst: "woodblock", bars: [drum("x.....x.x.......")], vol: 0.25 },
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

const SIEGE_MARCH = [
  chord("Bb3 D4 F4"),
  chord("Eb4 G4 Bb4"),
  chord("F3 A3 C4"),
  chord("G3 Bb3 D4"),
  chord("Bb3 D4 F4"),
  chord("Eb4 G4 Bb4"),
  chord("C4 Eb4 G4"),
  chord("F3 A3 C4"),
];
const SIEGE_ROOTS = ["Bb1", "Eb2", "F2", "G1", "Bb1", "Eb2", "C2", "F2"];

const SIEGE_BUILD_BREAK_END_INTENSITY = 0.15;

const siegeBattle: Track = {
  id: "siege-battle",
  rich: true,
  bpm: 112,
  bars: 8,
  tempoBoost: 0.3,
  reverb: 0.22,
  layers: [
    { inst: "snare", bars: [drum("x..xx.x.x..xx.x."), drum("x..xx.x.x..xx.x."), drum("x..xx.x.x..xx.x."), drum("x..xx.x.x.xxxxxx")], vol: 0.45 },
    { inst: "woodblock", bars: [drum("x...x...x...x...")], vol: 0.3 },
    { inst: "pad", bars: SIEGE_MARCH.map(hold), vol: 0.35, to: SIEGE_BUILD_BREAK_END_INTENSITY },
    { inst: "bass", bars: SIEGE_ROOTS.map((r) => noteOnHits(r, "x...x...x...x...")), vol: 0.7, from: SIEGE_BUILD_BREAK_END_INTENSITY },
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
      from: SIEGE_BUILD_BREAK_END_INTENSITY,
    },
    { inst: "strings", bars: SIEGE_MARCH.map((c) => noteOnHits(c, "x.x.x.x.x.x.x.x.")), vol: 0.3, from: 0.35 },
    { inst: "brass", bars: SIEGE_MARCH.map((c) => noteOnHits(c, "x.......x.x.....")), vol: 0.45, from: 0.5 },
    { inst: "hat", bars: [drum("..x...x...x...x.")], vol: 0.35, from: 0.6 },
    { inst: "cymbal", bars: [hitOnFirstStep("x"), rest, rest, rest], vol: 0.45, from: 0.7 },
    {
      inst: "tribass",
      bars: SIEGE_ROOTS.map((r) =>
        noteOnHits(
          r.replace(/\d/, (n) => String(Number(n) - 1)),
          "x.......x.......",
        ),
      ),
      vol: 0.6,
      from: 0.85,
    },
    { inst: "timpani", bars: SIEGE_ROOTS.map((r) => noteOnHits(r.replace("1", "2"), "x.....x.x.......")), vol: 0.6, from: 0.85 },
  ],
};

const siegeResults: Track = {
  id: "siege-results",
  rich: true,
  bpm: 92,
  bars: 4,
  reverb: 0.42,
  layers: [
    {
      inst: "brass",
      bars: [seq(["G3", 8], ["F3", 4], ["Eb3", 4]), seq(["D3", 12], [".", 4]), seq(["C3", 8], ["D3", 4], ["Eb3", 4]), seq(["D3", 12], [".", 4])],
      vol: 0.5,
      to: 0.45,
    },
    { inst: "strings", bars: [hold(chord("G2 Bb2 D3")), hold(chord("D2 F#2 A2")), hold(chord("C2 Eb2 G2")), hold(chord("D2 F#2 A2"))], vol: 0.45, to: 0.45 },
    { inst: "timpani", bars: [hitOnFirstStep("G1"), rest, hitOnFirstStep("C2"), hitOnFirstStep("D2")], vol: 0.4, to: 0.45 },
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
    { inst: "cymbal", bars: [hitOnFirstStep("x"), rest, rest, hitOnFirstStep("x")], vol: 0.45, from: 0.55 },
  ],
};

// why: The melody uses Douglas D. Anderson’s public-domain Patapan soprano score. See samples/CREDITS.md.
const PATAPAN = [
  seq(["A4", 4], ["A4", 4], ["E5", 4], ["E5", 4]),
  seq(["D5", 4], ["E5", 4], ["C5", 4], ["B4", 2], ["C5", 2]),
  seq(["D5", 4], ["B4", 4], ["E5", 8]),
  seq(["C5", 8], ["B4", 8]),
  seq(["B4", 4], ["C5", 4], ["B4", 4], ["G#4", 4]),
  seq(["A4", 4], ["B4", 4], ["C5", 8]),
  seq(["A4", 2], ["B4", 2], ["C5", 2], ["D5", 2], ["E5", 8]),
  seq(["D5", 2], ["E5", 2], ["D5", 2], ["C5", 2], ["B4", 8]),
  seq(["B4", 4], ["C5", 4], ["B4", 4], ["G#4", 4]),
  seq(["A4", 4], ["B4", 4], ["C5", 4], ["B4", 2], ["C5", 2]),
  seq(["D5", 4], ["C5", 2], ["B4", 2], ["E5", 8]),
  seq(["B4", 8], ["A4", 8]),
];
// why: The accompaniment is original to Quizzer. See samples/CREDITS.md for the melody source.
const PATAPAN_CHORDS: Record<string, string[]> = {
  Am: ["A3", "C4", "E4"],
  E: ["E3", "G#3", "B3"],
  Dm: ["D3", "F3", "A3"],
};
const PATAPAN_HARMONY = [
  ["Am", "E"],
  ["Dm", "Am"],
  ["E", "Am"],
  ["Am", "E"],
  ["E", "E"],
  ["Am", "Am"],
  ["Am", "Am"],
  ["Dm", "E"],
  ["E", "E"],
  ["Am", "Am"],
  ["Dm", "Am"],
  ["E", "Am"],
];
const patapanPad = PATAPAN_HARMONY.map(([a, b]) => seq([chord(PATAPAN_CHORDS[a!]!.join(" ")), 8], [chord(PATAPAN_CHORDS[b!]!.join(" ")), 8]));
const patapanBass = PATAPAN_HARMONY.map(([a, b]) => {
  const root = (name: string) => PATAPAN_CHORDS[name]![0]!.replace("3", "2");
  return seq([root(a!), 4], [".", 4], [root(b!), 4], [".", 4]);
});
const patapanPluck = PATAPAN_HARMONY.map(([a, b]) =>
  arp([...PATAPAN_CHORDS[a!]!, PATAPAN_CHORDS[a!]![1]!, ...PATAPAN_CHORDS[b!]!, PATAPAN_CHORDS[b!]![1]!], 2),
);

const christmasSiegeLobby: Track = {
  id: "siege-christmas-lobby",
  rich: true,
  bpm: 96,
  bars: PATAPAN.length,
  reverb: 0.25,
  layers: [
    { inst: "flute", bars: PATAPAN, vol: 0.55 },
    { inst: "bell", bars: shiftOctaves(PATAPAN, 1), vol: 0.16 },
    { inst: "pluck", bars: patapanPluck, vol: 0.38 },
    { inst: "piano", bars: patapanBass, vol: 0.38 },
    { inst: "pad", bars: patapanPad, vol: 0.18 },
    { inst: "woodblock", bars: [drum("x...x.x.x...x.x.")], vol: 0.23 },
    { inst: "snare", bars: [drum("....x.......x...")], vol: 0.13 },
  ],
};
const christmasSiegeBattle: Track = {
  id: "siege-christmas-battle",
  rich: true,
  bpm: 112,
  tempoBoost: 0.15,
  bars: PATAPAN.length,
  reverb: 0.2,
  layers: [
    // why: Countdowns and build breaks use low intensity, so the melody has to enter before the rest of the arrangement.
    { inst: "flute", bars: PATAPAN, vol: 0.55 },
    { inst: "bell", bars: shiftOctaves(PATAPAN, 1), vol: 0.16 },
    { inst: "pluck", bars: patapanPluck, vol: 0.35 },
    { inst: "piano", bars: patapanBass, vol: 0.45 },
    { inst: "pad", bars: patapanPad, vol: 0.2 },
    { inst: "woodblock", bars: [drum("x...x.x.x...x.x.")], vol: 0.3 },
    { inst: "snare", bars: [drum("x..xx.x.x..xx.x."), drum("x..xx.x.x..xx.x."), drum("x..xx.x.x..xx.x."), drum("x..xx.x.x.xxxxxx")], vol: 0.28, from: 0.2 },
    { inst: "hat", bars: [drum("o.x.x.x.o.x.x.x.")], vol: 0.22, from: 0.35 },
    { inst: "strings", bars: patapanPad, vol: 0.3, from: 0.4 },
    { inst: "brass", bars: PATAPAN, vol: 0.28, from: 0.6 },
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.3, from: 0.65 },
    { inst: "timpani", bars: patapanBass, vol: 0.35, from: 0.85 },
  ],
};
const christmasSiegeResults: Track = {
  id: "siege-christmas-results",
  rich: true,
  bpm: 100,
  bars: PATAPAN.length,
  reverb: 0.32,
  layers: [
    { inst: "flute", bars: PATAPAN, vol: 0.45 },
    { inst: "piano", bars: patapanBass, vol: 0.35 },
    { inst: "pad", bars: patapanPad, vol: 0.22 },
    { inst: "bell", bars: shiftOctaves(PATAPAN, 1), vol: 0.22, from: 0.5 },
    { inst: "brass", bars: PATAPAN, vol: 0.35, from: 0.5 },
    { inst: "pluck", bars: patapanPluck, vol: 0.3, from: 0.5 },
    { inst: "woodblock", bars: [drum("x...x.x.x...x.x.")], vol: 0.2, from: 0.5 },
    { inst: "snare", bars: [drum("....x.......x...")], vol: 0.25, from: 0.5 },
  ],
};

// why: The theme is an original composition in the style of a Western film score.

const SHOW_CHORDS = ["D3 F3 A3", "F3 A3 C4", "C3 E3 G3", "D3 F3 A3", "G3 Bb3 D4", "D3 F3 A3", "C#3 E3 A3", "D3 F3 A3"].map(chord);
const SHOW_GUITAR_ROOTS_PER_BAR = ["D2", "F2", "C3", "D2", "G2", "D2", "A2", "D2"];
const tremolo = (chordTok: string) => noteOnHits(chordTok, "xxxxxxxxxxxxxxxx");
const guitarPulse = (root: string) => seq([root, 4], [".", 4], [root, 4], [".", 4]);
// why: The delayed whistle entrance leaves room for the guitar tremolo to establish the theme.
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
// why: The flute waits for the whistle's entrance so it can answer in the gaps.
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
const SHOW_SUNSET = [seq([".", 6], ["A5", 10]), seq(["G5", 6], ["F#5", 6], [".", 4]), seq(["C#6", 8], [".", 8]), seq(["D5", 10], [".", 6])];
const SUN_CHORDS = ["D3 F#3 A3", "G3 B3 D4", "A3 C#4 E4", "D3 F#3 A3"].map(chord);
const SUN_ROOTS = ["D2", "G2", "A2", "D2"];
const SHOW_BOING = noteOnHits("D3", "x.......x.......");
const anvil = (pattern: string) => noteOnHits("D6", pattern);
const SHOW_WHIP = [rest, drum("............o..."), rest, drum("o.........o....."), rest, drum("............o..."), rest, drum("o.........o.o...")];
const SHOW_HUP = [rest, drum("............x.x."), rest, drum("............x.x."), rest, drum("............x.x."), rest, drum("............x.xx")];

const showdownLobby: Track = {
  id: "showdown-lobby",
  bpm: 76,
  bars: 4,
  reverb: 0.62,
  layers: [
    { inst: "twang", bars: SHOW_CHORDS.slice(0, 4).map(tremolo), vol: 0.4 },
    { inst: "twang", bars: SHOW_GUITAR_ROOTS_PER_BAR.slice(0, 4).map(guitarPulse), vol: 0.52 },
    { inst: "whistle", bars: SHOW_THEME.slice(0, 4), vol: 0.55 },
    { inst: "jawharp", bars: [SHOW_BOING, rest, SHOW_BOING, rest], vol: 0.32 },
    { inst: "bell", bars: [anvil("x..............."), rest, rest, rest], vol: 0.28 },
  ],
};

const showdown: Track = {
  id: "showdown",
  bpm: 92,
  bars: 8,
  tempoBoost: 0.35,
  reverb: 0.48,
  layers: [
    { inst: "twang", bars: SHOW_CHORDS.map(tremolo), vol: 0.26 },
    { inst: "twang", bars: SHOW_GUITAR_ROOTS_PER_BAR.map(guitarPulse), vol: 0.58 },
    { inst: "woodblock", bars: [drum("x.......x.......")], vol: 0.3, to: 0.45 },
    { inst: "bell", bars: [anvil("x..............."), rest, rest, rest], vol: 0.32, to: 0.7 },
    { inst: "jawharp", bars: [SHOW_BOING], vol: 0.45 },
    { inst: "whistle", bars: SHOW_THEME, vol: 0.72, from: 0.15 },
    { inst: "flute", bars: SHOW_FLUTE, vol: 0.32, from: 0.35 },
    { inst: "woodblock", bars: [GALLOP], vol: 0.45, from: 0.45 },
    { inst: "timpani", bars: SHOW_GUITAR_ROOTS_PER_BAR.map((r) => noteOnHits(r, "x.......x.......")), vol: 0.45, from: 0.45 },
    { inst: "clap", bars: SHOW_WHIP, vol: 0.55, from: 0.55 },
    { inst: "taiko", bars: SHOW_HUP, vol: 0.5, from: 0.55 },
    { inst: "brass", bars: SHOW_HUP.map((b) => b.replace(/x/g, chord("D3 A3"))), vol: 0.4, from: 0.55 },
    { inst: "bell", bars: [anvil("....x.......x...")], vol: 0.28, from: 0.7 },
    { inst: "strings", bars: SHOW_CHORDS.map((c) => noteOnHits(c, "xxxxxxxxxxxxxxxx")), vol: 0.22, from: 0.7 },
    { inst: "brass", bars: shiftOctaves(SHOW_THEME, -1), vol: 0.58, from: 0.8 },
    { inst: "snare", bars: [drum("....x.......x..."), drum("....x.......x..."), drum("....x.......x..."), drum("....x...x.x.xxxx")], vol: 0.42, from: 0.9 },
    { inst: "cymbal", bars: [rest, rest, rest, rest, rest, rest, rest, hitOnFirstStep("x")], vol: 0.5, from: 0.9 },
  ],
};

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
    { inst: "brass", bars: shiftOctaves(SHOW_SUNSET, -1), vol: 0.8 },
    { inst: "whistle", bars: SHOW_SUNSET, vol: 0.42 },
    { inst: "strings", bars: SUN_CHORDS.map(hold), vol: 0.5 },
    { inst: "twang", bars: SUN_CHORDS.map(tremolo), vol: 0.24 },
    { inst: "twang", bars: SUN_ROOTS.map(guitarPulse), vol: 0.6 },
    { inst: "woodblock", bars: [GALLOP], vol: 0.4 },
    { inst: "jawharp", bars: [SHOW_BOING], vol: 0.4 },
    { inst: "timpani", bars: SUN_ROOTS.map((r) => noteOnHits(r, "x.......x.x.....")), vol: 0.48 },
    { inst: "clap", bars: [rest, drum("............o..."), rest, drum("o...............")], vol: 0.45 },
    { inst: "bell", bars: [anvil("x..............."), rest, anvil("x..............."), hitOnFirstStep("D6")], vol: 0.28 },
    { inst: "cymbal", bars: [rest, rest, rest, hitOnFirstStep("x")], vol: 0.5 },
  ],
};

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
  "F#m": "F#3 A3 C#4",
  "C#m7": "G#3 B3 C#4 E4",
};
const XMAS_ROOTS: Record<string, string> = {
  G: "G2",
  D: "D2",
  D7: "D2",
  A: "A2",
  A7: "A2",
  Em: "E2",
  C: "C3",
  Am: "A2",
  B7: "B2",
  Bm: "B2",
  "F#m": "F#2",
  "C#m7": "C#3",
};

const beats = (q: string[], beat: string, pick: (chordName: string, step: number) => string) =>
  q.flatMap((c, b) => beat.split("").map((ch, i) => (ch === "x" ? pick(c, b * 4 + i) : ch))).join(" ");
const padBar = (q: string[]) => {
  const parts: [string, number][] = [];
  for (const c of q) {
    const last = parts[parts.length - 1];
    if (last && last[0] === chord(XMAS_CHORDS[c]!)) last[1] += 4;
    else parts.push([chord(XMAS_CHORDS[c]!), 4]);
  }
  return seq(...parts);
};
const rootBeats = (q: string[]) => beats(q, "x---", (c) => XMAS_ROOTS[c]!);
const rootBounce = (q: string[]) => beats(q, "x.x.", (c, i) => (i % 4 === 0 ? XMAS_ROOTS[c]! : octaveUp(XMAS_ROOTS[c]!)));
const offbeatChords = (q: string[]) =>
  beats(q, "..x.", (c) =>
    chord(
      XMAS_CHORDS[c]!.split(" ")
        .map((n) => octaveUp(n))
        .join(" "),
    ),
  );
const brokenChords = (q: string[]) =>
  beats(q, "x.x.", (c, i) => {
    const notes = XMAS_CHORDS[c]!.split(" ");
    return octaveUp(notes[(i / 2) % 3]!);
  });
const SLEIGH_BELLS_8THS = drum("o.x.x.x.o.x.x.x.");
const BELLS_16THS = drum("o.xxx.xxo.xxx.xx");

// why: Bar 20 ends with the vocal pickup into bar 1 so the phrase flows across the loop.
const ADESTE = [
  lyric("come, all ye", seq(["G4", 8], ["D4", 4], ["G4", 4])),
  lyric("faith-ful,", seq(["A4", 8], ["D4", 8])),
  lyric("joy-ful and tri-", seq(["B4", 4], ["A4", 4], ["B4", 4], ["C5", 4])),
  lyric("um-phant, O", seq(["B4", 8], ["A4", 4], ["G4", 4])),
  lyric("come ye, O", seq(["G4", 8], ["F#4", 4], ["E4", 4])),
  lyric("come ye to Beth-", seq(["F#4", 4], ["G4", 4], ["A4", 4], ["B4", 4])),
  lyric("le-hem;", seq(["F#4", 8], ["E4", 6], ["D4", 2])),
  seq(["D4", 12], [".", 4]),
  lyric("Come and be-", seq(["D5", 8], ["C5", 4], ["B4", 4])),
  lyric("hold Him,", seq(["C5", 8], ["B4", 8])),
  lyric("born the King of", seq(["A4", 4], ["B4", 4], ["G4", 4], ["A4", 4])),
  lyric("an-gels; O", seq(["F#4", 6], ["E4", 2], ["D4", 4], ["G4", 4])),
  lyric("come, let us a-", seq(["G4", 4], ["F#4", 4], ["G4", 4], ["A4", 4])),
  lyric("dore Him, O", seq(["G4", 8], ["D4", 4], ["B4", 4])),
  lyric("come, let us a-", seq(["B4", 4], ["A4", 4], ["B4", 4], ["C5", 4])),
  lyric("dore Him, O", seq(["B4", 8], ["A4", 4], ["B4", 4])),
  lyric("come, let us a-", seq(["C5", 4], ["B4", 4], ["A4", 4], ["G4", 4])),
  lyric("dore Him, Christ", seq(["F#4", 8], ["G4", 4], ["C5", 4])),
  lyric("the Lord.", seq(["B4", 8], ["A4", 6], ["G4", 2])),
  lyric("… O", seq(["G4", 12], ["G4", 4])),
];
const ADESTE_HARMONY = [
  ["G", "G", "D", "G"],
  ["D", "D", "D", "D"],
  ["G", "D", "G", "C"],
  ["G", "G", "D", "G"],
  ["G", "G", "D", "C"],
  ["D", "Em", "D", "G"],
  ["D", "D", "A", "A"],
  ["D", "D", "D", "D"],
  ["G", "G", "D7", "G"],
  ["C", "C", "G", "G"],
  ["D", "G", "C", "D"],
  ["D", "A", "D", "G"],
  ["G", "D", "G", "D"],
  ["G", "G", "D", "G"],
  ["G", "D", "G", "C"],
  ["G", "G", "D", "G"],
  ["C", "G", "D", "Em"],
  ["D", "D", "G", "C"],
  ["G", "G", "D7", "D7"],
  ["G", "G", "G", "G"],
];

// why: Combine pairs of 2/4 source bars into 4/4. Hold the last note in bar 10 so the bells can lead into the repeat.
const ANTIOCH = [
  lyric("Joy to the world! the", seq(["D5", 4], ["C#5", 3], ["B4", 1], ["A4", 6], ["G4", 2])),
  lyric("Lord is come; Let", seq(["F#4", 4], ["E4", 4], ["D4", 6], ["A4", 2])),
  lyric("earth re-ceive her", seq(["B4", 6], ["B4", 2], ["C#5", 6], ["C#5", 2])),
  lyric("King; Let ev-ery heart pre-", seq(["D5", 6], ["D5", 2], ["D5", 2], ["C#5", 2], ["B4", 2], ["A4", 2])),
  lyric("pare Him room, And heav-en and na-", seq(["A4", 3], ["G4", 1], ["F#4", 2], ["D5", 2], ["D5", 2], ["C#5", 2], ["B4", 2], ["A4", 2])),
  lyric("ture sing, And heav-en and na-", seq(["A4", 3], ["G4", 1], ["F#4", 2], ["F#4", 2], ["F#4", 2], ["F#4", 2], ["F#4", 2], ["F#4", 1], ["G4", 1])),
  lyric("ture sing, And heav-en and na-", seq(["A4", 6], ["G4", 1], ["F#4", 1], ["E4", 2], ["E4", 2], ["E4", 2], ["E4", 1], ["F#4", 1])),
  lyric("ture sing, And heav-en, and", seq(["G4", 6], ["F#4", 1], ["E4", 1], ["D4", 2], ["D5", 4], ["B4", 2])),
  lyric("heav-en and na-ture", seq(["A4", 3], ["G4", 1], ["F#4", 2], ["G4", 2], ["F#4", 4], ["E4", 4])),
  lyric("sing.", seq(["D4", 8], [".", 8])),
];
const ANTIOCH_HARMONY = [
  ["D", "D", "D", "D"],
  ["D", "A", "D", "D"],
  ["G", "G", "A", "A"],
  ["D", "D", "D", "D"],
  ["A7", "D", "D", "D"],
  ["A7", "D", "D", "D"],
  ["D", "D", "A", "A"],
  ["A7", "A7", "D", "G"],
  ["D", "D", "D", "A7"],
  ["D", "D", "D", "D"],
];

const EMMANUEL = [
  lyric("O come, O come,", seq(["E4", 4], ["G4", 4], ["B4", 4], ["B4", 4])),
  lyric("Em-man-u-", seq(["B4", 4], ["A4", 4], ["C5", 4], ["B4", 4])),
  lyric("el,", seq(["A4", 4], ["G4", 12])),
  lyric("And ran-som cap-", seq(["A4", 4], ["B4", 4], ["G4", 4], ["E4", 4])),
  lyric("tive Is-ra-", seq(["G4", 4], ["A4", 4], ["F#4", 4], ["E4", 4])),
  lyric("el,", seq(["D4", 4], ["E4", 12])),
  lyric("That mourns in lone-", seq(["A4", 4], ["A4", 4], ["E4", 4], ["E4", 4])),
  lyric("ly ex-ile", seq(["F#4", 4], ["G4", 4], ["F#4", 4], ["E4", 4])),
  lyric("here", seq(["D4", 12], [".", 4])),
  lyric("Un-til the Son", seq(["G4", 4], ["A4", 4], ["B4", 4], ["B4", 4])),
  lyric("of God ap-", seq(["B4", 4], ["A4", 4], ["C5", 4], ["B4", 4])),
  lyric("pear.", seq(["A4", 4], ["G4", 12])),
  lyric("Re-joice! Re-joice!", seq(["D5", 4], ["D5", 4], ["B4", 4], ["B4", 4])),
  lyric("Em-man-u-", seq(["B4", 4], ["A4", 4], ["C5", 4], ["B4", 4])),
  lyric("el", seq(["A4", 4], ["G4", 12])),
  lyric("Shall come to thee,", seq(["A4", 4], ["B4", 4], ["G4", 4], ["E4", 4])),
  lyric("O Is-ra-", seq(["G4", 4], ["A4", 4], ["F#4", 4], ["E4", 4])),
  lyric("el.", seq(["D4", 4], ["E4", 12])),
];
const EMMANUEL_HARMONY = [
  ["Em", "Em", "Em", "G"],
  ["G", "D", "Am", "Em"],
  ["D", "G", "G", "G"],
  ["D", "G", "Em", "C"],
  ["C", "Am", "D", "Em"],
  ["D", "Em", "Em", "Em"],
  ["Am", "D", "Am", "C"],
  ["D", "G", "D", "Em"],
  ["G", "G", "D", "D"],
  ["Em", "D", "G", "G"],
  ["G", "D", "Am", "Em"],
  ["D", "G", "G", "G"],
  ["G", "D", "G", "Em"],
  ["G", "D", "Am", "Em"],
  ["D", "G", "G", "G"],
  ["D", "G", "Em", "C"],
  ["C", "Am", "B7", "Em"],
  ["D", "Em", "Em", "Em"],
];
const EMMANUEL_BARS_PER_PHRASE = 3;
const SNARE_FILL = "....x...x.x.xxxx";
const SNARE_BACKBEAT = "....x.......x...";
const EMMANUEL_SNARE = Array.from({ length: 18 }, (_, i) => drum(i % EMMANUEL_BARS_PER_PHRASE === EMMANUEL_BARS_PER_PHRASE - 1 ? SNARE_FILL : SNARE_BACKBEAT));

// why: The melody follows the pianotv.net score. Bar 19 is the first ending and its last beat leads back into bar 1.
const GOD_REST = [
  lyric("rest ye mer-ry", seq(["E4", 4], ["B4", 4], ["B4", 4], ["A4", 4])),
  lyric("gen-tle-men, let", seq(["G4", 4], ["F#4", 4], ["E4", 4], ["D4", 4])),
  lyric("noth-ing you dis-", seq(["E4", 4], ["F#4", 4], ["G4", 4], ["A4", 4])),
  lyric("may. Re-", seq(["B4", 12], ["E4", 4])),
  lyric("mem-ber Christ our", seq(["E4", 4], ["B4", 4], ["B4", 4], ["A4", 4])),
  lyric("Sav-ior was", seq(["G4", 4], ["F#4", 4], ["E4", 4], ["D4", 4])),
  lyric("born on Christ-mas", seq(["E4", 4], ["F#4", 4], ["G4", 4], ["A4", 4])),
  lyric("Day to", seq(["B4", 12], ["B4", 4])),
  lyric("save us all from", seq(["C5", 4], ["A4", 4], ["B4", 4], ["C5", 4])),
  lyric("Sa-tan's pow'r when", seq(["D5", 4], ["E5", 4], ["B4", 4], ["A4", 4])),
  lyric("we were gone a-", seq(["G4", 4], ["E4", 4], ["F#4", 4], ["G4", 4])),
  lyric("stray. O", seq(["A4", 8], ["G4", 4], ["A4", 4])),
  lyric("ti-dings of", seq(["B4", 8], ["C5", 4], ["B4", 4])),
  lyric("com-fort and", seq(["B4", 4], ["A4", 4], ["G4", 4], ["F#4", 4])),
  lyric("joy, com-fort and", seq(["E4", 8], ["G4", 2], ["F#4", 2], ["E4", 4])),
  lyric("joy. O", seq(["A4", 8], ["G4", 4], ["A4", 4])),
  lyric("ti-dings of", seq(["B4", 4], ["C5", 4], ["D5", 4], ["E5", 4])),
  lyric("com-fort and", seq(["B4", 4], ["A4", 4], ["G4", 4], ["F#4", 4])),
  lyric("joy. God", seq(["E4", 12], ["E4", 4])),
];
const GOD_REST_HARMONY = ["Em", "Em", "C", "B7", "Em", "Em", "C", "B7", "Am", "Bm", "Em", "D", "G", "B7", "Em", "D", "G", "B7", "Em"].map((c) => [c, c, c, c]);
const GOD_REST_PHRASE_END_INDICES = [3, 7, 11, 15, 18];
const GOD_REST_SNARE = GOD_REST.map((_, i) => drum(GOD_REST_PHRASE_END_INDICES.includes(i) ? SNARE_FILL : SNARE_BACKBEAT));

const HARK_REFRAIN = [
  lyric("With th'an-gel-ic / Hark! the her-ald", seq(["E5", 6], ["E5", 2], ["E5", 4], ["D5", 4])),
  lyric("host pro-claim / an-gels sing", seq(["C5", 4], ["B4", 4], ["C5", 8])),
  lyric("Christ is born in / Glo-ry to the", seq(["A4", 6], ["B4", 2], ["C5", 4], ["D5", 4])),
  lyric("Beth-le-hem / new-born King!", seq(["G4", 6], ["A4", 2], ["G4", 8])),
];
const HARK = [
  lyric("Hark! the her-ald", seq(["D4", 4], ["G4", 4], ["G4", 6], ["F#4", 2])),
  lyric("an-gels sing,", seq(["G4", 4], ["B4", 4], ["B4", 4], ["A4", 4])),
  lyric("Glo-ry to the", seq(["D5", 4], ["D5", 4], ["D5", 6], ["C5", 2])),
  lyric("new-born King;", seq(["B4", 4], ["A4", 4], ["B4", 8])),
  lyric("Peace on earth and", seq(["D4", 4], ["G4", 4], ["G4", 6], ["F#4", 2])),
  lyric("mer-cy mild,", seq(["G4", 4], ["B4", 4], ["B4", 4], ["A4", 4])),
  lyric("God and sin-ners", seq(["D5", 4], ["A4", 4], ["A4", 6], ["F#4", 2])),
  lyric("re-con-ciled!", seq(["F#4", 4], ["E4", 4], ["D4", 8])),
  lyric("Joy-ful, all ye", seq(["D5", 4], ["D5", 4], ["D5", 4], ["G4", 4])),
  lyric("na-tions, rise,", seq(["C5", 4], ["B4", 4], ["B4", 4], ["A4", 4])),
  lyric("Join the tri-umph", seq(["D5", 4], ["D5", 4], ["D5", 4], ["G4", 4])),
  lyric("of the skies;", seq(["C5", 4], ["B4", 4], ["B4", 4], ["A4", 4])),
  ...HARK_REFRAIN,
  ...HARK_REFRAIN,
];
const HARK_REFRAIN_HARMONY = [
  ["C", "C", "Am", "G"],
  ["C", "G", "Am", "D7"],
  ["D", "Em", "Am", "G"],
  ["G", "D7", "G", "G"],
];
const HARK_HARMONY = [
  ["G", "G", "G", "D"],
  ["G", "Em", "G", "D"],
  ["G", "G", "G", "D7"],
  ["G", "D", "G", "G"],
  ["G", "G", "G", "D"],
  ["G", "Em", "G", "D"],
  ["D", "D", "D", "D"],
  ["D", "A7", "D", "D"],
  ["G", "D", "G", "C"],
  ["C", "G", "G", "D"],
  ["G", "D", "G", "C"],
  ["C", "G", "G", "D"],
  ...HARK_REFRAIN_HARMONY,
  ...HARK_REFRAIN_HARMONY,
];

const christmasTowerResults: Track = {
  id: "tower-christmas-results",
  bpm: 100,
  bars: 20,
  tempoBoost: 0.08,
  reverb: 0.35,
  layers: [
    { inst: "brass", bars: HARK, vol: 0.7 },
    { inst: "bell", bars: shiftOctaves(HARK, 1), vol: 0.3 },
    { inst: "strings", bars: HARK_HARMONY.map(padBar), vol: 0.4 },
    { inst: "piano", bars: HARK_HARMONY.map(rootBeats), vol: 0.7 },
    { inst: "piano", bars: HARK_HARMONY.map(offbeatChords), vol: 0.25 },
    { inst: "hat", bars: [SLEIGH_BELLS_8THS], vol: 0.4 },
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.55 },
    { inst: "timpani", bars: HARK_HARMONY.map((q) => seq([XMAS_ROOTS[q[0]!]!, 8], [".", 8])), vol: 0.4 },
    { inst: "cymbal", bars: [hitOnFirstStep("x"), ...Array(11).fill(rest), hitOnFirstStep("x"), ...Array(7).fill(rest)], vol: 0.4 },
    { inst: "flute", bars: shiftOctaves(HARK, 1), vol: 0.28, from: 0.8 },
    { inst: "hat", bars: [BELLS_16THS], vol: 0.35, from: 0.8 },
    { inst: "snare", bars: [drum("....x.......x...")], vol: 0.4, from: 0.8 },
  ],
};

// why: Late rounds can last only seven seconds, so the melody has to be audible at zero intensity.
const snowmanLobby: Track = {
  id: "robot-lobby",
  bpm: 92,
  bars: ADESTE.length,
  reverb: 0.3,
  layers: [
    { inst: "flute", bars: ADESTE, vol: 0.55 },
    { inst: "bell", bars: shiftOctaves(ADESTE, 1), vol: 0.22 },
    { inst: "strings", bars: ADESTE_HARMONY.map(padBar), vol: 0.35 },
    { inst: "piano", bars: ADESTE_HARMONY.map(rootBeats), vol: 0.45 },
    { inst: "pluck", bars: ADESTE_HARMONY.map(brokenChords), vol: 0.25 },
    { inst: "hat", bars: [SLEIGH_BELLS_8THS], vol: 0.22 },
  ],
};

const snowmanQuiz: Track = {
  id: "robot-quiz",
  bpm: 90,
  tempoBoost: 0.5,
  bars: GOD_REST.length,
  reverb: 0.25,
  layers: [
    { inst: "pluck", bars: GOD_REST, vol: 0.65 },
    { inst: "strings", bars: GOD_REST_HARMONY.map(padBar), vol: 0.3 },
    { inst: "piano", bars: GOD_REST_HARMONY.map(rootBeats), vol: 0.4 },
    { inst: "hat", bars: [SLEIGH_BELLS_8THS], vol: 0.25 },
    { inst: "strings", bars: GOD_REST, vol: 0.35, from: 0.3 },
    { inst: "piano", bars: GOD_REST_HARMONY.map(offbeatChords), vol: 0.25, from: 0.4 },
    { inst: "timpani", bars: GOD_REST_HARMONY.map((q) => hitOnFirstStep(XMAS_ROOTS[q[0]!]!)), vol: 0.4, from: 0.5 },
    { inst: "bell", bars: shiftOctaves(GOD_REST, 1), vol: 0.25, from: 0.55 },
    { inst: "brass", bars: GOD_REST, vol: 0.45, from: 0.7 },
    { inst: "snare", bars: GOD_REST_SNARE, vol: 0.35, from: 0.8 },
    { inst: "hat", bars: [BELLS_16THS], vol: 0.2, from: 0.85 },
  ],
};

const snowmanMove: Track = {
  id: "robot-move",
  bpm: 116,
  bars: EMMANUEL.length,
  reverb: 0.25,
  layers: [
    { inst: "strings", bars: EMMANUEL, vol: 0.65 },
    { inst: "brass", bars: EMMANUEL, vol: 0.4 },
    { inst: "bell", bars: shiftOctaves(EMMANUEL, 1), vol: 0.25 },
    { inst: "strings", bars: EMMANUEL_HARMONY.map(padBar), vol: 0.3 },
    { inst: "piano", bars: EMMANUEL_HARMONY.map(rootBounce), vol: 0.5 },
    { inst: "timpani", bars: EMMANUEL_HARMONY.map((q) => seq([XMAS_ROOTS[q[0]!]!, 4], [".", 4], [XMAS_ROOTS[q[2]!]!, 4], [".", 4])), vol: 0.35 },
    { inst: "hat", bars: [SLEIGH_BELLS_8THS], vol: 0.3 },
    { inst: "snare", bars: EMMANUEL_SNARE, vol: 0.3 },
  ],
};

const snowmanResults: Track = {
  id: "robot-results",
  bpm: 112,
  bars: ANTIOCH.length,
  reverb: 0.35,
  layers: [
    { inst: "brass", bars: ANTIOCH, vol: 0.65 },
    { inst: "strings", bars: ANTIOCH, vol: 0.4 },
    { inst: "bell", bars: shiftOctaves(ANTIOCH, 1), vol: 0.3 },
    { inst: "strings", bars: ANTIOCH_HARMONY.map(padBar), vol: 0.35 },
    { inst: "piano", bars: ANTIOCH_HARMONY.map(rootBeats), vol: 0.5 },
    { inst: "pluck", bars: ANTIOCH_HARMONY.map(brokenChords), vol: 0.25 },
    { inst: "hat", bars: [SLEIGH_BELLS_8THS], vol: 0.3 },
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.4 },
    { inst: "snare", bars: [drum("....x.......x...")], vol: 0.3 },
    { inst: "cymbal", bars: [hitOnFirstStep("x"), ...Array(ANTIOCH.length - 1).fill(rest)], vol: 0.3 },
  ],
};

const christmasTowerLobby: Track = { ...snowmanLobby, id: "tower-christmas-lobby" };

// why: The vocal line is transposed from the public-domain Léon Grus score. See samples/CREDITS.md.
const HOLY_NIGHT = [
  seq([".", 7], ["F#4", 8], ["A4", 1]),
  seq(["A4", 7], ["A4", 1], ["B4", 3], ["B4", 1], ["G4", 3], ["B4", 1]),
  seq(["D5", 8], ["A4", 2], [".", 1], ["A4", 1], ["F#4", 3], ["E4", 1]),
  seq(["D4", 4], ["F#4", 3], ["G4", 1], ["A4", 4], ["G4", 3], ["E4", 1]),
  seq(["D4", 8], [".", 8]),
  seq([".", 8], ["F#4", 4], ["F#4", 3], ["F#4", 1]),
  seq(["A4", 7], ["A4", 1], ["B4", 3], ["B4", 1], ["G4", 3], ["B4", 1]),
  seq(["D5", 8], ["A4", 2], [".", 1], ["A4", 1], ["G#4", 3], ["F#4", 1]),
  seq(["C#5", 4], ["A4", 3], ["B4", 1], ["C#5", 4], ["D5", 3], ["C#5", 1]),
  seq(["F#4", 8], [".", 7], ["A4", 1]),
  seq(["A4", 4], ["B4", 4], ["E4", 4], ["A4", 4]),
  seq(["B4", 3], ["A4", 1], ["D5", 3], ["F#4", 1], ["B4", 4], ["A4", 2], [".", 1], ["A4", 1]),
  seq(["A4", 4], ["B4", 4], ["E4", 4], ["A4", 4]),
  seq(["B4", 3], ["A4", 1], ["D5", 3], ["F#4", 1], ["A4", 6], [".", 2]),
  seq(["D5", 12], ["C#5", 3], ["B4", 1]),
  seq(["C#5", 15], ["C#5", 1]),
  seq(["E5", 11], ["B4", 1], ["B4", 3], ["B4", 1]),
  seq(["D5", 8], ["D5", 4], [".", 3], ["D5", 1]),
  seq(["F#5", 8], ["E5", 7], ["A4", 1]),
  seq(["D5", 12], ["C#5", 3], ["B4", 1]),
  seq(["A4", 11], ["A4", 1], ["B4", 3], ["A4", 1]),
  seq(["A4", 12], [".", 3], ["D5", 1]),
  seq(["E5", 15], ["A4", 1]),
  seq(["F#5", 12], ["E5", 4]),
  seq(["D5", 8], ["C#5", 4], ["D5", 3], ["E5", 1]),
  seq(["D5", 8], [".", 8]),
];
const HOLY_NIGHT_HARMONY = [
  ["D", "D", "D", "D"],
  ["D", "D", "G", "G"],
  ["D", "D", "D", "D"],
  ["D", "D", "A7", "A7"],
  ["D", "D", "D", "D"],
  ["D", "D", "D", "D"],
  ["D", "D", "G", "G"],
  ["D", "D", "D7", "D7"],
  ["F#m", "F#m", "C#m7", "C#m7"],
  ["F#m", "F#m", "F#m", "F#m"],
  ["A7", "A7", "A7", "A7"],
  ["D", "D", "D", "D"],
  ["A7", "A7", "A7", "A7"],
  ["D", "D", "D", "D"],
  ["Bm", "Bm", "Bm", "Bm"],
  ["F#m", "F#m", "F#m", "F#m"],
  ["Em", "Em", "Em", "Em"],
  ["Bm", "Bm", "Bm", "Bm"],
  ["D", "D", "A7", "A7"],
  ["D", "D", "Em", "Em"],
  ["D", "D", "A7", "A7"],
  ["D", "D", "D", "D"],
  ["A7", "A7", "A7", "A7"],
  ["D", "D", "Em", "Em"],
  ["D", "D", "A7", "A7"],
  ["D", "D", "D", "D"],
];

function christmasTowerLayers(includeHolyNight: boolean): Track["layers"] {
  const holyNightRest = HOLY_NIGHT.map(() => rest);
  const followWith = (joyBars: string[], holyNightBars = holyNightRest) =>
    includeHolyNight ? [...ANTIOCH.map((_, bar) => joyBars[bar % joyBars.length]!), ...holyNightBars] : joyBars;

  return [
    { inst: "flute", bars: followWith(ANTIOCH, HOLY_NIGHT), vol: 0.55 },
    { inst: "bell", bars: followWith(shiftOctaves(ANTIOCH, 1)), vol: 0.22 },
    { inst: "strings", bars: followWith(ANTIOCH_HARMONY.map(padBar), HOLY_NIGHT_HARMONY.map(padBar)), vol: 0.3 },
    { inst: "piano", bars: followWith(ANTIOCH_HARMONY.map(rootBounce), HOLY_NIGHT_HARMONY.map(rootBeats)), vol: 0.45 },
    { inst: "pluck", bars: followWith(ANTIOCH_HARMONY.map(brokenChords), HOLY_NIGHT_HARMONY.map(brokenChords)), vol: 0.25 },
    { inst: "hat", bars: followWith([SLEIGH_BELLS_8THS]), vol: 0.25 },
    { inst: "piano", bars: followWith(ANTIOCH_HARMONY.map(offbeatChords)), vol: 0.22, from: 0.3 },
    {
      inst: "brass",
      bars: followWith(
        ANTIOCH,
        HOLY_NIGHT.map((bar, i) => (i >= 14 ? bar : rest)),
      ),
      vol: 0.45,
      from: 0.5,
    },
    { inst: "kick", bars: followWith([drum("x.......x.......")]), vol: 0.4, from: 0.5 },
    { inst: "snare", bars: followWith([drum("....x.......x...")]), vol: 0.3, from: 0.75 },
    { inst: "hat", bars: followWith([BELLS_16THS]), vol: 0.2, from: 0.85 },
    { inst: "timpani", bars: followWith(ANTIOCH_HARMONY.map((q) => hitOnFirstStep(XMAS_ROOTS[q[0]!]!))), vol: 0.3, from: 0.85 },
  ];
}

const christmasTowerPlay: Track = {
  id: "tower-christmas-play",
  bpm: 104,
  tempoBoost: 0.25,
  bars: ANTIOCH.length,
  reverb: 0.25,
  layers: christmasTowerLayers(false),
};
const christmasTowerMedley: Track = {
  ...christmasTowerPlay,
  id: "tower-christmas-medley",
  bars: ANTIOCH.length + HOLY_NIGHT.length,
  layers: christmasTowerLayers(true),
};

// why: See samples/CREDITS.md for the public-domain source of the Gloria melody.
const GLORIA_VERSE = [
  seq(["B4", 4], ["B4", 4], ["B4", 4], ["D5", 4]),
  seq(["D5", 6], ["C5", 2], ["B4", 8]),
  seq(["B4", 4], ["A4", 4], ["B4", 4], ["D5", 4]),
  seq(["B4", 6], ["A4", 2], ["G4", 8]),
];
const GLORIA_REFRAIN = [
  seq(["D5", 8], ["E5", 2], ["D5", 2], ["C5", 2], ["B4", 2]),
  seq(["C5", 8], ["D5", 2], ["C5", 2], ["B4", 2], ["A4", 2]),
  seq(["B4", 8], ["C5", 2], ["B4", 2], ["A4", 2], ["G4", 2]),
  seq(["A4", 6], ["D4", 2], ["D4", 8]),
  seq(["G4", 4], ["A4", 4], ["B4", 4], ["C5", 4]),
  seq(["B4", 8], ["A4", 8]),
];
const GLORIA = [...GLORIA_VERSE, ...GLORIA_VERSE, ...GLORIA_REFRAIN, ...GLORIA_REFRAIN, hold("G4")];
const GLORIA_VERSE_HARMONY = [
  ["G", "G", "Em", "G"],
  ["C", "D7", "G", "G"],
  ["G", "D", "G", "G"],
  ["G", "D7", "G", "G"],
];
const GLORIA_REFRAIN_HARMONY = [
  ["G", "G", "Em", "Em"],
  ["Am", "Am", "D7", "D7"],
  ["G", "G", "C", "C"],
  ["D", "D", "D", "D"],
  ["G", "D", "G", "C"],
  ["G", "G", "D7", "D7"],
];
const GLORIA_HARMONY = [...GLORIA_VERSE_HARMONY, ...GLORIA_VERSE_HARMONY, ...GLORIA_REFRAIN_HARMONY, ...GLORIA_REFRAIN_HARMONY, ["G", "G", "G", "G"]];

const carolArcadeArp = (q: string[]) =>
  beats(q, "xxxx", (c, step) => {
    const notes = XMAS_CHORDS[c]!.split(" ");
    return octaveUp(notes[[0, 1, 2, 1][step % 4]!]!, 2);
  });
const carolArcadeStabs = (q: string[]) =>
  beats(q, "..x.", (c) =>
    chord(
      XMAS_CHORDS[c]!.split(" ")
        .map((n) => octaveUp(n))
        .join(" "),
    ),
  );

const christmasRacerLobby: Track = {
  id: "racer-christmas-lobby",
  rich: "arcade",
  bpm: 104,
  bars: GLORIA.length,
  layers: [
    { inst: "bell", bars: shiftOctaves(GLORIA, 1), vol: 0.42 },
    { inst: "lead", bars: GLORIA, vol: 0.35, echo: 0.2 },
    { inst: "tribass", bars: GLORIA_HARMONY.map(rootBounce), vol: 0.6 },
    { inst: "pulse", bars: GLORIA_HARMONY.map(carolArcadeStabs), vol: 0.25 },
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.5 },
    { inst: "chipnoise", bars: [drum("....o.......o...")], vol: 0.35 },
    { inst: "hat", bars: [SLEIGH_BELLS_8THS], vol: 0.35 },
  ],
};

const christmasRacerDrive: Track = {
  id: "racer-christmas-drive",
  rich: "arcade",
  bpm: 112,
  tempoBoost: 0.45,
  bars: GOD_REST.length,
  layers: [
    { inst: "lead", bars: GOD_REST, vol: 0.7, echo: 0.25 },
    { inst: "kick", bars: [drum("x.......x.......")], vol: 0.65, to: 0.15 },
    { inst: "tribass", bars: GOD_REST_HARMONY.map(rootBeats), vol: 0.6, to: 0.15 },
    { inst: "hat", bars: [SLEIGH_BELLS_8THS], vol: 0.3, to: 0.75 },
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.75, from: 0.15 },
    { inst: "tribass", bars: GOD_REST_HARMONY.map(rootBounce), vol: 0.85, from: 0.15 },
    { inst: "chipnoise", bars: [drum("....o.......o...")], vol: 0.55, from: 0.15 },
    { inst: "pulse", bars: GOD_REST_HARMONY.map(carolArcadeStabs), vol: 0.3, from: 0.25 },
    { inst: "bell", bars: shiftOctaves(GOD_REST, 1), vol: 0.25, from: 0.35 },
    { inst: "snare", bars: GOD_REST_SNARE, vol: 0.4, from: 0.5 },
    { inst: "pulse", bars: GOD_REST_HARMONY.map(carolArcadeArp), vol: 0.2, from: 0.6 },
    { inst: "hat", bars: [BELLS_16THS], vol: 0.4, from: 0.75 },
    { inst: "openhat", bars: [drum("..x...x...x...x.")], vol: 0.35, from: 0.75 },
    { inst: "brass", bars: GOD_REST, vol: 0.25, from: 0.87 },
  ],
};

const christmasRacerResults: Track = {
  id: "racer-christmas-results",
  rich: "arcade",
  bpm: 126,
  bars: HARK.length,
  layers: [
    { inst: "brass", bars: HARK, vol: 0.6 },
    { inst: "bell", bars: shiftOctaves(HARK, 1), vol: 0.3 },
    { inst: "lead", bars: HARK, vol: 0.3, echo: 0.2 },
    { inst: "tribass", bars: HARK_HARMONY.map(rootBounce), vol: 0.7 },
    { inst: "pulse", bars: HARK_HARMONY.map(carolArcadeArp), vol: 0.2 },
    { inst: "kick", bars: [drum("x...x...x...x...")], vol: 0.65 },
    { inst: "chipnoise", bars: [drum("....o.......o...")], vol: 0.45 },
    { inst: "hat", bars: [SLEIGH_BELLS_8THS], vol: 0.4 },
  ],
};

// why: The melody uses Hopkins’s original 3/8 arrangement without the interlude. See samples/CREDITS.md.
const WE_THREE_KINGS_OPENING = [seq(["B4", 4], ["A4", 2]), seq(["G4", 4], ["E4", 2]), seq(["F#4", 2], ["G4", 2], ["F#4", 2]), seq(["E4", 4], [".", 2])];
const WE_THREE_KINGS_VERSE = [
  ...WE_THREE_KINGS_OPENING,
  ...WE_THREE_KINGS_OPENING,
  seq(["G4", 4], ["G4", 2]),
  seq(["A4", 4], ["A4", 2]),
  seq(["B4", 4], ["B4", 2]),
  seq(["D5", 2], ["C5", 2], ["B4", 2]),
  seq(["A4", 2], ["B4", 2], ["A4", 2]),
  seq(["G4", 4], ["F#4", 2]),
  seq(["E4", 4], [".", 2]),
];
const WE_THREE_KINGS_REFRAIN = [
  seq(["F#4", 4], ["A4", 2]),
  seq(["G4", 4], ["G4", 2]),
  seq(["G4", 4], ["D4", 2]),
  seq(["G4", 4], ["E4", 2]),
  seq(["G4", 4], [".", 2]),
  seq(["G4", 4], ["G4", 2]),
  seq(["G4", 4], ["D4", 2]),
  seq(["G4", 4], ["E4", 2]),
  seq(["G4", 4], [".", 2]),
  seq(["G4", 4], ["G4", 2]),
  seq(["A4", 4], ["B4", 2]),
  seq(["C5", 4], ["B4", 2]),
  seq(["A4", 4], ["B4", 2]),
  seq(["G4", 4], ["G4", 2]),
  seq(["G4", 4], ["D4", 2]),
  seq(["G4", 4], ["E4", 2]),
  seq(["G4", 6]),
];
const WE_THREE_KINGS_MELODY = [...WE_THREE_KINGS_VERSE, ...WE_THREE_KINGS_REFRAIN];
type WeThreeKingsChord = "Em" | "B7" | "G" | "Am" | "D7" | "C";
const WE_THREE_KINGS_VERSE_HARMONY: WeThreeKingsChord[] = ["Em", "Em", "B7", "Em", "Em", "Em", "B7", "Em", "G", "Am", "Em", "G", "Am", "B7", "Em"];
const WE_THREE_KINGS_REFRAIN_HARMONY: WeThreeKingsChord[] = ["D7", "G", "G", "C", "G", "G", "G", "C", "G", "G", "D7", "C", "D7", "G", "G", "C", "G"];
const WE_THREE_KINGS_HARMONY = [...WE_THREE_KINGS_VERSE_HARMONY, ...WE_THREE_KINGS_REFRAIN_HARMONY];
const weThreeKingsRefrain = (bar: number) => bar >= WE_THREE_KINGS_VERSE.length;
const WE_THREE_KINGS_REST = seq([".", 6]);
const WE_THREE_KINGS_GUITAR: Record<WeThreeKingsChord, [bass: string, string, string, string]> = {
  Em: ["E2", "G3", "B3", "E4"],
  B7: ["B2", "F#3", "A3", "D#4"],
  G: ["G2", "G3", "B3", "D4"],
  Am: ["A2", "A3", "C4", "E4"],
  D7: ["D3", "A3", "C4", "F#4"],
  C: ["C3", "G3", "C4", "E4"],
};
const WE_THREE_KINGS_DULCIMER: Record<WeThreeKingsChord, [string, string, string]> = {
  Em: ["B3", "E4", "G4"],
  B7: ["A3", "D#4", "F#4"],
  G: ["B3", "D4", "G4"],
  Am: ["C4", "E4", "A4"],
  D7: ["C4", "F#4", "A4"],
  C: ["C4", "E4", "G4"],
};
const WE_THREE_KINGS_BASS: Record<WeThreeKingsChord, string> = { Em: "E2", B7: "B1", G: "G2", Am: "A2", D7: "D2", C: "C2" };
const christmasMemoryPlay: Track = {
  id: "memory-christmas-play",
  bpm: 76,
  stepsPerBar: 6,
  bars: WE_THREE_KINGS_MELODY.length,
  rich: true,
  reverb: 0.24,
  layers: [
    { inst: "nylon", bars: WE_THREE_KINGS_MELODY, vol: 0.45 },
    { inst: "flute", bars: WE_THREE_KINGS_MELODY.map((bar, i) => (weThreeKingsRefrain(i) ? bar : WE_THREE_KINGS_REST)), vol: 0.55 },
    {
      inst: "dulcimer",
      bars: WE_THREE_KINGS_HARMONY.map((chord, i) => {
        const [low, mid, high] = WE_THREE_KINGS_DULCIMER[chord];
        return weThreeKingsRefrain(i) ? `. ${low} . ${mid} . ${high}` : WE_THREE_KINGS_REST;
      }),
      vol: 0.3,
    },
    {
      inst: "steel",
      bars: WE_THREE_KINGS_HARMONY.map((chord) => {
        const [bass, low, mid, high] = WE_THREE_KINGS_GUITAR[chord];
        return `${bass} - ${low} ${mid} ${high} ${mid}`;
      }),
      vol: 0.43,
    },
    {
      inst: "tribass",
      bars: WE_THREE_KINGS_HARMONY.map((chord, i) => (weThreeKingsRefrain(i) ? seq([WE_THREE_KINGS_BASS[chord], 4], [".", 2]) : WE_THREE_KINGS_REST)),
      vol: 0.43,
    },
  ],
};

type RobotMusicId = Extract<MusicTrackId, `robot-${string}`>;

// why: Custom uploads use these IDs as filenames, so seasonal arrangements must preserve them.
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
  "tower-christmas-lobby": christmasTowerLobby,
  "tower-christmas-play": christmasTowerPlay,
  "tower-christmas-medley": christmasTowerMedley,
  "tower-christmas-results": christmasTowerResults,
  "memory-christmas-play": christmasMemoryPlay,
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
  "land-christmas-lobby": christmasLandLobby,
  "land-christmas-play": christmasLandPlay,
  "land-christmas-results": christmasLandResults,
  "racer-lobby": racerLobby,
  "racer-drive": racerDrive,
  "racer-results": racerResults,
  "racer-christmas-lobby": christmasRacerLobby,
  "racer-christmas-drive": christmasRacerDrive,
  "racer-christmas-results": christmasRacerResults,
  "cup-lobby": cupLobby,
  "cup-quiz": cupQuiz,
  "cup-drink": cupDrink,
  "cup-results": cupResults,
  "siege-lobby": siegeLobby,
  "siege-battle": siegeBattle,
  "siege-results": siegeResults,
  "siege-christmas-lobby": christmasSiegeLobby,
  "siege-christmas-battle": christmasSiegeBattle,
  "siege-christmas-results": christmasSiegeResults,
  "showdown-lobby": showdownLobby,
  showdown,
  "showdown-draw": showdownDraw,
  "showdown-results": showdownResults,
};
