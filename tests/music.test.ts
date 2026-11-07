import { startTiles, hexDistance } from "../src/shared/land-board.ts";
import { describe, expect, test } from "bun:test";
import { musicFor } from "../src/client/host/music-cues.ts";
import type { HostView, SubPhase } from "../src/shared/protocol.ts";
import { DRUMS, stepsPerBar, layerActive, noteFreq, stepSeconds, tokens, usesSamples } from "../src/client/shared/music/engine.ts";
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
    test(`${id}: every bar has valid steps for its meter`, () => {
      expect(track.bars).toBeGreaterThan(0);
      expect(track.bpm).toBeGreaterThan(40);
      expect(track.bpm).toBeLessThan(220);
      for (const layer of track.layers) {
        expect(layer.bars.length).toBeGreaterThan(0);
        expect(track.bars % layer.bars.length).toBe(0); // loops line up
        for (const bar of layer.bars) {
          const toks = tokens(bar);
          expect(toks).toHaveLength(stepsPerBar(track));
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

test("Tower Fight keeps the full fortress hymn audible while damage adds intensity", () => {
  const track = TRACKS["fight-play"];
  const melody = track.layers.find((l) => l.inst === "brass")!;
  expect(track.bars).toBe(18);
  expect(melody.bars).toHaveLength(track.bars);
  expect(melody.bars.slice(0, 4)).toEqual(melody.bars.slice(4, 8)); // repeated opening stanza
  expect(tokens(melody.bars[0]!).filter((n) => n !== "-")).toEqual(["C5", "C5", "C5", "G4", "A4"]);
  expect(tokens(melody.bars.at(-1)!).filter((n) => n !== "-")).toEqual(["A4", "F4", "E4", "D4", "C4"]);
  for (const intensity of [0, 0.15, 0.3, 0.6, 0.8, 1]) expect(layerActive(melody, intensity)).toBe(true);
  expect(stepSeconds(track, 1)).toBeLessThan(stepSeconds(track, 0));
  expect(track.layers.filter((l) => layerActive(l, 1)).length).toBeGreaterThan(track.layers.filter((l) => layerActive(l, 0)).length);
  for (const layer of track.layers) expect(["bass", "tribass", "twang"]).not.toContain(layer.inst);
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

describe("Christmas Toybox Patapan music", () => {
  test("theme selects Patapan throughout the game and keeps the classic soundtrack selectable", () => {
    for (const theme of ["christmas", "classic", undefined] as const) {
      const prefix = theme === "classic" ? "siege" : "siege-christmas";
      expect(musicFor({ kind: "classic", phase: "lobby", mode: "siege", siege: { waves: 5, theme } } as HostView).track).toBe(`${prefix}-lobby`);
      for (const phase of ["countdown", "build", "wave", "stands", "fallen", "podium"] as const) {
        const cue = musicFor({ kind: "siege", phase, settings: { waves: 5, theme }, wave: 3, hearts: 8, maxHearts: 10, monsterCount: 4, monsters: [], phaseRemainingMs: 5000, result: null } as unknown as HostView);
        expect(cue.track).toBe(`${prefix}-${["stands", "fallen", "podium"].includes(phase) ? "results" : "battle"}`);
        if (phase === "build") expect(cue.rampMs).toBe(5000);
      }
    }
  });

  test("complete Patapan melody stays audible and battle layers increase with intensity", () => {
    for (const id of ["siege-christmas-lobby", "siege-christmas-battle", "siege-christmas-results"] as const) {
      const track = TRACKS[id];
      const melody = track.layers.find(l => l.inst === "flute")!;
      expect(track.bars).toBe(12);
      expect(tokens(melody.bars[0]!).filter(t => t !== "-")).toEqual(["A4", "A4", "E5", "E5"]);
      expect(tokens(melody.bars[11]!).filter(t => t !== "-")).toEqual(["B4", "A4"]);
      for (const intensity of [0, 0.05, 0.5, 0.85, 1]) expect(layerActive(melody, intensity)).toBe(true);
      for (const layer of track.layers) expect(["bass", "tribass", "twang"]).not.toContain(layer.inst);
    }
    const battle = TRACKS["siege-christmas-battle"];
    expect(battle.layers.filter(l => layerActive(l, 0.9)).length).toBeGreaterThan(battle.layers.filter(l => layerActive(l, 0.05)).length);
    expect(stepSeconds(battle, 0.9)).toBeLessThan(stepSeconds(battle, 0.05));
  });
});

describe("North Pole Tower Christmas music", () => {
  test("theme selects carols in the lobby, countdown, building and podium", () => {
    for (const theme of ["christmas", "classic", undefined] as const) {
      const prefix = theme === "classic" ? "tower" : "tower-christmas";
      const lobby = { kind: "classic", phase: "lobby", mode: "tower", tower: { theme } } as HostView;
      expect(musicFor(lobby).track).toBe(`${prefix}-lobby`);
      for (const phase of ["countdown", "playing", "podium"] as const) {
        const view = { kind: "tower", theme, phase, remainingMs: 150_000 } as HostView;
        const cue = musicFor(view);
        expect(cue.track).toBe(`${prefix}-${phase === "podium" ? "results" : "play"}`);
        if (phase === "playing") {
          expect(cue.intensity).toBe(0.5);
          expect(cue.rampTo).toBe(1);
          expect(cue.rampMs).toBe(150_000);
        }
      }
    }
  });

  test("recognizable melodies play at every intensity using only CC0 instruments", () => {
    for (const [id, inst, opening] of [
      ["tower-christmas-lobby", "flute", "G4"],
      ["tower-christmas-play", "flute", "D5"],
      ["tower-christmas-results", "brass", "D4"],
    ] as const) {
      const track = TRACKS[id];
      const melody = track.layers.find(l => l.inst === inst)!;
      expect(tokens(melody.bars[0]!)[0]).toBe(opening);
      for (const intensity of [0, 0.25, 0.5, 0.75, 1]) expect(layerActive(melody, intensity)).toBe(true);
      for (const layer of track.layers) expect(["bass", "tribass", "twang"]).not.toContain(layer.inst);
    }
    const play = TRACKS["tower-christmas-play"];
    expect(60 / (stepSeconds(play, 1) * 4)).toBeCloseTo(130);
    expect(play.layers.filter(l => layerActive(l, 1)).length).toBeGreaterThan(play.layers.filter(l => layerActive(l, 0)).length);
  });
});

describe("Neon Noel Racer Christmas music", () => {
  test("theme selects the lobby, continuous drive, and results, including the default theme", () => {
    for (const theme of ["christmas", "classic", undefined] as const) {
      const prefix = theme === "classic" ? "racer" : "racer-christmas";
      const lobby = { kind: "classic", phase: "lobby", mode: "racer", racer: { theme } } as HostView;
      expect(musicFor(lobby)).toEqual({ track: `${prefix}-lobby` });
      for (const phase of ["intro", "confidence", "open", "reveal"] as const) {
        for (const [speed, crashed, intensity] of [[0, true, 0.03], [0, false, 0.1], [75, false, 0.5], [150, false, 1], [200, false, 1]] as const) {
          const view = { kind: "racer", theme, phase, car: { speed, crashed } } as HostView;
          // No per-question key: phase changes must not restart the melody.
          expect(musicFor(view)).toEqual({ track: `${prefix}-drive`, intensity });
        }
      }
      expect(musicFor({ kind: "racer", theme, phase: "podium" } as HostView).track).toBe(`${prefix}-results`);
    }
  });

  test("complete carol melodies remain audible at every intensity in the synthesized arcade style", () => {
    for (const [id, inst, opening, bars] of [
      ["racer-christmas-lobby", "bell", ["B5", "B5", "B5", "D6"], 21],
      ["racer-christmas-drive", "lead", ["E4", "B4", "B4", "A4"], 19],
      ["racer-christmas-results", "brass", ["D4", "G4", "G4", "F#4"], 20],
    ] as const) {
      const track = TRACKS[id];
      expect(track.rich).toBe("arcade");
      expect(usesSamples(track)).toBe(false);
      const melody = track.layers.find(l => l.inst === inst)!;
      expect(melody.bars).toHaveLength(bars);
      expect(tokens(melody.bars[0]!).filter(n => n !== "-" && n !== ".")).toEqual([...opening]);
      for (const intensity of [0, 0.03, 0.1, 0.3, 0.6, 1]) expect(layerActive(melody, intensity)).toBe(true);
    }
    const drive = TRACKS["racer-christmas-drive"];
    expect(60 / (stepSeconds(drive, 0) * 4)).toBeCloseTo(112);
    expect(60 / (stepSeconds(drive, 1) * 4)).toBeCloseTo(162.4);
    expect(drive.layers.filter(l => layerActive(l, 1)).length).toBeGreaterThan(drive.layers.filter(l => layerActive(l, 0)).length);
    expect(musicTrackForFile("racer-christmas-drive.mp3")).toBe("racer-christmas-drive");
  });
});

describe("North Pole Land Grab Christmas music", () => {
  test("lobby, countdown, play, conquest and podium follow the selected theme", () => {
    for (const theme of ["christmas", "classic", undefined] as const) {
      const prefix = theme === "classic" ? "land" : "land-christmas";
      expect(musicFor({ kind: "classic", phase: "lobby", mode: "land", land: { theme } } as HostView)).toEqual({ track: `${prefix}-lobby` });
      expect(musicFor({ kind: "land", theme, phase: "countdown" } as HostView)).toEqual({ track: `${prefix}-play`, intensity: 0 });
      expect(musicFor({ kind: "land", theme, phase: "conquered" } as HostView)).toEqual({ track: `${prefix}-play`, intensity: 1 });
      expect(musicFor({ kind: "land", theme, phase: "podium" } as HostView)).toEqual({ track: `${prefix}-results` });
    }
  });

  test("a real growing ring speeds the same cue up; breaking it calms the music", () => {
    const size = 10;
    const [red, blue] = startTiles(2) as [number, number];
    const owners = Array<number>(size * size).fill(-1);
    owners[red] = 0; owners[blue] = 1;
    const starts = [{ team: 0, tile: red, out: false }, { team: 1, tile: blue, out: false }];
    const ring = owners.map((_, t) => t).filter(t => hexDistance(size, blue, t) === 2);
    const cue = () => musicFor({ kind: "land", theme: "christmas", phase: "playing", board: { size, owners, starts } } as HostView);
    expect(cue()).toEqual({ track: "land-christmas-play", intensity: 0 });
    for (const tile of ring.slice(0, 11)) owners[tile] = 0;
    expect(cue()).toEqual({ track: "land-christmas-play", intensity: 1 });
    owners[ring[0]!] = 1;
    expect(cue().intensity).toBeLessThan(1);
    for (const tile of ring) owners[tile] = -1;
    expect(cue()).toEqual({ track: "land-christmas-play", intensity: 0 });
    // No phase or threat key: the existing player glides instead of restarting.
    expect(cue().key).toBeUndefined();
  });

  test("Silent Night stays audible at all threats and builds from a calm 60 to an urgent 120 BPM", () => {
    const play = TRACKS["land-christmas-play"];
    for (const id of ["land-christmas-lobby", "land-christmas-play", "land-christmas-results"] as const) {
      const track = TRACKS[id];
      expect(track.stepsPerBar).toBe(12);
      expect(track.bars).toBe(24);
      const melody = track.layers[0]!;
      expect(melody.inst).toBe("piano");
      expect(melody.bars).toHaveLength(24);
      expect(tokens(melody.bars[0]!).filter(n => n !== "-")).toEqual(["G4", "A4", "G4"]);
      expect(tokens(melody.bars[1]!)[0]).toBe("E4");
      for (const intensity of [0, .25, .5, .8, 1]) expect(layerActive(melody, intensity)).toBe(true);
      for (const layer of track.layers) expect(["piano", "strings", "bell", "pluck", "flute", "timpani", "brass", "snare", "cymbal"]).toContain(layer.inst);
      expect(usesSamples(track)).toBe(true);
    }
    expect(60 / (stepSeconds(play, 0) * 4)).toBeCloseTo(60);
    expect(60 / (stepSeconds(play, 1) * 4)).toBeCloseTo(120);
    expect(play.layers.filter(l => layerActive(l, 1)).length).toBeGreaterThan(play.layers.filter(l => layerActive(l, 0)).length);
    for (const inst of ["brass", "snare", "cymbal"] as const) {
      const layer = play.layers.find(l => l.inst === inst)!;
      expect(layerActive(layer, 0.5)).toBe(false);
      expect(layerActive(layer, 1)).toBe(true);
    }
    expect(musicTrackForFile("land-christmas-play.mp3")).toBe("land-christmas-play");
  });
});
