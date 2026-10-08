import { describe, expect, test } from "bun:test";
import { Game } from "../src/server/game/game.ts";
import { buildRobotResultsCsv } from "../src/server/game/results.ts";
import { COUNTDOWN_MS, FEEDBACK_MS, RobotGame, spreadTile, type RobotPlayer } from "../src/server/game/robot.ts";
import { ROBOT_ATTACK_MS, ROBOT_BOARD, ROBOT_LIVES, ROBOT_MOVE_MS, ROBOT_WARN_MS, robotInBounds, robotQuizMs, robotRing } from "../src/shared/protocol.ts";
import type { Quiz } from "../src/shared/quiz-schema.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

function quiz(): Quiz {
  return sampleQuiz({
    questions: Array.from({ length: 5 }, (_, i) => ({
      id: `q${i}`,
      type: "multiple_choice" as const,
      text: `Question ${i}`,
      timeLimitSec: 20,
      options: ["yes", "no", "maybe"],
      correct: [0],
    })),
  });
}

/** Deterministic rng so boards are reproducible. */
function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

function setup(names: string[]) {
  const clock = new FakeClock();
  let finished = 0;
  const lobby = new Game(quiz(), { clock });
  lobby.setMode("robot");
  for (const n of names) lobby.join(n);
  const game = RobotGame.fromLobby(lobby, { clock, rng: seeded(), onFinish: () => finished++ });
  game.start();
  clock.advance(COUNTDOWN_MS);
  expect(game.phase).toBe("quiz");
  return { clock, game, finished: () => finished };
}

const byName = (game: RobotGame, name: string) => [...game.players.values()].find((p) => p.nickname === name)!;
const tile = (p: { x: number; y: number }) => p.y * ROBOT_BOARD + p.x;

function answer(game: RobotGame, clock: FakeClock, p: RobotPlayer, right: boolean) {
  const cur = p.current!;
  const option = right ? cur.correct[0]! : cur.options.findIndex((_, i) => !cur.correct.includes(i));
  expect(game.answer(p.id, cur.seq, option)).toBe(true);
  clock.advance(FEEDBACK_MS);
}

/** Skip to the end of the current quiz phase (the move phase starts). */
function toMove(game: RobotGame, clock: FakeClock) {
  clock.advance(game.phaseEndsAt - clock.now());
  expect(game.phase).toBe("move");
}

/** Put the player on a safe (or targeted) tile during the move phase, bypassing points. */
function place(game: RobotGame, p: RobotPlayer, safe: boolean) {
  for (let i = 0; i < ROBOT_BOARD * ROBOT_BOARD; i++) {
    if (robotRing(i) >= game.inset && game.marked.has(i) !== safe) {
      p.x = i % ROBOT_BOARD;
      p.y = Math.floor(i / ROBOT_BOARD);
      return;
    }
  }
}

/** Play one full round where the listed players end on targeted tiles and everyone else is safe. */
function round(game: RobotGame, clock: FakeClock, hit: string[]) {
  if (game.phase !== "move") toMove(game, clock);
  for (const p of game.players.values()) if (p.outRound === null) place(game, p, !hit.includes(p.nickname));
  clock.advance(ROBOT_MOVE_MS);
  expect(game.phase).toBe("attack");
  clock.advance(ROBOT_ATTACK_MS);
}

describe("Robot Attack", () => {
  test("players start spread out on distinct tiles with full lives", () => {
    const { game } = setup(["A", "B", "C", "D"]);
    const tiles = new Set([...game.players.values()].map(tile));
    expect(tiles.size).toBe(4);
    for (const p of game.players.values()) expect(p.lives).toBe(ROBOT_LIVES);
    // Four players on a 12×12 board end up far apart.
    const ps = [...game.players.values()];
    for (const a of ps) for (const b of ps) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(5);
  });

  test("spreadTile shares the least crowded tile once the board is full", () => {
    const order = Array.from({ length: ROBOT_BOARD * ROBOT_BOARD }, (_, i) => i);
    const taken = order.map((i) => ({ x: i % ROBOT_BOARD, y: Math.floor(i / ROBOT_BOARD) }));
    taken.push({ x: 0, y: 0 });
    expect(spreadTile(taken, order)).toBe(1);
  });

  test("correct answers earn movement points; wrong ones don't", () => {
    const { game, clock } = setup(["A"]);
    const a = byName(game, "A");
    answer(game, clock, a, true);
    answer(game, clock, a, false);
    answer(game, clock, a, true);
    expect(a.points).toBe(2);
    expect(a.correct).toBe(2);
    expect(a.wrong).toBe(1);
  });

  test("answers are only taken in the quiz phase", () => {
    const { game, clock } = setup(["A"]);
    const a = byName(game, "A");
    toMove(game, clock);
    expect(game.answer(a.id, a.current!.seq, 0)).toBe(false);
    expect(game.playerView(a.id)!.question).toBeNull();
  });

  test("quiz time starts at 30 s and shrinks by 2 s a round down to 5 s", () => {
    expect([1, 2, 3, 13, 14, 30].map(robotQuizMs)).toEqual([30_000, 28_000, 26_000, 6000, 5000, 5000]);
    const { game, clock } = setup(["A", "B"]);
    expect(game.phaseDurationMs).toBe(30_000);
    round(game, clock, []);
    expect(game.round).toBe(2);
    expect(game.phase).toBe("quiz");
    expect(game.phaseDurationMs).toBe(28_000);
  });

  test("red Xs appear 5 s before the quiz ends: 3/4 of the board plus every occupied tile", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    clock.advance(robotQuizMs(1) - ROBOT_WARN_MS - 1);
    expect(game.marked.size).toBe(0);
    expect(game.hostView().marked).toEqual([]);
    clock.advance(1);
    expect(game.marked.size).toBeGreaterThanOrEqual(108);
    expect(game.marked.size).toBeLessThanOrEqual(111);
    for (const p of game.players.values()) expect(game.marked.has(tile(p))).toBe(true);
    // Phones only see the board during movement.
    expect(game.playerView(byName(game, "A").id)!.board).toBeNull();
    toMove(game, clock);
    expect(game.playerView(byName(game, "A").id)!.board!.marked.length).toBe(game.marked.size);
  });

  test("when the quiz phase is 5 s or shorter, the Xs are up from the start", () => {
    const { game, clock } = setup(["A", "B"]);
    while (robotQuizMs(game.round) > ROBOT_WARN_MS) round(game, clock, []);
    expect(game.phase).toBe("quiz");
    // Three rings are gone by now: 3/4 of the 6×6 board that's left.
    expect(game.inset).toBe(3);
    expect(game.marked.size).toBe(27);
  });

  test("moves spend points, stop at the edges and only happen in the move phase", () => {
    const { game, clock } = setup(["A"]);
    const a = byName(game, "A");
    answer(game, clock, a, true);
    answer(game, clock, a, true);
    answer(game, clock, a, true);
    expect(game.move(a.id, "left")).toBe(false); // still quiz time
    toMove(game, clock);
    a.x = 0;
    a.y = 5;
    expect(game.move(a.id, "left")).toBe(false); // edge of the board
    expect(a.points).toBe(3);
    expect(game.move(a.id, "right")).toBe(true);
    expect(game.move(a.id, "up")).toBe(true);
    expect(game.move(a.id, "down")).toBe(true);
    expect({ x: a.x, y: a.y, points: a.points, moves: a.moves }).toEqual({ x: 1, y: 5, points: 0, moves: 3 });
    expect(game.move(a.id, "right")).toBe(false); // out of points
    expect(game.move(a.id, "sideways" as never)).toBe(false);
  });

  test("a player can't move onto another player's tile, and a blocked move costs nothing", () => {
    const { game, clock } = setup(["A", "B"]);
    const a = byName(game, "A");
    const b = byName(game, "B");
    answer(game, clock, a, true);
    answer(game, clock, a, true);
    toMove(game, clock);
    a.x = 5;
    a.y = 5;
    b.x = 6;
    b.y = 5;
    expect(game.move(a.id, "right")).toBe(false);
    expect({ x: a.x, points: a.points, moves: a.moves }).toEqual({ x: 5, points: 2, moves: 0 });
    // Once B steps away, the tile is free.
    b.y = 6;
    expect(game.move(a.id, "right")).toBe(true);
    expect(a.x).toBe(6);
  });

  test("players who are out leave the board and don't block", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    for (let i = 0; i < ROBOT_LIVES; i++) round(game, clock, ["B"]);
    const a = byName(game, "A");
    const b = byName(game, "B");
    expect(b.outRound).not.toBeNull();
    answer(game, clock, a, true);
    toMove(game, clock);
    a.x = 5;
    a.y = 5;
    b.x = 5;
    b.y = 4;
    expect(game.move(a.id, "up")).toBe(true);
    expect(game.playerView(byName(game, "C").id)!.board!.others).toHaveLength(1);
  });

  test("leftover points are lost when the lasers fire", () => {
    const { game, clock } = setup(["A", "B"]);
    const a = byName(game, "A");
    answer(game, clock, a, true);
    answer(game, clock, a, true);
    round(game, clock, []);
    expect(a.points).toBe(0);
  });

  test("the lasers take a life only from players on targeted tiles", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    round(game, clock, ["A"]);
    expect(byName(game, "A").lives).toBe(ROBOT_LIVES - 1);
    expect(byName(game, "B").lives).toBe(ROBOT_LIVES);
    expect(game.lastAttack).toEqual({ seq: 1, round: 1, hit: [byName(game, "A").id], eliminated: [] });
    expect(game.playerView(byName(game, "A").id)!.lastAttack).toEqual({ seq: 1, hit: true, eliminated: false });
    expect(game.playerView(byName(game, "B").id)!.lastAttack).toEqual({ seq: 1, hit: false, eliminated: false });
    // Marks are cleared for the next round.
    expect(game.marked.size).toBe(0);
  });

  test("standing still gets you hit: your own tile is always targeted", () => {
    const { game, clock } = setup(["A", "B"]);
    toMove(game, clock);
    clock.advance(ROBOT_MOVE_MS);
    for (const p of game.players.values()) expect(p.lives).toBe(ROBOT_LIVES - 1);
  });

  test("out of lives: out of the game, can still answer for fun but not move", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    for (let i = 0; i < ROBOT_LIVES; i++) round(game, clock, ["A"]);
    const a = byName(game, "A");
    expect(a.lives).toBe(0);
    expect(a.outRound).toBe(3);
    expect(game.phase).toBe("quiz");
    answer(game, clock, a, true);
    expect(a.correct).toBe(1);
    expect(a.points).toBe(0);
    toMove(game, clock);
    a.points = 5;
    expect(game.move(a.id, "up")).toBe(false);
    expect(game.move(a.id, "down")).toBe(false);
  });

  test("the last player standing wins", () => {
    const { game, clock, finished } = setup(["A", "B", "C"]);
    for (let i = 0; i < ROBOT_LIVES; i++) round(game, clock, ["A", "B"]);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    const s = game.standings();
    expect(s.map((x) => [x.nickname, x.rank])).toEqual([
      ["C", 1],
      ["A", 2],
      ["B", 2],
    ]);
    expect(game.playerView(byName(game, "C").id)!.result).toMatchObject({ rank: 1, won: true, outRound: null });
    expect(game.playerView(byName(game, "A").id)!.result).toMatchObject({ rank: 2, won: false, outRound: 3 });
  });

  test("everyone left knocked out by the same blast shares the win", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    round(game, clock, ["C"]);
    round(game, clock, ["C"]);
    round(game, clock, ["C"]);
    expect(byName(game, "C").outRound).toBe(3);
    for (let i = 0; i < ROBOT_LIVES; i++) round(game, clock, ["A", "B"]);
    expect(game.phase).toBe("podium");
    const ranks = Object.fromEntries(game.standings().map((s) => [s.nickname, s.rank]));
    expect(ranks).toEqual({ A: 1, B: 1, C: 3 });
  });

  test("a solo game runs until its player is out", () => {
    const { game, clock } = setup(["Solo"]);
    round(game, clock, []);
    round(game, clock, ["Solo"]);
    expect(game.phase).toBe("quiz");
    round(game, clock, ["Solo"]);
    round(game, clock, ["Solo"]);
    expect(game.phase).toBe("podium");
    expect(game.standings()[0]).toMatchObject({ nickname: "Solo", rank: 1, outRound: 4 });
  });

  test("host ends early: survivors rank by lives left", () => {
    const { game, clock, finished } = setup(["A", "B", "C"]);
    round(game, clock, ["A"]);
    game.end();
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    expect(game.standings().map((s) => [s.nickname, s.rank])).toEqual([
      ["B", 1],
      ["C", 1],
      ["A", 3],
    ]);
    const view = game.hostView();
    expect(view.standings).toHaveLength(3);
    expect(view.hasResults).toBe(true);
  });

  test("late joiners get full lives, a question, and an X on their tile if the targets are up", () => {
    const { game, clock } = setup(["A", "B"]);
    clock.advance(robotQuizMs(1) - ROBOT_WARN_MS);
    const late = game.join("Late");
    expect(late.lives).toBe(ROBOT_LIVES);
    expect(late.current).not.toBeNull();
    expect(game.marked.has(tile(late))).toBe(true);
    toMove(game, clock);
    // Joining with no points left to earn: dropped on a safe tile.
    const later = game.join("Later");
    expect(game.marked.has(tile(later))).toBe(false);
  });

  test("every 4th round the outer ring is targeted, and 1/4 of the board inside it stays safe", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    for (let r = 1; r <= 3; r++) {
      toMove(game, clock);
      expect(game.collapsing.size).toBe(0);
      expect(game.hostView().collapsing).toEqual([]);
      round(game, clock, []);
    }
    expect(game.round).toBe(4);
    toMove(game, clock);
    expect(game.inset).toBe(0);
    expect(game.collapsing.size).toBe(44);
    for (const i of game.collapsing) {
      expect(robotRing(i)).toBe(0);
      expect(game.marked.has(i)).toBe(true);
    }
    expect(game.marked.size).toBe(44 + 75);
    const view = game.playerView(byName(game, "A").id)!.board!;
    expect(view.inset).toBe(0);
    expect(view.collapsing.length).toBe(44);
  });

  test("a player left on the destroyed ring loses a life and lands on the closest free tile", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    for (let r = 1; r <= 3; r++) round(game, clock, []);
    toMove(game, clock);
    const [a, b, c] = [byName(game, "A"), byName(game, "B"), byName(game, "C")];
    place(game, c, true);
    // A and B are both closest to (1, 5); only one of them gets it.
    Object.assign(a, { x: 0, y: 5 });
    Object.assign(b, { x: 0, y: 6 });
    game.marked.delete(tile({ x: 1, y: 5 }));
    const safeAt = { x: c.x, y: c.y };
    clock.advance(ROBOT_MOVE_MS);
    expect(game.phase).toBe("attack");
    expect(game.inset).toBe(1);
    expect(game.lastAttack!.hit.sort()).toEqual([a.id, b.id].sort());
    expect([a.lives, b.lives, c.lives]).toEqual([ROBOT_LIVES - 1, ROBOT_LIVES - 1, ROBOT_LIVES]);
    expect({ x: a.x, y: a.y }).toEqual({ x: 1, y: 5 });
    expect({ x: b.x, y: b.y }).toEqual({ x: 1, y: 6 });
    expect({ x: c.x, y: c.y }).toEqual(safeAt);
    // The ring stays in the views through the attack, for the collapse animation.
    expect(game.hostView().collapsing.length).toBe(44);
    expect(game.hostView().inset).toBe(1);
    clock.advance(ROBOT_ATTACK_MS);
    expect(game.collapsing.size).toBe(0);
  });

  test("a player knocked out on the ring is not moved", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    for (let r = 1; r <= 3; r++) round(game, clock, []);
    toMove(game, clock);
    const a = byName(game, "A");
    for (const p of game.players.values()) place(game, p, true);
    Object.assign(a, { x: 0, y: 0, lives: 1 });
    clock.advance(ROBOT_MOVE_MS);
    expect(a.outRound).toBe(4);
    expect({ x: a.x, y: a.y }).toEqual({ x: 0, y: 0 });
  });

  test("after a ring is gone, moves stop at the new edge and late joiners start inside it", () => {
    const { game, clock } = setup(["A", "B"]);
    for (let r = 1; r <= 4; r++) round(game, clock, []);
    expect(game.inset).toBe(1);
    const a = byName(game, "A");
    answer(game, clock, a, true);
    answer(game, clock, a, true);
    toMove(game, clock);
    Object.assign(a, { x: 1, y: 5 });
    expect(game.move(a.id, "left")).toBe(false);
    expect(game.move(a.id, "right")).toBe(true);
    for (let i = 0; i < 20; i++) {
      const late = game.join(`Late${i}`);
      expect(robotInBounds(late.x, late.y, 1)).toBe(true);
    }
  });

  test("the board stops shrinking at 2×2, with one tile in four still safe", () => {
    const { game, clock } = setup(["A"]);
    const a = byName(game, "A");
    for (let r = 1; r <= 20; r++) round(game, clock, []);
    expect(game.inset).toBe(5);
    expect(a.lives).toBe(ROBOT_LIVES);
    for (let r = 21; r <= 24; r++) {
      toMove(game, clock);
      expect(game.collapsing.size).toBe(0);
      expect(game.marked.size).toBe(3);
      expect(game.marked.has(tile(a))).toBe(true);
      round(game, clock, []);
    }
    expect(game.inset).toBe(5);
  });

  test("kick removes the player", () => {
    const { game } = setup(["A", "B"]);
    expect(game.kick(byName(game, "A").id)?.nickname).toBe("A");
    expect(game.players.size).toBe(1);
  });

  test("results CSV lists standings", () => {
    const { game, clock } = setup(["A", "B"]);
    answer(game, clock, byName(game, "A"), true);
    for (let i = 0; i < ROBOT_LIVES; i++) round(game, clock, ["B"]);
    const csv = buildRobotResultsCsv(game);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("Rank,Nickname,Status,Lives left,Rounds survived");
    expect(lines[1]).toBe("1,A,Winner,3,3,1,0,100,0,0");
    expect(lines[2]).toBe("2,B,Out in round 3,0,2,0,0,,0,3");
  });
});
