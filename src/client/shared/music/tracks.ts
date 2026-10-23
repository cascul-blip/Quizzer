/**
 * The built-in soundtrack: loops composed or arranged for each game mode.
 * Classic = upbeat game show, Tallest Tower = retro chiptune,
 * Submarine Squad = deep-sea suspense, Tower Fight = medieval battle,
 * Robot Attack = Romantic orchestra (public-domain Beethoven and Grieg themes),
 * Land Grab = calm ambient piano that grows into an orchestra as rings close,
 * Racer = sunny late-80s arcade-racing chiptune (tempo follows the car's speed),
 * Cup of Death = original spaghetti-western themes: whistle, twangy guitar, galloping hooves,
 * Dragon's Hoard = a dark cave, a heroic battle with brass and choir, war drums under the fire, a plucky scramble,
 * Bomb Squad = spy-jazz (bass, brushes, vibraphone) that picks up a tick and more layers as the bomb runs down.
 * Kingdom Siege = a pastoral recorder-and-lute lobby, a marching battle with snare, tabor, recorders and brass,
 *   church bells for a victory and a low brass lament for a fallen castle. These three use the rich sound (see rich.ts).
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
  "robot-lobby": robotLobby,
  "robot-quiz": robotQuiz,
  "robot-move": robotMove,
  "robot-results": robotResults,
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
};
