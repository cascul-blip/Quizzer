import { describe, expect, test } from "bun:test";
import { DRUMS, STEPS_PER_BAR, layerActive, noteFreq, stepSeconds, tokens } from "../src/client/shared/music/engine.ts";
import { TRACKS } from "../src/client/shared/music/tracks.ts";
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

  for (const [id, track] of Object.entries(TRACKS)) {
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
