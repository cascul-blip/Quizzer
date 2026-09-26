import { describe, expect, test } from "bun:test";
import { Game } from "../src/server/game/game.ts";
import { buildSubResultsCsv } from "../src/server/game/results.ts";
import {
  BOOST_MIN_HOLD_MS,
  BOOST_POWER,
  BOOSTS_BASE,
  CAUGHT_MS,
  COUNTDOWN_MS,
  DIVE_METERS_PER_HIT,
  DIVE_SYMBOLS,
  DIVE_SYMBOL_TIMEOUT_MS,
  DIVE_WRONG_LOCK_MS,
  ESCAPED_MS,
  GAP_MAX,
  GAP_START,
  LEVEL_METERS,
  SubGame,
  speedFor,
  type SubPlayer,
} from "../src/server/game/submarine.ts";
import { FEEDBACK_MS } from "../src/server/game/stream.ts";
import { parseSymbol } from "../src/shared/sea-symbols.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

function setup(names: string[], rng?: () => number) {
  const clock = new FakeClock();
  let finished = 0;
  const lobby = new Game(sampleQuiz(), { clock });
  lobby.setMode("submarine");
  for (const n of names) lobby.join(n);
  const game = SubGame.fromLobby(lobby, { clock, rng, onFinish: () => finished++ });
  game.start();
  clock.advance(COUNTDOWN_MS);
  return { clock, game, finished: () => finished };
}

const byName = (game: SubGame, name: string) => [...game.players.values()].find((p) => p.nickname === name)!;

function answerRight(game: SubGame, clock: FakeClock, p: SubPlayer) {
  const cur = p.current!;
  expect(game.answer(p.id, cur.seq, cur.correct[0]!)).toBe(true);
  clock.advance(FEEDBACK_MS);
}

/** Earn a boost (4 correct answers), hold it, and fire it. */
function boostOnce(game: SubGame, clock: FakeClock, p: SubPlayer) {
  for (let i = 0; i < 4; i++) answerRight(game, clock, p);
  expect(p.state).toBe("boost");
  clock.advance(BOOST_MIN_HOLD_MS);
  expect(game.boost(p.id)).toBe(true);
}

describe("chase", () => {
  test("4 correct answers earn a boost; boosting pushes the sub away from the fish", () => {
    const { game, clock } = setup(["A", "B"]);
    expect(game.phase).toBe("chase");
    expect(game.required).toBe(BOOSTS_BASE + 2);
    const a = byName(game, "A");
    for (let i = 0; i < 3; i++) answerRight(game, clock, a);
    expect(a.state).toBe("question");
    expect(game.playerView(a.id)!.towardBoost).toBe(3);
    answerRight(game, clock, a);
    expect(a.state).toBe("boost");
    expect(game.playerView(a.id)!.question).toBeNull();
    // Too soon: the phone needs a couple of seconds of holding.
    expect(game.boost(a.id)).toBe(false);
    clock.advance(BOOST_MIN_HOLD_MS);
    const before = game.gap();
    expect(game.boost(a.id)).toBe(true);
    expect(game.gap()).toBeCloseTo(Math.min(GAP_MAX, before + BOOST_POWER / 2));
    expect(game.boosts).toBe(1);
    expect(a.state).toBe("question");
    expect(game.lastBoost).toMatchObject({ nickname: "A" });
    expect(game.boost(a.id)).toBe(false); // no boost left
  });

  test("more players need more boosts, each worth less", () => {
    const small = setup(["A"]);
    const big = setup(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(small.game.required).toBe(BOOSTS_BASE + 1);
    expect(big.game.required).toBe(BOOSTS_BASE + 8);
  });

  test("the fish closes in over time and catching the sub ends the game", () => {
    const { game, clock, finished } = setup(["A", "B"]);
    expect(game.gap()).toBe(GAP_START);
    clock.advance(10_000);
    expect(game.gap()).toBeCloseTo(GAP_START - 10);
    clock.advance((GAP_START - 10) * 1000 - 1);
    expect(game.phase).toBe("chase");
    clock.advance(1);
    expect(game.phase).toBe("caught");
    clock.advance(CAUGHT_MS);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
  });

  test("a boost postpones the catch", () => {
    const { game, clock } = setup(["A"]);
    const a = byName(game, "A");
    clock.advance(20_000); // gap 10
    boostOnce(game, clock, a); // spends 4 s answering + 1.5 s holding
    expect(game.phase).toBe("chase");
    const gap = game.gap();
    clock.advance(gap * 1000 - 1);
    expect(game.phase).toBe("chase");
    clock.advance(1);
    expect(game.phase).toBe("caught");
  });

  test("enough boosts clear the level; deeper levels have a faster fish", () => {
    const { game, clock } = setup(["A"]);
    const a = byName(game, "A");
    for (let i = 0; i < game.required; i++) boostOnce(game, clock, a);
    expect(game.phase).toBe("escaped");
    expect(game.depth).toBe(LEVEL_METERS);
    clock.advance(ESCAPED_MS);
    expect(game.phase).toBe("dive");
    expect(speedFor(1)).toBe(1);
    expect(speedFor(3)).toBe(1.5);
  });
});

/** Get a game straight into diving mode. */
function toDive(names: string[], rng?: () => number) {
  const s = setup(names, rng);
  const p = [...s.game.players.values()][0]!;
  s.game.boosts = s.game.required - 1; // the rest of the squad has been boosting
  boostOnce(s.game, s.clock, p);
  s.clock.advance(ESCAPED_MS);
  expect(s.game.phase).toBe("dive");
  return s;
}

describe("dive", () => {
  test("instructors: 1 per 6 players, at most 4, always leaving divers", () => {
    const count = (n: number) => toDive(Array.from({ length: n }, (_, i) => `P${i}`)).game.instructors.length;
    expect(count(2)).toBe(1);
    expect(count(6)).toBe(1);
    expect(count(7)).toBe(2);
    expect(count(13)).toBe(3);
    expect(count(30)).toBe(4);
    const { game } = toDive(Array.from({ length: 13 }, (_, i) => `P${i}`));
    // Everyone else is in exactly one group.
    const grouped = game.instructors.flatMap((i) => i.group);
    expect(new Set(grouped).size).toBe(13 - game.instructors.length);
    for (const i of game.instructors) expect(grouped).not.toContain(i.playerId);
  });

  test("grids hold the target plus look-alikes; instructors see the symbol", () => {
    const { game } = toDive(["A", "B", "C"]);
    const ins = game.instructors[0]!;
    const target = ins.symbols[0]!;
    const t = parseSymbol(target)!;
    const leadView = game.playerView(ins.playerId)!.dive;
    expect(leadView).toMatchObject({ role: "instructor", symbol: target, index: 0, total: DIVE_SYMBOLS });
    for (const id of ins.group) {
      const v = game.playerView(id)!.dive!;
      expect(v.role).toBe("diver");
      if (v.role !== "diver") continue;
      expect(v.grid).toHaveLength(6);
      expect(v.grid).toContain(target);
      expect(new Set(v.grid).size).toBe(6);
      const lookAlikes = v.grid.filter((s) => s !== target).map((s) => parseSymbol(s)!).filter((s) => s.shape === t.shape || s.color === t.color);
      expect(lookAlikes.length).toBeGreaterThanOrEqual(4);
    }
  });

  test("correct taps add depth and advance at 70%; wrong taps lock out", () => {
    const { game, clock } = toDive(["A", "B", "C", "D"]);
    const ins = game.instructors[0]!;
    expect(ins.group).toHaveLength(3);
    const depth0 = game.depth;
    const [d1, d2] = ins.group;
    const target = ins.symbols[0]!;
    const wrong = game.players.get(d1!)!.grid.find((s) => s !== target)!;
    expect(game.tap(d1!, wrong)).toBe(false);
    expect(game.tap(d1!, target)).toBeNull(); // locked
    clock.advance(DIVE_WRONG_LOCK_MS);
    expect(game.tap(d1!, target)).toBe(true);
    expect(game.depth).toBe(depth0 + DIVE_METERS_PER_HIT);
    expect(game.tap(d1!, target)).toBeNull(); // already found
    expect(ins.index).toBe(0);
    expect(game.tap(d2!, target)).toBe(true); // 2 of 3 found; 70% of 3 rounds up to 3 → not yet
    expect(ins.index).toBe(0);
    expect(game.tap(ins.group[2]!, target)).toBe(true);
    expect(ins.index).toBe(1);
  });

  test("an instructor moves on after 20 s; the dive ends after 5 symbols, then the next level", () => {
    const { game, clock } = toDive(["A", "B"]);
    for (let i = 0; i < DIVE_SYMBOLS - 1; i++) {
      clock.advance(DIVE_SYMBOL_TIMEOUT_MS);
      expect(game.phase).toBe("dive");
    }
    clock.advance(DIVE_SYMBOL_TIMEOUT_MS);
    expect(game.phase).toBe("chase");
    expect(game.level).toBe(2);
    expect(game.speed).toBe(speedFor(2));
    expect(game.gap()).toBe(GAP_START);
  });

  test("playing solo: you're your own instructor and see the target", () => {
    const { game } = toDive(["Solo"]);
    const me = byName(game, "Solo");
    const v = game.playerView(me.id)!.dive!;
    expect(v.role).toBe("diver");
    if (v.role === "diver") {
      expect(v.hint).toBe(game.instructors[0]!.symbols[0]!);
      expect(game.tap(me.id, v.hint!)).toBe(true);
    }
    expect(game.instructors[0]!.index).toBe(1);
  });

  test("players joining mid-dive wait for the next level", () => {
    const { game, clock } = toDive(["A", "B"]);
    const late = game.join("Late");
    expect(game.playerView(late.id)!.dive).toEqual({ role: "waiting" });
    clock.advance(DIVE_SYMBOL_TIMEOUT_MS * DIVE_SYMBOLS);
    expect(game.phase).toBe("chase");
    expect(game.playerView(late.id)!.question).not.toBeNull();
  });
});

test("awards and results CSV", () => {
  const { game, clock } = setup(["Ann", "Bob"]);
  boostOnce(game, clock, byName(game, "Ann"));
  answerRight(game, clock, byName(game, "Bob"));
  game.end();
  expect(game.phase).toBe("podium");
  expect(game.awards()).toMatchObject({ topBooster: { value: 1, nicknames: ["Ann"] }, mostCorrect: { value: 4, nicknames: ["Ann"] }, sharpestEyes: null });
  expect(game.playerView(byName(game, "Ann").id)!.result).toEqual({ depth: 0, level: 1, awards: ["Top booster", "Most correct answers"] });
  const lines = buildSubResultsCsv(game).replace(/^﻿/, "").trim().split("\r\n");
  expect(lines[0]).toBe("Nickname,Correct,Wrong,Boosts,Dive taps (correct),Instructor rounds,Squad depth (m),Level reached");
  expect(lines[1]).toBe("Ann,4,0,1,0,0,0,1");
});
