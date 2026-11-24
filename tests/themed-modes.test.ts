import { describe, expect, test } from "bun:test";
import { HOST_MODES } from "../src/client/host/modes.tsx";
import { TRACKS } from "../src/client/shared/music/tracks.ts";
import { keysOf } from "../src/shared/keys-of.ts";
import { MUSIC_TRACKS } from "../src/shared/music-tracks.ts";
import type { ScreenOf, SeasonTheme, ThemedMode } from "../src/shared/themed-modes.ts";
import { modeTheme, THEMED_MODES, themedMusicTracks, themedTrack } from "../src/shared/themed-modes.ts";

const EXPECTED: Record<ThemedMode, Partial<Record<SeasonTheme, Record<string, string>>>> = {
  tower: {
    classic: { lobby: "tower-lobby", play: "tower-play", results: "tower-results" },
    christmas: { lobby: "tower-christmas-lobby", play: "tower-christmas-medley", results: "tower-christmas-results" },
  },
  fight: {
    classic: { lobby: "fight-lobby", play: "fight-play", results: "fight-results" },
    christmas: { lobby: "fight-lobby", play: "fight-play", results: "fight-results" },
  },
  land: {
    classic: { lobby: "land-lobby", play: "land-play", results: "land-results" },
    christmas: { lobby: "land-christmas-lobby", play: "land-christmas-play", results: "land-christmas-results" },
  },
  racer: {
    classic: { lobby: "racer-lobby", play: "racer-drive", results: "racer-results" },
    christmas: { lobby: "racer-christmas-lobby", play: "racer-christmas-drive", results: "racer-christmas-results" },
  },
  cup: {
    classic: { lobby: "cup-lobby", quiz: "cup-quiz", drink: "cup-drink", results: "cup-results" },
    christmas: { lobby: "tower-christmas-lobby", quiz: "tower-christmas-play", drink: "tower-christmas-play", results: "tower-christmas-results" },
  },
  siege: {
    classic: { lobby: "siege-lobby", play: "siege-battle", results: "siege-results" },
    christmas: { lobby: "siege-christmas-lobby", play: "siege-christmas-battle", results: "siege-christmas-results" },
  },
  duel: {
    classic: { lobby: "showdown-lobby", play: "showdown", results: "showdown-results" },
    christmas: { lobby: "tower-christmas-lobby", play: "tower-christmas-play", results: "tower-christmas-results" },
  },
  gift: {
    christmas: { lobby: "tower-christmas-lobby", play: "tower-christmas-play", results: "tower-christmas-results" },
  },
};

/** A view of one phase, with only the fields the mode's cue reads on its way to that screen's track. */
function viewFor(mode: ThemedMode, theme: SeasonTheme, screen: string) {
  const results = screen === "results";
  const phase: Record<ThemedMode, string> = {
    tower: "countdown",
    fight: "playing",
    land: "conquered",
    racer: "question",
    cup: screen === "drink" ? "drink" : "roll",
    siege: "countdown",
    duel: "intro",
    gift: "playing",
  };
  return {
    kind: mode,
    theme,
    settings: { theme },
    phase: results ? "podium" : phase[mode],
    result: { outcome: "stands" },
    round: 1,
    teams: [],
    car: { speed: 0, crashed: false },
    phaseRemainingMs: 0,
    phaseDurationMs: 1,
    remainingMs: 0,
  };
}

const cells = Object.entries(EXPECTED).flatMap(([mode, looks]) =>
  Object.entries(looks).flatMap(([theme, screens]) =>
    Object.entries(screens!).map(([screen, track]) => ({ mode: mode as ThemedMode, theme: theme as SeasonTheme, screen, track })),
  ),
);

describe("themed modes", () => {
  test("the table lists the same modes, themes and screens as the expected tracks", () => {
    for (const [mode, entry] of Object.entries(THEMED_MODES)) {
      const expected = EXPECTED[mode as ThemedMode];
      expect(Object.keys(entry.looks).sort()).toEqual(Object.keys(expected).sort());
      for (const screens of Object.values(expected)) expect(Object.keys(screens!).sort()).toEqual(Object.keys(entry.screens).sort());
    }
    expect(Object.keys(THEMED_MODES).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  test.each(cells)("$mode in $theme plays $track on $screen", ({ mode, theme, screen, track }) => {
    expect<string>(themedTrack<ThemedMode>(mode, theme, screen as ScreenOf<ThemedMode>)).toBe(track);
    // checked: viewFor builds each mode's view with the fields its cue reads; HOST_MODES is indexed by a union, so no one cue type fits every mode
    const host = HOST_MODES[mode] as unknown as { lobbyTrack(s: object): string; cue(v: object): { track: string } };
    if (screen === "lobby") expect(host.lobbyTrack({ theme })).toBe(track);
    else expect(host.cue(viewFor(mode, theme, screen)).track).toBe(track);
  });

  test("a missing or unoffered theme means the mode's default", () => {
    for (const mode of keysOf(THEMED_MODES)) expect<string>(modeTheme(mode)).toBe("christmas");
    expect(modeTheme("gift", "classic")).toBe("christmas");
  });

  test("every themed track has one admin music row and a built-in track", () => {
    const ids = new Set(cells.map((c) => c.track));
    const rows = MUSIC_TRACKS.filter((t) => ids.has(t.id));
    expect(rows.map((t): string => t.id).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(TRACKS[id as keyof typeof TRACKS]).toBeDefined();
    const shared = themedMusicTracks().find((t) => t.id === "tower-christmas-lobby")!;
    expect(shared.mode).toBe("North Pole Tower, Cup of Cheer, North Pole Snowball Showdown, Gift Grab");
  });
});
