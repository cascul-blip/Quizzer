import { describe, expect, test } from "bun:test";
import { musicFor } from "../src/client/host/music-cues.ts";
import type { HostView, SubPhase } from "../src/shared/protocol.ts";
import { DRUMS, STEPS_PER_BAR, layerActive, noteFreq, stepSeconds, tokens } from "../src/client/shared/music/engine.ts";
import { TRACKS, robotTracksForSkin } from "../src/client/shared/music/tracks.ts";
import { ROBOT_SKIN } from "../src/client/shared/robot-skin.ts";
import { MUSIC_TRACKS, musicTrackForFile } from "../src/shared/music-tracks.ts";

describe("notes", () => {
  test("note names to frequencies", () => {
    expect(noteFreq("A4")).toBeCloseTo(440);
    expect(noteFreq("A3")).toBeCloseTo(220);
    expect(noteFreq("C4")).toBeCloseTo(261.63, 1);
    expect(noteFreq("Bb2")).toBeCloseTo(116.54, 1);
    expect(noteFreq("F#3")).toBeCloseTo(185, 0);
    expect(noteFreq("x")).toBeNull();
    expect(noteFreq(".")).toBeNull();
  });
});

describe("built-in tracks", () => {
  test("there is a built-in track for every overridable track id", () => {
    expect(Object.keys(TRACKS).sort()).toEqual(MUSIC_TRACKS.map((t) => t.id).sort());
    for (const [id, t] of Object.entries(TRACKS)) expect(t.id).toBe(id);
  });

  for (const [id, track] of Object.entries({ ...TRACKS, ...Object.fromEntries(Object.entries(robotTracksForSkin("robot")).map(([id, track]) => [`original-${id}`, track])) })) {
    test(`${id}: every bar has 16 valid steps`, () => {
      expect(track.bars).toBeGreaterThan(0);
      expect(track.bpm).toBeGreaterThan(40);
      expect(track.bpm).toBeLessThan(220);
      for (const layer of track.layers) {
        expect(layer.bars.length).toBeGreaterThan(0);
        expect(track.bars % layer.bars.length).toBe(0); // loops line up
        for (const bar of layer.bars) {
          const toks = tokens(bar);
          expect(toks).toHaveLength(STEPS_PER_BAR);
          expect(toks[0]).not.toBe("-"); // a hold needs a note before it in the same bar
          for (const tok of toks) {
            if (tok === "." || tok === "-") continue;
            if (DRUMS.has(layer.inst) && (tok === "x" || tok === "o")) continue;
            for (const n of tok.split("+")) expect(noteFreq(n), `${id} ${layer.inst}: "${n}"`).not.toBeNull();
          }
        }
        expect(layer.from ?? 0).toBeGreaterThanOrEqual(0);
        expect(layer.from ?? 0).toBeLessThanOrEqual(1);
      }
      // Something is always playing, even at zero intensity.
      expect(track.layers.some((l) => layerActive(l, 0))).toBe(true);
    });
  }

  test("intensity speeds up adaptive tracks and brings in layers", () => {
    const chase = TRACKS["submarine-chase"];
    expect(stepSeconds(chase, 1)).toBeLessThan(stepSeconds(chase, 0));
    expect(chase.layers.filter((l) => layerActive(l, 1)).length).toBeGreaterThan(chase.layers.filter((l) => layerActive(l, 0)).length);
  });
});

test("custom music files map to track ids", () => {
  expect(musicTrackForFile("submarine-chase.mp3")).toBe("submarine-chase");
  expect(musicTrackForFile("Classic-Lobby.OGG")).toBe("classic-lobby");
  expect(musicTrackForFile("fight-play.wav")).toBe("fight-play");
  expect(musicTrackForFile("unknown-track.mp3")).toBeNull();
  expect(musicTrackForFile("classic-lobby.exe")).toBeNull();
  expect(musicTrackForFile("../classic-lobby.mp3")).toBeNull();
  expect(musicTrackForFile("classic-lobby")).toBeNull();
});

describe("seasonal Robot Attack music", () => {
  test("skin selection preserves IDs and restores all four original arrangements", () => {
    const original = robotTracksForSkin("robot");
    const seasonal = robotTracksForSkin("snowman");
    expect(Object.keys(original).sort()).toEqual(Object.keys(seasonal).sort());
    for (const id of Object.keys(original) as (keyof typeof original)[]) {
      expect(original[id].id).toBe(id);
      expect(seasonal[id].id).toBe(id);
      expect(seasonal[id]).not.toBe(original[id]);
      expect(TRACKS[id]).toBe(robotTracksForSkin(ROBOT_SKIN)[id]);
    }
    // Beethoven's Allegretto, Mountain King, Fifth, and Ode to Joy.
    expect(Object.values(original).map((t) => t.bpm)).toEqual([72, 80, 108, 104]);
  });

  test("carol melodies remain audible throughout the intensity range", () => {
    const seasonal = robotTracksForSkin("snowman");
    const melodies = {
      "robot-lobby": ["flute", "G4"],
      "robot-quiz": ["pluck", "E4"],
      "robot-move": ["strings", "E4"],
      "robot-results": ["brass", "D5"],
    } as const;
    for (const id of Object.keys(melodies) as (keyof typeof melodies)[]) {
      const track = seasonal[id];
      const [instrument, opening] = melodies[id];
      const melody = track.layers.find((l) => l.inst === instrument)!;
      expect(tokens(melody.bars[0]!)[0]).toBe(opening);
      for (const intensity of [0, 0.2, 0.5, 0.8, 1]) expect(layerActive(melody, intensity)).toBe(true);
      // Seasonal arrangements must use only the existing CC0 instrument sets.
      for (const layer of track.layers) expect(["bass", "tribass", "twang"]).not.toContain(layer.inst);
    }
  });

  test("Christmas quiz builds from 90 to 135 BPM with additional orchestral layers", () => {
    const quiz = robotTracksForSkin("snowman")["robot-quiz"];
    expect(60 / (stepSeconds(quiz, 0) * 4)).toBeCloseTo(90);
    expect(60 / (stepSeconds(quiz, 1) * 4)).toBeCloseTo(135);
    expect(quiz.layers.filter((l) => layerActive(l, 1)).length).toBeGreaterThan(quiz.layers.filter((l) => layerActive(l, 0)).length);
  });
});

describe("Sled Squad Christmas music", () => {
  test("the Jingle Bells melody is present in every screen, including a calm chase", () => {
    for (const id of ["submarine-lobby", "submarine-chase", "submarine-dive", "submarine-results"] as const) {
      const track = TRACKS[id];
      const tune = track.layers.find(l => l.bars.length === 16 && tokens(l.bars[0]!).filter(n => n === "E5" || n === "E4").length === 3);
      expect(tune, `${id} must start with the familiar three-note refrain`).toBeDefined();
      for (const intensity of [0, .5, 1]) expect(layerActive(tune!, intensity)).toBe(true);
      for (const l of track.layers) expect(["sonar", "bubble", "heart", "bass", "tribass", "twang"]).not.toContain(l.inst);
    }
  });
});


test("Sled Squad routes the intro, chase, trail challenge, and score screen to their arrangements", () => {
  const view = (phase: SubPhase) => ({ kind: "sub", phase, gap: 10, maxGap: 20 } as Extract<HostView, { kind: "sub" }>);
  expect(musicFor(view("countdown")).track).toBe("submarine-lobby");
  expect(musicFor(view("chase"))).toEqual({ track: "submarine-chase", intensity: .5 });
  expect(musicFor(view("dive")).track).toBe("submarine-dive");
  expect(musicFor(view("podium")).track).toBe("submarine-results");
});
