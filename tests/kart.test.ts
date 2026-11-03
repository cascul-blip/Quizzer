import { describe, expect, test } from "bun:test";
import { Game } from "../src/server/game/game.ts";
import { FEEDBACK_MS, KartGame, type KartPlayer } from "../src/server/game/kart.ts";
import { buildKartResultsCsv } from "../src/server/game/results.ts";
import {
  KART_COUNTDOWN_MS,
  KART_DRIVE_CAP_MS,
  KART_DRIVE_HOLD_MS,
  KART_INTRO_MS,
  KART_MS_PER_POINT,
  KART_QUIZ_MS,
  KART_TICK_MS,
  gridSlot,
} from "../src/shared/kart-rules.ts";
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

function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

function setup(names: string[], rounds = 3) {
  const clock = new FakeClock();
  let finished = 0;
  let changes = 0;
  let ticks = 0;
  const lobby = new Game(quiz(), { clock });
  lobby.setMode("kart");
  lobby.setKart({ rounds });
  for (const n of names) lobby.join(n);
  const game = KartGame.fromLobby(lobby, {
    clock,
    rng: seeded(),
    onFinish: () => finished++,
    onChange: () => changes++,
    onTick: () => ticks++,
  });
  game.start();
  expect(game.phase).toBe("countdown");
  clock.advance(KART_COUNTDOWN_MS);
  expect(game.phase).toBe("quiz");
  return { clock, game, finished: () => finished, changes: () => changes, ticks: () => ticks };
}

const byName = (game: KartGame, name: string) => [...game.players.values()].find((p) => p.nickname === name)!;

function answer(game: KartGame, clock: FakeClock, p: KartPlayer, right: boolean) {
  const cur = p.current!;
  const option = right ? cur.correct[0]! : cur.options.findIndex((_, i) => !cur.correct.includes(i));
  expect(game.answer(p.id, cur.seq, option)).toBe(true);
  clock.advance(FEEDBACK_MS);
}

function earn(game: KartGame, clock: FakeClock, name: string, n: number) {
  for (let i = 0; i < n; i++) answer(game, clock, byName(game, name), true);
}

/** From any time in the quiz phase to the start of the drive. */
function toDrive(game: KartGame, clock: FakeClock) {
  expect(game.phase).toBe("quiz");
  clock.advance(game.phaseEndsAt - clock.now());
  expect(game.phase).toBe("intro");
  clock.advance(KART_INTRO_MS);
  expect(game.phase).toBe("drive");
}

/** Run the drive phase to its end (the next quiz or the podium). */
function finishDrive(game: KartGame, clock: FakeClock) {
  const round = game.round;
  for (let t = 0; t <= KART_DRIVE_CAP_MS + KART_DRIVE_HOLD_MS && game.phase === "drive"; t += KART_TICK_MS) clock.advance(KART_TICK_MS);
  expect(game.phase === "podium" || game.round === round + 1).toBe(true);
}

describe("Kart Rally", () => {
  test("cars line up on the grid in join order with distinct colours", () => {
    const { game } = setup(["A", "B", "C", "D"]);
    const players = [...game.players.values()];
    players.forEach((p, i) => {
      expect(p.car).toEqual(gridSlot(i, 4));
    });
    expect(new Set(players.map((p) => p.color)).size).toBe(4);
    expect(game.rounds).toBe(3);
  });

  test("phase sequence and timings: countdown → quiz → intro → drive → quiz … → podium", () => {
    const { game, clock, finished } = setup(["A"], 3);
    expect(game.round).toBe(1);
    expect(game.phaseDurationMs).toBe(KART_QUIZ_MS);
    expect(game.hostView().phaseRemainingMs).toBe(KART_QUIZ_MS);
    clock.advance(KART_QUIZ_MS - 1);
    expect(game.phase).toBe("quiz");
    clock.advance(1);
    expect(game.phase).toBe("intro");
    expect(game.phaseDurationMs).toBe(KART_INTRO_MS);
    clock.advance(KART_INTRO_MS);
    expect(game.phase).toBe("drive");
    // Nobody has fuel: the drive just holds and moves on.
    expect(game.phaseDurationMs).toBe(KART_DRIVE_HOLD_MS);
    clock.advance(KART_DRIVE_HOLD_MS);
    expect(game.phase).toBe("quiz");
    expect(game.round).toBe(2);
    for (let r = 2; r <= 3; r++) {
      toDrive(game, clock);
      clock.advance(KART_DRIVE_HOLD_MS);
    }
    expect(game.phase).toBe("podium");
    expect(game.round).toBe(3);
    expect(finished()).toBe(1);
    expect(game.hostView().standings).not.toBeNull();
  });

  test("correct answers become driving time; points reset when the drive starts", () => {
    const { game, clock } = setup(["A", "B"]);
    earn(game, clock, "A", 3);
    answer(game, clock, byName(game, "B"), false);
    expect(byName(game, "A").points).toBe(3);
    expect(byName(game, "B").points).toBe(0);
    toDrive(game, clock);
    const a = byName(game, "A");
    expect(a.points).toBe(0);
    expect(a.fuelStartMs).toBe(3 * KART_MS_PER_POINT);
    expect(a.car.speed).toBe(1);
    const view = game.playerView(a.id)!;
    expect(view.fuelMs).toBe(3 * KART_MS_PER_POINT);
    expect(view.fuelStartMs).toBe(3 * KART_MS_PER_POINT);
    clock.advance(1000);
    expect(game.playerView(a.id)!.fuelMs).toBe(3 * KART_MS_PER_POINT - 1000);
    finishDrive(game, clock);
    expect(a.drivenMs).toBe(3 * KART_MS_PER_POINT);
    expect(a.car.distance).toBeGreaterThan(gridSlot(0, 2).distance + 500);
  });

  test("answers only count in the quiz phase", () => {
    const { game, clock } = setup(["A"]);
    const a = byName(game, "A");
    clock.advance(KART_QUIZ_MS);
    expect(game.phase).toBe("intro");
    expect(game.answer(a.id, a.current!.seq, a.current!.correct[0]!)).toBe(false);
  });

  test("a car with no points never moves", () => {
    const { game, clock } = setup(["A", "B"]);
    earn(game, clock, "A", 2);
    const b = byName(game, "B");
    const start = { ...b.car };
    toDrive(game, clock);
    expect(b.car.speed).toBe(0);
    expect(game.hostView().cars.find((c) => c.id === b.id)!.moving).toBe(false);
    finishDrive(game, clock);
    expect(b.car.x).toBe(start.x);
    expect(b.car.y).toBe(start.y);
    expect(b.drivenMs).toBe(0);
  });

  test("the drive ends a hold after the last car stops", () => {
    const { game, clock } = setup(["A"]);
    earn(game, clock, "A", 1);
    toDrive(game, clock);
    const a = byName(game, "A");
    clock.advance(KART_MS_PER_POINT);
    expect(a.moving).toBe(true); // coasting
    let t = 0;
    while (a.moving && t < 5000) {
      clock.advance(KART_TICK_MS);
      t += KART_TICK_MS;
    }
    expect(a.moving).toBe(false);
    expect(a.car.speed).toBe(0);
    expect(game.phase).toBe("drive");
    expect(game.phaseDurationMs).toBe(KART_DRIVE_HOLD_MS);
    const pos = { ...a.car };
    clock.advance(KART_DRIVE_HOLD_MS - 1);
    expect(game.phase).toBe("drive");
    expect(a.car.x).toBe(pos.x);
    clock.advance(1);
    expect(game.phase).toBe("quiz");
    expect(game.round).toBe(2);
    // Positions carry over.
    expect(a.car.x).toBe(pos.x);
    expect(a.car.distance).toBe(pos.distance);
  });

  test("the drive is capped", () => {
    const { game, clock } = setup(["A"]);
    earn(game, clock, "A", 13);
    expect(byName(game, "A").points).toBe(13);
    // Plenty of fuel: fake more than the cap.
    toDrive(game, clock);
    const a = byName(game, "A");
    a.fuelEndsAt = clock.now() + KART_DRIVE_CAP_MS * 2;
    clock.advance(KART_DRIVE_CAP_MS - KART_TICK_MS);
    expect(game.phase).toBe("drive");
    expect(a.moving).toBe(true);
    clock.advance(KART_TICK_MS);
    expect(game.phase).toBe("quiz");
    expect(a.car.speed).toBe(0);
    expect(a.fuelMs).toBe(0);
  });

  test("steering: drive phase only, clamped, non-finite rejected", () => {
    const { game, clock } = setup(["A"]);
    const a = byName(game, "A");
    expect(game.steer(a.id, 0.5)).toBe(false);
    expect(a.wheel).toBe(0);
    earn(game, clock, "A", 3);
    toDrive(game, clock);
    expect(game.steer(a.id, 5)).toBe(true);
    expect(a.wheel).toBe(1);
    expect(game.steer(a.id, -3)).toBe(true);
    expect(a.wheel).toBe(-1);
    expect(game.steer(a.id, Number.NaN)).toBe(false);
    expect(game.steer(a.id, Infinity)).toBe(false);
    expect(game.steer(a.id, "1" as unknown as number)).toBe(false);
    expect(a.wheel).toBe(-1);
    expect(game.steer("nobody", 0)).toBe(false);
    // Turning left from the start turns the heading counter-clockwise.
    clock.advance(KART_TICK_MS);
    expect(a.car.heading).toBeLessThan(0);
  });

  test("a disconnected player's wheel is centred", () => {
    const { game, clock } = setup(["A"]);
    const a = byName(game, "A");
    earn(game, clock, "A", 2);
    toDrive(game, clock);
    game.steer(a.id, 1);
    game.setConnected(a.id, false);
    expect(a.wheel).toBe(0);
    clock.advance(KART_TICK_MS * 4);
    expect(a.car.heading).toBeCloseTo(0, 6);
  });

  test("onTick fires every drive tick but onChange only on discrete events", () => {
    const { game, clock, changes, ticks } = setup(["A", "B"]);
    earn(game, clock, "A", 4);
    earn(game, clock, "B", 2);
    toDrive(game, clock);
    const c0 = changes();
    const t0 = ticks();
    clock.advance(1000);
    expect(ticks() - t0).toBe(1000 / KART_TICK_MS);
    expect(changes()).toBe(c0);
    finishDrive(game, clock);
    // B stops, A stops (→ hold), next round: a handful, not one per tick.
    expect(changes() - c0).toBeLessThanOrEqual(5);
    expect(ticks() - t0).toBeGreaterThan(80);
    const t1 = ticks();
    clock.advance(KART_QUIZ_MS);
    expect(ticks()).toBe(t1);
  });

  test("host view rounds numbers and stamps the tick", () => {
    const { game, clock } = setup(["A"]);
    earn(game, clock, "A", 2);
    toDrive(game, clock);
    game.steer(game.hostView().cars[0]!.id, 0.37);
    clock.advance(KART_TICK_MS * 3);
    const v = game.hostView();
    expect(v.tick).toBe(clock.now());
    const car = v.cars[0]!;
    expect(Math.round(car.x * 10) / 10).toBe(car.x);
    expect(Math.round(car.y * 10) / 10).toBe(car.y);
    expect(Math.round(car.heading * 1000) / 1000).toBe(car.heading);
    expect(car.moving).toBe(true);
    expect(car.wheel).toBeCloseTo(0.37, 6);
    expect(v.kind).toBe("kart");
    expect(v.rounds).toBe(3);
  });

  test("podium ranks by distance; awards for most correct and smoothest driver", () => {
    const { game, clock } = setup(["A", "B", "C"], 3);
    earn(game, clock, "A", 3);
    earn(game, clock, "B", 5);
    answer(game, clock, byName(game, "C"), false);
    toDrive(game, clock);
    finishDrive(game, clock);
    byName(game, "B").hits = 2;
    byName(game, "A").hits = 1;
    game.end();
    expect(game.phase).toBe("podium");
    const st = game.standings();
    expect(st.map((s) => s.nickname)).toEqual(["B", "A", "C"]);
    expect(st.map((s) => s.rank)).toEqual([1, 2, 3]);
    const aw = game.awards();
    expect(aw.mostCorrect).toEqual({ value: 5, nicknames: ["B"] });
    // C never drove, so it can't be smoothest.
    expect(aw.smoothest).toEqual({ value: 1, nicknames: ["A"] });
    expect(game.playerView(byName(game, "A").id)!.result!.awards).toEqual(["Smoothest driver"]);
    expect(game.playerView(byName(game, "B").id)!.result).toMatchObject({ rank: 1, playerCount: 3, awards: ["Most correct answers"] });
    const host = game.hostView();
    expect(host.hasResults).toBe(true);
    expect(host.awards).toEqual(aw);
    const csv = buildKartResultsCsv(game);
    expect(csv.replace(/^\uFEFF/, "").split(/\r?\n/)[0]).toBe("Rank,Nickname,Laps,Distance,Correct,Wrong,Accuracy %,Wall hits,Seconds driven");
    expect(csv).toContain("1,B,0,");
  });

  test("smoothest allows zero hits; no award when nobody drove", () => {
    const { game, clock } = setup(["A", "B"]);
    expect(game.awards()).toEqual({ mostCorrect: null, smoothest: null });
    earn(game, clock, "A", 1);
    toDrive(game, clock);
    finishDrive(game, clock);
    expect(game.awards().smoothest).toEqual({ value: byName(game, "A").hits, nicknames: ["A"] });
  });

  test("late joiners get the next grid slot and can play", () => {
    const { game, clock } = setup(["A", "B"]);
    const c = game.join("C");
    expect(c.car).toEqual(gridSlot(2, 3));
    expect(c.current).not.toBeNull();
    earn(game, clock, "C", 2);
    toDrive(game, clock);
    expect(c.fuelStartMs).toBe(2 * KART_MS_PER_POINT);
    const d = game.join("D");
    expect(d.car).toEqual(gridSlot(3, 4));
    expect(d.moving).toBe(false);
    finishDrive(game, clock);
    expect(d.car).toEqual(gridSlot(3, 4));
    game.end();
    expect(() => game.join("E")).toThrow();
  });

  test("kick removes the car; end() stops ticking", () => {
    const { game, clock, ticks } = setup(["A", "B"]);
    earn(game, clock, "A", 5);
    toDrive(game, clock);
    game.kick(byName(game, "B").id);
    expect(game.players.size).toBe(1);
    clock.advance(KART_TICK_MS * 2);
    game.end();
    const t = ticks();
    clock.advance(10_000);
    expect(ticks()).toBe(t);
    expect(game.phase).toBe("podium");
  });
});
