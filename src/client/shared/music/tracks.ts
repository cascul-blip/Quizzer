/**
 * The built-in soundtrack: original loops composed for each game mode.
 * Classic = upbeat game show, Tallest Tower = retro chiptune,
 * Submarine Squad = deep-sea suspense, Tower Fight = medieval battle.
 * Any of these can be replaced by an audio file in data/music/<id>.<ext>.
 */
import type { MusicTrackId } from "../../../shared/music-tracks.ts";
import type { Track } from "./engine.ts";

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

// ---------- Tallest Tower: retro arcade ----------

const towerLobby: Track = {
  id: "tower-lobby",
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

// ---------- Submarine Squad: deep-sea suspense ----------

const SUB_PAD = [hold(chord("D3 F3 A3")), hold(chord("Bb2 D3 F3")), hold(chord("G2 Bb2 D3")), hold(chord("A2 C#3 E3"))];

const submarineLobby: Track = {
  id: "submarine-lobby",
  bpm: 70,
  bars: 4,
  layers: [
    { inst: "pad", bars: SUB_PAD, vol: 0.9 },
    { inst: "tribass", bars: [hold("D2"), hold("Bb1"), hold("G1"), hold("A1")], vol: 0.8 },
    { inst: "sonar", bars: [once("A5"), rest], vol: 0.7 },
    { inst: "bubble", bars: [drum(".....x.......x.."), drum("..x.......x.....")], vol: 0.6 },
    {
      inst: "bell",
      bars: [seq(["A4", 4], ["F4", 4], ["D5", 8]), seq(["D5", 4], ["C5", 4], ["Bb4", 8]), seq(["G4", 4], ["Bb4", 4], ["D5", 8]), seq(["E5", 4], ["C#5", 4], ["A4", 8])],
      vol: 0.5,
    },
  ],
};

const submarineChase: Track = {
  id: "submarine-chase",
  bpm: 84,
  bars: 4,
  tempoBoost: 0.5,
  layers: [
    { inst: "heart", bars: [drum("x.......x.......")], vol: 0.8 },
    { inst: "pad", bars: SUB_PAD, vol: 0.6 },
    { inst: "sonar", bars: [once("D6")], vol: 0.6 },
    { inst: "bass", bars: [pump("D2", "x.x.x.x.x.x.x.x."), pump("Bb1", "x.x.x.x.x.x.x.x."), pump("G1", "x.x.x.x.x.x.x.x."), pump("A1", "x.x.x.x.x.x.x.x.")], vol: 0.8, from: 0.3 },
    { inst: "pulse", bars: [arp(["D4", "F4", "A4", "F4"]), arp(["Bb3", "D4", "F4", "D4"]), arp(["G3", "Bb3", "D4", "Bb3"]), arp(["A3", "C#4", "E4", "C#4"])], vol: 0.4, from: 0.5 },
    { inst: "hat", bars: [drum("x.xxx.xxx.xxx.xx")], vol: 0.4, from: 0.7 },
    { inst: "taiko", bars: [drum("o.......o...x...")], vol: 0.55, from: 0.7 },
    {
      inst: "lead",
      bars: [seq(["A5", 2], ["G#5", 2], ["A5", 2], ["G#5", 2], ["A5", 2], ["Bb5", 2], ["A5", 4])],
      vol: 0.55,
      from: 0.85,
    },
  ],
};

const submarineDive: Track = {
  id: "submarine-dive",
  bpm: 76,
  bars: 4,
  layers: [
    { inst: "pad", bars: [hold(chord("D3 F3 A3")), hold(chord("G2 Bb2 D3")), hold(chord("Bb2 D3 F3")), hold(chord("A2 C#3 E3"))], vol: 0.8 },
    { inst: "tribass", bars: [seq(["D2", 8], ["A1", 8]), seq(["G1", 8], ["D2", 8]), seq(["Bb1", 8], ["F2", 8]), seq(["A1", 8], ["E2", 8])], vol: 0.7 },
    { inst: "bell", bars: [arp(["D5", "F5", "A5", "C6"], 2), arp(["G4", "Bb4", "D5", "F5"], 2), arp(["Bb4", "D5", "F5", "A5"], 2), arp(["A4", "C#5", "E5", "G5"], 2)], vol: 0.4 },
    { inst: "sonar", bars: [once("F5"), rest], vol: 0.6 },
    { inst: "bubble", bars: [drum("...x......x....x")], vol: 0.6 },
  ],
};

const submarineResults: Track = {
  id: "submarine-results",
  bpm: 66,
  bars: 4,
  layers: [
    { inst: "pad", bars: [hold(chord("D3 F#3 A3")), hold(chord("B2 D3 F#3")), hold(chord("G2 B2 D3")), hold(chord("A2 C#3 E3"))], vol: 0.9 },
    { inst: "tribass", bars: [hold("D2"), hold("B1"), hold("G1"), hold("A1")], vol: 0.7 },
    {
      inst: "bell",
      bars: [seq(["F#5", 4], ["A5", 4], ["D6", 8]), seq(["D6", 4], ["C#6", 4], ["B5", 8]), seq(["B5", 4], ["A5", 4], ["G5", 8]), seq(["A5", 4], ["E5", 4], ["C#5", 8])],
      vol: 0.55,
    },
    { inst: "sonar", bars: [rest, once("A5")], vol: 0.45 },
    { inst: "bubble", bars: [drum("......x.........")], vol: 0.5 },
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
};
