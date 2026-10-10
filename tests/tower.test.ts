import { describe, expect, test } from "bun:test";
import { Game } from "../src/server/game/game.ts";
import { buildTowerResultsCsv } from "../src/server/game/results.ts";
import { WRONG_PENALTY_2_MS, WRONG_PENALTY_3_MS } from "../src/server/game/stream.ts";
import {
  COUNTDOWN_MS,
  MONSTER_AT,
  DROP_COOLDOWN_MS,
  FEEDBACK_MS,
  SWEEP_MIN_MS,
  SWEEP_START_MS,
  SWEEP_STEP_MS,
  TowerGame,
  sweepMsFor,
  type TowerPlayer,
} from "../src/server/game/tower.ts";
import type { Quiz } from "../src/shared/quiz-schema.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

/** 6 questions whose correct answer is always "yes" (index 0 unless shuffled). */
function quiz(): Quiz {
  return sampleQuiz({
    questions: Array.from({ length: 6 }, (_, i) => ({
      id: `q${i}`,
      type: "multiple_choice" as const,
      text: `Question ${i}`,
      timeLimitSec: 20,
      options: ["yes", "no", "maybe", "never"],
      correct: [0],
    })),
  });
}

function setup(names: string[], opts: { teams?: number; minutes?: number; shuffleAnswers?: boolean; monster?: boolean; protect?: boolean; rng?: () => number } = {}) {
  const clock = new FakeClock();
  let finished = 0;
  const lobby = new Game(quiz(), { clock });
  lobby.setMode("tower");
  lobby.setTower({ teams: opts.teams ?? 2, minutes: opts.minutes ?? 5, monster: opts.monster ?? false });
  if (opts.shuffleAnswers) lobby.setShuffle({ questions: false, answers: true });
  if (opts.protect !== undefined) lobby.setProtect(opts.protect);
  for (const n of names) lobby.join(n);
  const game = TowerGame.fromLobby(lobby, { clock, rng: opts.rng, onFinish: () => finished++ });
  return { clock, game, lobby, finished: () => finished };
}

function play(names: string[], opts?: Parameters<typeof setup>[1]) {
  const s = setup(names, opts);
  s.game.start();
  s.clock.advance(COUNTDOWN_MS);
  expect(s.game.phase).toBe("playing");
  return s;
}

const byName = (game: TowerGame, name: string) => [...game.players.values()].find((p) => p.nickname === name)!;

/** Answer the player's current question (right or wrong) and let the feedback flash pass. */
function answer(game: TowerGame, clock: FakeClock, p: TowerPlayer, right: boolean) {
  const cur = p.current!;
  const option = right ? cur.correct[0]! : cur.options.findIndex((_, i) => !cur.correct.includes(i));
  expect(game.answer(p.id, cur.seq, option)).toBe(true);
  clock.advance(p.readyAt - clock.now());
}

describe("lobby → tower", () => {
  test("lobby previews teams round-robin by join order and players keep their identity", () => {
    const { lobby, game } = setup(["A", "B", "C", "D", "E"], { teams: 3 });
    const preview = lobby.hostView().teams!;
    expect(preview.map((t) => [t.name, t.members.map((m) => m.nickname)])).toEqual([
      ["Red", ["A", "D"]],
      ["Blue", ["B", "E"]],
      ["Yellow", ["C"]],
    ]);
    const a = lobby.players.get([...lobby.players.keys()][0]!)!;
    const pv = lobby.playerView(a.id);
    expect(pv.kind === "player" && pv.team?.name).toBe("Red");
    // Same ids and tokens after the handover.
    expect(game.byToken(a.token)?.id).toBe(a.id);
    expect([...game.players.values()].map((p) => [p.nickname, p.team])).toEqual([
      ["A", 0],
      ["B", 1],
      ["C", 2],
      ["D", 0],
      ["E", 1],
    ]);
  });

  test("changing the team count re-previews; settings are validated", () => {
    const { lobby } = setup(["A", "B", "C"], { teams: 2 });
    lobby.setTower({ teams: 1, minutes: 3 });
    expect(lobby.hostView().teams!.map((t) => t.members.length)).toEqual([3]);
    expect(() => lobby.setTower({ teams: 7, minutes: 3 })).toThrow();
    expect(() => lobby.setTower({ teams: 0, minutes: 3 })).toThrow();
    expect(() => lobby.setTower({ teams: 2, minutes: 4 })).toThrow();
    expect(lobby.hostView().teams).toHaveLength(1);
    lobby.setMode("classic");
    expect(lobby.hostView().teams).toBeNull();
  });

  test("late joiners go to the smallest team", () => {
    const { game, clock } = play(["A", "B", "C"], { teams: 3 });
    game.kick(byName(game, "B").id);
    expect(game.join("Late").team).toBe(1);
    expect(game.join("Later").team).toBe(0);
    // Joining mid-game deals a question straight away.
    expect(byName(game, "Late").current).not.toBeNull();
    clock.advance(1);
  });
});

describe("questions", () => {
  test("nothing can be answered during the countdown", () => {
    const { game, clock } = setup(["A"]);
    game.start();
    const a = byName(game, "A");
    expect(game.playerView(a.id)!.question).toBeNull();
    clock.advance(COUNTDOWN_MS);
    expect(game.playerView(a.id)!.question).not.toBeNull();
  });

  test("each player answers at their own pace", () => {
    const { game, clock } = play(["Fast", "Idle"]);
    const fast = byName(game, "Fast");
    const idle = byName(game, "Idle");
    const idleSeq = idle.current!.seq;
    for (let i = 0; i < 3; i++) answer(game, clock, fast, true);
    expect(fast.correct).toBe(3);
    expect(fast.seq).toBe(4);
    expect(idle.current!.seq).toBe(idleSeq);
    expect(idle.correct + idle.wrong).toBe(0);
  });

  test("a correct answer earns a block, a wrong one doesn't; both show a 1 s flash", () => {
    const { game, clock } = play(["A"]);
    const a = byName(game, "A");
    const seq = a.current!.seq;
    expect(game.answer(a.id, seq, a.current!.correct[0]!)).toBe(true);
    expect(a.blocksHeld).toBe(1);
    const v = game.playerView(a.id)!;
    expect(v.feedback).toEqual({ seq, correct: true, remainingMs: FEEDBACK_MS, answers: [], penaltyMs: 0 });
    expect(v.question!.seq).toBe(seq + 1); // next question is already waiting underneath
    // Too soon: still in the feedback window.
    expect(game.answer(a.id, a.current!.seq, 0)).toBe(false);
    clock.advance(FEEDBACK_MS);
    expect(game.playerView(a.id)!.feedback).toBeNull();
    answer(game, clock, a, false);
    expect(a.blocksHeld).toBe(1);
    expect(a.wrong).toBe(1);
  });

  test("a wrong answer's feedback names the correct answer (even when positions are shuffled)", () => {
    const { game } = play(["A"], { shuffleAnswers: true });
    const a = byName(game, "A");
    const cur = a.current!;
    const wrong = cur.options.findIndex((o) => o !== "yes");
    game.answer(a.id, cur.seq, wrong);
    expect(game.playerView(a.id)!.feedback).toMatchObject({ correct: false, answers: ["yes"] });
  });

  test("wrong answers in a row hold the flash longer, until a correct answer", () => {
    const { game, clock } = play(["A"], { teams: 1 });
    const a = byName(game, "A");
    const wrong = () => {
      const cur = a.current!;
      expect(game.answer(a.id, cur.seq, cur.options.findIndex((_, i) => !cur.correct.includes(i)))).toBe(true);
      return game.playerView(a.id)!.feedback!;
    };
    expect(wrong()).toMatchObject({ remainingMs: FEEDBACK_MS, penaltyMs: 0 });
    clock.advance(FEEDBACK_MS);
    expect(wrong()).toMatchObject({ remainingMs: FEEDBACK_MS + WRONG_PENALTY_2_MS, penaltyMs: WRONG_PENALTY_2_MS });
    clock.advance(FEEDBACK_MS + WRONG_PENALTY_2_MS - 1);
    // Still waiting: the answer is ignored and the flash is still up.
    expect(game.answer(a.id, a.current!.seq, a.current!.correct[0]!)).toBe(false);
    expect(game.playerView(a.id)!.feedback).toMatchObject({ remainingMs: 1 });
    clock.advance(1);
    expect(game.playerView(a.id)!.feedback).toBeNull();
    for (let i = 0; i < 2; i++) {
      expect(wrong()).toMatchObject({ remainingMs: FEEDBACK_MS + WRONG_PENALTY_3_MS, penaltyMs: WRONG_PENALTY_3_MS });
      clock.advance(FEEDBACK_MS + WRONG_PENALTY_3_MS);
    }
    answer(game, clock, a, true);
    expect(a.wrongStreak).toBe(0);
    expect(wrong()).toMatchObject({ remainingMs: FEEDBACK_MS, penaltyMs: 0 });
  });

  test("with Protect from abuse off, every wrong answer is a 1 s flash", () => {
    const { game, clock } = play(["A"], { teams: 1, protect: false });
    const a = byName(game, "A");
    for (let i = 0; i < 4; i++) {
      const cur = a.current!;
      expect(game.answer(a.id, cur.seq, cur.options.findIndex((_, i) => !cur.correct.includes(i)))).toBe(true);
      expect(game.playerView(a.id)!.feedback).toMatchObject({ remainingMs: FEEDBACK_MS, penaltyMs: 0 });
      clock.advance(FEEDBACK_MS);
    }
  });

  test("stale or invalid answers are rejected", () => {
    const { game, clock } = play(["A"]);
    const a = byName(game, "A");
    const seq = a.current!.seq;
    expect(game.answer(a.id, seq - 1, 0)).toBe(false);
    expect(game.answer(a.id, seq, 9)).toBe(false);
    expect(game.answer(a.id, seq, -1)).toBe(false);
    expect(game.answer("ghost", seq, 0)).toBe(false);
    answer(game, clock, a, true);
    expect(game.answer(a.id, seq, 0)).toBe(false); // already answered
  });

  test("questions come from a personal deck that is reshuffled without an immediate repeat", () => {
    const { game, clock } = play(["A"], { teams: 1 });
    const a = byName(game, "A");
    const seen: number[] = [];
    for (let i = 0; i < 18; i++) {
      seen.push(a.current!.qIndex);
      answer(game, clock, a, false);
    }
    // Every block of 6 is a full permutation of the 6 questions.
    for (let i = 0; i < 18; i += 6) expect([...seen.slice(i, i + 6)].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  test("answer positions can be shuffled per player and stay scoreable", () => {
    const { game, clock } = play(["A", "B"], { shuffleAnswers: true });
    const a = byName(game, "A");
    const positions = new Set<number>();
    for (let i = 0; i < 12; i++) {
      const cur = a.current!;
      expect(cur.options[cur.correct[0]!]).toBe("yes");
      positions.add(cur.correct[0]!);
      answer(game, clock, a, i % 2 === 0);
      if (a.state === "build") break;
    }
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe("building", () => {
  function toBuild(game: TowerGame, clock: FakeClock, p: TowerPlayer) {
    for (let i = 0; i < 4; i++) answer(game, clock, p, true);
    expect(p.state).toBe("build");
    expect(p.blocksHeld).toBe(4);
  }

  test("the 4th correct answer switches to build mode; no questions while building", () => {
    const { game, clock } = play(["A"]);
    const a = byName(game, "A");
    for (let i = 0; i < 3; i++) answer(game, clock, a, true);
    expect(a.state).toBe("question");
    const cur = a.current!;
    game.answer(a.id, cur.seq, cur.correct[0]!);
    expect(a.state).toBe("build");
    // During the 1 s flash, drops are ignored.
    expect(game.drop(a.id, 2)).toBeNull();
    clock.advance(FEEDBACK_MS);
    const v = game.playerView(a.id)!;
    expect(v.question).toBeNull();
    expect(v.build).toEqual({ columns: [0, 0, 0], floors: 0, sweepMs: SWEEP_START_MS });
    expect(game.answer(a.id, a.current!.seq, a.current!.correct[0]!)).toBe(false);
  });

  test("zones 1–3 land in the left/center/right columns, 0 and 4 miss; floors = full rows", () => {
    const { game, clock } = play(["A", "B"], { teams: 1 });
    const a = byName(game, "A");
    toBuild(game, clock, a);
    const drops = [1, 2, 0, 3];
    const landed = drops.map((z) => {
      const r = game.drop(a.id, z);
      clock.advance(DROP_COOLDOWN_MS);
      return r;
    });
    expect(landed).toEqual([true, true, false, true]);
    expect(game.teams[0]!.columns).toEqual([1, 1, 1]);
    expect(a).toMatchObject({ placed: 3, missed: 1, blocksHeld: 0, state: "question" });
    expect(game.hostView().teams[0]).toMatchObject({ floors: 1, placed: 3 });

    // Teammate B stacks the left column: height, but no new floor.
    const b = byName(game, "B");
    toBuild(game, clock, b);
    for (const z of [1, 1, 1, 4]) {
      game.drop(b.id, z);
      clock.advance(DROP_COOLDOWN_MS);
    }
    expect(game.teams[0]!.columns).toEqual([4, 1, 1]);
    expect(game.hostView().teams[0]).toMatchObject({ floors: 1, placed: 6 });
  });

  test("drops are rate-limited and validated", () => {
    const { game, clock } = play(["A"]);
    const a = byName(game, "A");
    expect(game.drop(a.id, 2)).toBeNull(); // not building
    toBuild(game, clock, a);
    expect(game.drop(a.id, 5)).toBeNull();
    expect(game.drop(a.id, 1.5)).toBeNull();
    expect(game.drop(a.id, 2)).toBe(true);
    expect(game.drop(a.id, 2)).toBeNull(); // cooldown
    clock.advance(DROP_COOLDOWN_MS);
    expect(game.drop(a.id, 2)).toBe(true);
  });

  test("the block sweeps faster as the tower gets taller", () => {
    expect(sweepMsFor(0)).toBe(SWEEP_START_MS);
    expect(sweepMsFor(3)).toBe(SWEEP_START_MS - 3 * SWEEP_STEP_MS);
    expect(sweepMsFor(100)).toBe(SWEEP_MIN_MS);
  });
});

describe("end of game", () => {
  test("the timer ends the game; teams rank by floors then blocks; awards", () => {
    const { game, clock, finished } = play(["A", "B", "C"], { teams: 3, minutes: 2 });
    game.teams[0]!.columns = [2, 2, 2]; // 2 floors, 6 blocks
    game.teams[1]!.columns = [3, 2, 4]; // 2 floors, 9 blocks
    game.teams[2]!.columns = [5, 0, 5]; // 0 floors
    byName(game, "A").correct = 7;
    byName(game, "B").correct = 7;
    byName(game, "C").placed = 3;
    clock.advance(2 * 60_000 - 1);
    expect(game.phase).toBe("playing");
    expect(game.hostView().remainingMs).toBe(1);
    clock.advance(1);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    expect(game.rankedTeams().map((t) => [t.name, t.rank])).toEqual([
      ["Blue", 1],
      ["Red", 2],
      ["Yellow", 3],
    ]);
    expect(game.hostView().awards).toEqual({
      mostCorrect: { value: 7, nicknames: ["A", "B"] },
      masterBuilder: { value: 3, nicknames: ["C"] },
    });
    const b = game.playerView(byName(game, "B").id)!;
    expect(b.result).toEqual({ teamRank: 1, teamCount: 3, floors: 2, placed: 9, awards: ["Most correct answers"] });
    expect(() => game.join("Late")).toThrow(/finished/);
  });

  test("identical towers share a rank; end() stops early", () => {
    const { game, finished } = play(["A", "B"], { teams: 2 });
    game.end();
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    expect(game.rankedTeams().map((t) => t.rank)).toEqual([1, 1]);
    expect(game.awards()).toEqual({ mostCorrect: null, masterBuilder: null });
  });

  test("results CSV", () => {
    const { game, clock } = play(["Ann", "=Bob"], { teams: 1 });
    const ann = byName(game, "Ann");
    answer(game, clock, ann, true);
    answer(game, clock, ann, false);
    game.end();
    const lines = buildTowerResultsCsv(game).replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Team,Team rank,Team floors,Team blocks,Nickname,Correct,Wrong,Accuracy %,Blocks placed,Blocks missed,Monster hatched");
    expect(lines[1]).toBe("Red,1,0,0,Ann,1,1,50,0,0,0");
    expect(lines[2]).toBe("Red,1,0,0,'=Bob,0,0,,0,0,0");
  });
});

test("kick and reconnect keep the remaining players' state", () => {
  const { game, clock } = play(["A", "B"]);
  const a = byName(game, "A");
  answer(game, clock, a, true);
  game.setConnected(a.id, false);
  game.setConnected(a.id, true);
  expect(game.byToken(a.token)!.blocksHeld).toBe(1);
  const b = byName(game, "B");
  game.kick(b.id);
  expect(game.byToken(b.token)).toBeNull();
  expect(game.playerView(b.id)).toBeNull();
});

describe("monster", () => {
  /** Fill a team's columns directly, then land blocks through the real drop() path. */
  function dropInto(game: TowerGame, clock: FakeClock, p: TowerPlayer, zones: number[]) {
    for (const z of zones) {
      p.state = "build";
      p.blocksHeld = Math.max(p.blocksHeld, 1);
      expect(game.drop(p.id, z)).not.toBeNull();
      clock.advance(DROP_COOLDOWN_MS);
    }
  }

  const egg = (game: TowerGame, team: number) => game.egg?.cells[team] ?? null;

  test("eggs are announced 4 times per game, evenly spaced; none without the setting or with one team", () => {
    const { game, clock } = play(["A", "B"], { minutes: 3, monster: true, rng: () => 0 });
    expect(game.hostView().nextMonsterMs).toBe(36_000);
    clock.advance(36_000 - 1);
    expect(game.egg).toBeNull();
    clock.advance(1);
    // Empty towers: level 4 (row 3) on each.
    expect(game.egg!.cells).toEqual([
      { col: 0, row: 3 },
      { col: 0, row: 3 },
    ]);
    expect(game.hostView().nextMonsterMs).toBe(36_000);
    // Unhatched eggs stay put; the later announcements don't add more.
    const first = game.egg!.seq;
    clock.advance(36_000);
    expect(game.egg!.seq).toBe(first);
    expect(game.hostView().nextMonsterMs).toBe(36_000);
    clock.advance(36_000);
    expect(game.hostView().nextMonsterMs).toBe(36_000);
    clock.advance(36_000);
    expect(game.egg!.seq).toBe(first);
    expect(game.hostView().nextMonsterMs).toBeNull();
    // Everyone hears about it and sees their own egg.
    for (const p of game.players.values()) {
      expect(game.playerView(p.id)!.monsterEvent).toMatchObject({ kind: "egg" });
      expect(game.playerView(p.id)!.egg).toEqual({ seq: first, col: 0, row: 3 });
    }

    const off = play(["A", "B"], { minutes: 3, monster: false });
    off.clock.advance(3 * 60_000);
    expect(off.game.egg).toBeNull();
    const solo = play(["A"], { teams: 1, minutes: 3, monster: true });
    expect(solo.game.hostView().monster).toBe(false);
    solo.clock.advance(2 * 60_000);
    expect(solo.game.egg).toBeNull();
    expect(MONSTER_AT).toEqual([1 / 5, 2 / 5, 3 / 5, 4 / 5]);
  });

  test("each tower's egg is 4 levels above its highest full floor, never on a placed block", () => {
    const { game, clock } = play(["A", "B", "C"], { teams: 3, minutes: 3, monster: true, rng: () => 0 });
    game.teams[0]!.columns = [10, 10, 10]; // 10 floors → level 14
    game.teams[1]!.columns = [8, 9, 8]; // 8 floors → level 12
    game.teams[2]!.columns = [20, 5, 13]; // 5 floors → level 9 (row 8); left and right are already stacked past it
    clock.advance(60_000);
    expect(egg(game, 0)).toEqual({ col: 0, row: 13 });
    expect(egg(game, 1)).toEqual({ col: 0, row: 11 });
    expect(egg(game, 2)).toEqual({ col: 1, row: 8 });
    // With any random draw, the chosen cell is always empty.
    for (const r of [0, 0.34, 0.67, 0.99]) {
      const g = play(["A", "B"], { minutes: 3, monster: true, rng: () => r });
      g.game.teams[0]!.columns = [9, 3, 12];
      g.game.teams[1]!.columns = [2, 2, 2];
      g.clock.advance(60_000);
      const cell = egg(g.game, 0)!;
      expect(cell.row).toBe(6);
      expect(g.game.teams[0]!.columns[cell.col]).toBeLessThanOrEqual(cell.row);
    }
  });

  test("first block on its own egg hatches it; the tallest OTHER tower loses 2 floors", () => {
    const { game, clock } = play(["Red1", "Blue1", "Yellow1"], { teams: 3, minutes: 3, monster: true, rng: () => 0.5 });
    const [red, blue, yellow] = game.teams;
    red!.columns = [1, 1, 1];
    blue!.columns = [4, 4, 5]; // leader: 4 floors
    yellow!.columns = [3, 3, 3];
    clock.advance(60_000);
    expect(egg(game, 0)).toEqual({ col: 1, row: 4 }); // red: 1 floor → level 5

    const r = byName(game, "Red1");
    red!.columns = [1, 4, 1];
    dropInto(game, clock, r, [3, 2]); // right column (no), then center fills row 4 → hatch!
    expect(game.egg).toBeNull();
    expect(r.hatched).toBe(1);
    expect(game.lastAttack).toMatchObject({ byTeam: 0, byNickname: "Red1", target: 1, before: [4, 4, 5], after: [2, 2, 2] });
    expect(blue!.columns).toEqual([2, 2, 2]);
    expect(red!.columns).toEqual([1, 5, 2]);
    expect(game.playerView(r.id)!.monsterEvent).toMatchObject({ kind: "hatched", byTeam: "Red", target: "Blue" });
    expect(game.playerView(byName(game, "Blue1").id)!.monsterEvent).toMatchObject({ kind: "smashed" });
    expect(game.playerView(byName(game, "Yellow1").id)!.monsterEvent).toBeNull();
  });

  test("a block on another team's egg position does nothing; ties go to the lower team; small towers drop to 0", () => {
    const { game, clock } = play(["A", "B", "C"], { teams: 3, minutes: 3, monster: true, rng: () => 0 });
    game.teams[0]!.columns = [5, 5, 5];
    game.teams[1]!.columns = [1, 1, 1];
    game.teams[2]!.columns = [1, 1, 1];
    clock.advance(60_000);
    // B lands on row 8 of column 0 — that's A's egg position, not B's (B's is row 4).
    game.teams[1]!.columns = [8, 1, 1];
    dropInto(game, clock, byName(game, "B"), [1]);
    expect(game.egg).not.toBeNull();
    game.teams[0]!.columns = [8, 5, 5];
    dropInto(game, clock, byName(game, "A"), [1]);
    expect(game.lastAttack).toMatchObject({ byTeam: 0, target: 1, after: [0, 0, 0] });
    expect(game.teams[2]!.columns).toEqual([1, 1, 1]);
  });

  test("a block in the egg's column below the egg doesn't hatch it; ending the game clears everything", () => {
    const { game, clock } = play(["A", "B"], { minutes: 3, monster: true, rng: () => 0.99 });
    clock.advance(60_000);
    expect(egg(game, 0)).toEqual({ col: 2, row: 3 });
    dropInto(game, clock, byName(game, "A"), [3, 3]);
    expect(game.egg).not.toBeNull();
    game.end();
    expect(game.egg).toBeNull();
    expect(game.hostView().nextMonsterMs).toBeNull();
    clock.advance(10 * 60_000); // no timers left to fire
    expect(game.lastAttack).toBeNull();
  });
});
