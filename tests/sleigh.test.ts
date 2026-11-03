import { describe, expect, test } from "bun:test";
import { Game } from "../src/server/game/game.ts";
import { FEEDBACK_MS, SleighGame, type SleighPlayer } from "../src/server/game/sleigh.ts";
import { buildSleighResultsCsv } from "../src/server/game/results.ts";
import {
  SLEIGH_COUNTDOWN_MS,
  SLEIGH_DEFAULT_HOUSES,
  SLEIGH_DRIVE_CAP_MS,
  SLEIGH_DRIVE_HOLD_MS,
  SLEIGH_FINALE_MS,
  SLEIGH_INTRO_MS,
  SLEIGH_MS_PER_POINT,
  SLEIGH_QUIZ_MS,
  SLEIGH_SPEED,
  SLEIGH_TICK_MS,
  launchSlot,
  placeHouses,
  seededRng,
} from "../src/shared/sleigh-rules.ts";
import type { SleighHouse } from "../src/shared/protocol.ts";
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

function setup(names: string[], houses = 15, seed = 42) {
  const clock = new FakeClock();
  let finished = 0;
  let changes = 0;
  let ticks = 0;
  const lobby = new Game(quiz(), { clock });
  lobby.setMode("sleigh");
  lobby.setSleigh({ houses });
  for (const n of names) lobby.join(n);
  const game = SleighGame.fromLobby(lobby, {
    clock,
    rng: seededRng(seed),
    onFinish: () => finished++,
    onChange: () => changes++,
    onTick: () => ticks++,
  });
  game.start();
  expect(game.phase).toBe("countdown");
  clock.advance(SLEIGH_COUNTDOWN_MS);
  expect(game.phase).toBe("quiz");
  return { clock, game, finished: () => finished, changes: () => changes, ticks: () => ticks };
}

const byName = (game: SleighGame, name: string) => [...game.players.values()].find((p) => p.nickname === name)!;

function answer(game: SleighGame, clock: FakeClock, p: SleighPlayer, right: boolean) {
  const cur = p.current!;
  const option = right ? cur.correct[0]! : cur.options.findIndex((_, i) => !cur.correct.includes(i));
  expect(game.answer(p.id, cur.seq, option)).toBe(true);
  clock.advance(FEEDBACK_MS);
}

function earn(game: SleighGame, clock: FakeClock, name: string, n: number) {
  for (let i = 0; i < n; i++) answer(game, clock, byName(game, name), true);
}

/** From any time in the quiz phase to the start of the flight. */
function toFlight(game: SleighGame, clock: FakeClock) {
  expect(game.phase).toBe("quiz");
  clock.advance(game.phaseEndsAt - clock.now());
  expect(game.phase).toBe("intro");
  clock.advance(SLEIGH_INTRO_MS);
  expect(game.phase).toBe("flight");
}

/** Run the flight phase to its end (the next quiz or the podium). */
function finishFlight(game: SleighGame, clock: FakeClock) {
  const round = game.round;
  for (let t = 0; t <= SLEIGH_DRIVE_CAP_MS + SLEIGH_FINALE_MS && game.phase === "flight"; t += SLEIGH_TICK_MS) clock.advance(SLEIGH_TICK_MS);
  expect(game.phase === "podium" || game.round === round + 1).toBe(true);
}

const centre = (h: SleighHouse) => ({ x: h.x + h.w / 2, y: h.y + h.h / 2 });
/** One tick at full speed, heading 0 (straight right). */
const STEP = SLEIGH_SPEED * (SLEIGH_TICK_MS / 1000);

/** Put a flying sleigh so that next tick (heading right at full speed) it ends `dx` right of the house's centre. */
function aim(p: SleighPlayer, h: SleighHouse, dx = 0) {
  const c = centre(h);
  p.sleigh = { ...p.sleigh, x: c.x - STEP + dx, y: c.y, heading: 0, speed: 1, scraping: false };
  p.wheel = 0;
}

/** A house no sleigh is over, still waiting for its present. */
function waiting(game: SleighGame, skip: number[] = []): SleighHouse {
  return game.houses.find((h) => h.deliveredBy === null && !skip.includes(h.id))!;
}

describe("Santa's Sleigh Run", () => {
  test("houses are placed from the game's rng; sleighs fan out on the launch pad with distinct colours", () => {
    const { game } = setup(["A", "B", "C", "D"], 23, 7);
    expect(game.houses.length).toBe(23);
    // The first draws of the game's rng place the city, so a seed always gives the same one.
    expect(game.houses.map(({ deliveredBy, ...h }) => h)).toEqual(placeHouses(23, seededRng(7)));
    expect(game.houses.every((h) => h.deliveredBy === null)).toBe(true);
    const players = [...game.players.values()];
    players.forEach((p, i) => expect(p.sleigh).toEqual(launchSlot(i, 4)));
    expect(new Set(players.map((p) => p.color)).size).toBe(4);
    const v = game.hostView();
    expect(v).toMatchObject({ delivered: 0, total: 23, finished: false, lastDelivery: null });
    expect(v.houses.length).toBe(23);
  });

  test("lobby default is SLEIGH_DEFAULT_HOUSES; settings are validated", () => {
    const lobby = new Game(quiz());
    lobby.setMode("sleigh");
    expect(lobby.sleigh.houses).toBe(SLEIGH_DEFAULT_HOUSES);
    expect(() => lobby.setSleigh({ houses: 14 })).toThrow("Unsupported number of houses");
    expect(() => lobby.setSleigh({ houses: 31 })).toThrow("Unsupported number of houses");
    expect(() => lobby.setSleigh({ houses: 20.5 })).toThrow("Unsupported number of houses");
    lobby.setSleigh({ houses: 30 });
    expect(lobby.sleigh.houses).toBe(30);
    lobby.join("A");
    expect(SleighGame.fromLobby(lobby).houses.length).toBe(30);
  });

  test("phase sequence: countdown → quiz → intro → flight → quiz …, rounds keep going until every present is delivered", () => {
    const { game, clock, finished } = setup(["A"]);
    expect(game.round).toBe(1);
    expect(game.phaseDurationMs).toBe(SLEIGH_QUIZ_MS);
    expect(game.hostView().phaseRemainingMs).toBe(SLEIGH_QUIZ_MS);
    clock.advance(SLEIGH_QUIZ_MS - 1);
    expect(game.phase).toBe("quiz");
    clock.advance(1);
    expect(game.phase).toBe("intro");
    expect(game.phaseDurationMs).toBe(SLEIGH_INTRO_MS);
    clock.advance(SLEIGH_INTRO_MS);
    expect(game.phase).toBe("flight");
    // Nobody has flying time: the flight just holds and moves on.
    expect(game.phaseDurationMs).toBe(SLEIGH_DRIVE_HOLD_MS);
    clock.advance(SLEIGH_DRIVE_HOLD_MS);
    expect(game.phase).toBe("quiz");
    expect(game.round).toBe(2);
    for (let r = 2; r <= 8; r++) {
      toFlight(game, clock);
      clock.advance(SLEIGH_DRIVE_HOLD_MS);
    }
    expect(game.phase).toBe("quiz");
    expect(game.round).toBe(9);
    expect(finished()).toBe(0);
  });

  test("each correct answer buys SLEIGH_MS_PER_POINT of flying; points reset when the flight starts", () => {
    const { game, clock } = setup(["A", "B"]);
    earn(game, clock, "A", 3);
    answer(game, clock, byName(game, "B"), false);
    expect(byName(game, "A").points).toBe(3);
    expect(byName(game, "B").points).toBe(0);
    expect(game.playerView(byName(game, "A").id)!.me.points).toBe(3);
    toFlight(game, clock);
    const a = byName(game, "A");
    expect(a.points).toBe(0);
    expect(a.fuelStartMs).toBe(3 * SLEIGH_MS_PER_POINT);
    expect(a.sleigh.speed).toBe(1);
    const view = game.playerView(a.id)!;
    expect(view.fuelMs).toBe(3 * SLEIGH_MS_PER_POINT);
    expect(view.fuelStartMs).toBe(3 * SLEIGH_MS_PER_POINT);
    clock.advance(1000);
    expect(game.playerView(a.id)!.fuelMs).toBe(3 * SLEIGH_MS_PER_POINT - 1000);
    expect(game.hostView().sleighs.find((s) => s.id === a.id)!.fuelMs).toBe(3 * SLEIGH_MS_PER_POINT - 1000);
    finishFlight(game, clock);
    expect(a.flownMs).toBe(3 * SLEIGH_MS_PER_POINT);
    expect(a.sleigh.distance).toBeGreaterThan(1000);
    expect(game.playerView(a.id)!.fuelMs).toBe(0);
  });

  test("answers only count in the quiz phase", () => {
    const { game, clock } = setup(["A"]);
    const a = byName(game, "A");
    clock.advance(SLEIGH_QUIZ_MS);
    expect(game.phase).toBe("intro");
    expect(game.answer(a.id, a.current!.seq, a.current!.correct[0]!)).toBe(false);
  });

  test("a sleigh with no points never moves", () => {
    const { game, clock } = setup(["A", "B"]);
    earn(game, clock, "A", 2);
    const b = byName(game, "B");
    const start = { ...b.sleigh };
    toFlight(game, clock);
    expect(b.sleigh.speed).toBe(0);
    expect(game.hostView().sleighs.find((s) => s.id === b.id)!.moving).toBe(false);
    game.steer(b.id, 1);
    finishFlight(game, clock);
    expect(b.sleigh.x).toBe(start.x);
    expect(b.sleigh.y).toBe(start.y);
    expect(b.flownMs).toBe(0);
    expect(b.presents).toBe(0);
  });

  test("the flight ends a hold after the last sleigh stops; positions carry over", () => {
    const { game, clock } = setup(["A"]);
    earn(game, clock, "A", 1);
    toFlight(game, clock);
    const a = byName(game, "A");
    clock.advance(SLEIGH_MS_PER_POINT);
    expect(a.moving).toBe(true); // gliding
    let t = 0;
    while (a.moving && t < 5000) {
      clock.advance(SLEIGH_TICK_MS);
      t += SLEIGH_TICK_MS;
    }
    expect(a.moving).toBe(false);
    expect(a.sleigh.speed).toBe(0);
    expect(game.phase).toBe("flight");
    expect(game.phaseDurationMs).toBe(SLEIGH_DRIVE_HOLD_MS);
    const pos = { ...a.sleigh };
    clock.advance(SLEIGH_DRIVE_HOLD_MS - 1);
    expect(game.phase).toBe("flight");
    expect(a.sleigh.x).toBe(pos.x);
    clock.advance(1);
    expect(game.phase).toBe("quiz");
    expect(game.round).toBe(2);
    expect(a.sleigh.x).toBe(pos.x);
    expect(a.sleigh.y).toBe(pos.y);
    expect(a.sleigh.distance).toBe(pos.distance);
  });

  test("the flight is capped", () => {
    const { game, clock } = setup(["A"]);
    earn(game, clock, "A", 3);
    toFlight(game, clock);
    const a = byName(game, "A");
    // Fake more flying time than the cap.
    a.fuelEndsAt = clock.now() + SLEIGH_DRIVE_CAP_MS * 2;
    clock.advance(SLEIGH_DRIVE_CAP_MS - SLEIGH_TICK_MS);
    if (game.phase === "flight" && !game.finished) {
      expect(a.moving).toBe(true);
      clock.advance(SLEIGH_TICK_MS);
    }
    // (60 s of flying could deliver everything; either way the flight is over.)
    if (!game.finished) {
      expect(game.phase).toBe("quiz");
      expect(a.sleigh.speed).toBe(0);
      expect(a.fuelMs).toBe(0);
    }
  });

  test("steering: flight phase only, clamped, non-finite rejected; left turns counter-clockwise", () => {
    const { game, clock } = setup(["A"]);
    const a = byName(game, "A");
    expect(game.steer(a.id, 0.5)).toBe(false);
    expect(a.wheel).toBe(0);
    earn(game, clock, "A", 3);
    toFlight(game, clock);
    const h0 = a.sleigh.heading;
    expect(game.steer(a.id, 5)).toBe(true);
    expect(a.wheel).toBe(1);
    expect(game.steer(a.id, -3)).toBe(true);
    expect(a.wheel).toBe(-1);
    expect(game.steer(a.id, Number.NaN)).toBe(false);
    expect(game.steer(a.id, Infinity)).toBe(false);
    expect(game.steer(a.id, "1" as unknown as number)).toBe(false);
    expect(a.wheel).toBe(-1);
    expect(game.steer("nobody", 0)).toBe(false);
    clock.advance(SLEIGH_TICK_MS);
    expect(Math.sin(a.sleigh.heading - h0)).toBeLessThan(0);
  });

  test("a disconnected player's wheel is centred", () => {
    const { game, clock } = setup(["A"]);
    const a = byName(game, "A");
    earn(game, clock, "A", 2);
    toFlight(game, clock);
    const h0 = a.sleigh.heading;
    game.steer(a.id, 1);
    game.setConnected(a.id, false);
    expect(a.wheel).toBe(0);
    clock.advance(SLEIGH_TICK_MS * 4);
    expect(a.sleigh.heading).toBeCloseTo(h0, 6);
  });

  test("flying over a waiting house delivers its present (steered there)", () => {
    const { game, clock, changes } = setup(["A"]);
    earn(game, clock, "A", 5);
    toFlight(game, clock);
    const a = byName(game, "A");
    // Fly from the pad straight at a house by steering towards it every tick.
    const target = waiting(game);
    const c = centre(target);
    for (let i = 0; i < 200 && target.deliveredBy === null && game.phase === "flight"; i++) {
      const want = Math.atan2(c.y - a.sleigh.y, c.x - a.sleigh.x);
      const diff = Math.atan2(Math.sin(want - a.sleigh.heading), Math.cos(want - a.sleigh.heading));
      game.steer(a.id, Math.max(-1, Math.min(1, diff * 3)));
      const c0 = changes();
      clock.advance(SLEIGH_TICK_MS);
      if (target.deliveredBy !== null) expect(changes()).toBeGreaterThan(c0);
    }
    expect(target.deliveredBy).toBe(a.id);
    expect(a.presents).toBeGreaterThanOrEqual(1);
    expect(a.presents).toBe(game.houses.filter((h) => h.deliveredBy === a.id).length);
    expect(game.lastDelivery).toMatchObject({ seq: a.presents, playerId: a.id });
    const v = game.playerView(a.id)!;
    expect(v.lastDelivery).toBe(game.lastDelivery!.seq);
    expect(v.delivered).toBe(a.presents);
    expect(v.me.presents).toBe(a.presents);
    const hv = game.hostView();
    expect(hv.delivered).toBe(a.presents);
    expect(hv.houses.find((h) => h.id === target.id)!.deliveredBy).toBe(a.id);
    expect(hv.sleighs[0]!.presents).toBe(a.presents);
  });

  test("first sleigh claims a house; a delivered house is scenery; each delivery is one onChange and one seq", () => {
    const { game, clock, changes } = setup(["A", "B"]);
    earn(game, clock, "A", 5);
    earn(game, clock, "B", 5);
    toFlight(game, clock);
    const a = byName(game, "A");
    const b = byName(game, "B");
    clock.advance(SLEIGH_TICK_MS);
    const delivered0 = game.delivered;
    const seq0 = game.lastDelivery?.seq ?? 0;
    const h = waiting(game);
    aim(a, h);
    // Keep B well away from every house: park it on the pad.
    b.sleigh = { ...launchSlot(1, 2), speed: 0 };
    b.moving = false;
    const c0 = changes();
    clock.advance(SLEIGH_TICK_MS);
    expect(h.deliveredBy).toBe(a.id);
    expect(game.delivered).toBe(delivered0 + 1);
    expect(game.lastDelivery).toEqual({ seq: seq0 + 1, house: h.id, playerId: a.id });
    expect(changes() - c0).toBe(1);
    expect(game.playerView(a.id)!.lastDelivery).toBe(seq0 + 1);
    expect(game.playerView(b.id)!.lastDelivery).toBeNull();
    // B flies over the same house: nothing happens.
    a.sleigh = { ...launchSlot(0, 2), speed: 0 };
    a.moving = false;
    b.moving = true;
    aim(b, h);
    const bPresents = b.presents;
    const c1 = changes();
    clock.advance(SLEIGH_TICK_MS);
    expect(h.deliveredBy).toBe(a.id);
    expect(b.presents).toBe(bPresents);
    expect(game.delivered).toBe(delivered0 + 1);
    expect(game.lastDelivery!.seq).toBe(seq0 + 1);
    expect(changes()).toBe(c1);
  });

  test("two sleighs reaching a house in the same tick: the one nearer its centre wins", () => {
    const { game, clock } = setup(["A", "B"]);
    earn(game, clock, "A", 5);
    earn(game, clock, "B", 5);
    toFlight(game, clock);
    const a = byName(game, "A");
    const b = byName(game, "B");
    clock.advance(SLEIGH_TICK_MS);
    // House 1: A ends on the centre, B 24 units past it.
    const h1 = waiting(game);
    aim(a, h1, 0);
    aim(b, h1, 24);
    clock.advance(SLEIGH_TICK_MS);
    expect(h1.deliveredBy).toBe(a.id);
    // House 2: now B is nearer (so it isn't just join order).
    const h2 = waiting(game, [h1.id]);
    aim(a, h2, -24);
    aim(b, h2, 3);
    clock.advance(SLEIGH_TICK_MS);
    expect(h2.deliveredBy).toBe(b.id);
    expect(game.lastDelivery).toMatchObject({ house: h2.id, playerId: b.id });
  });

  test("the last present: everyone stops, the finale holds (still flight), then the podium", () => {
    const { game, clock, finished, changes } = setup(["A", "B"]);
    earn(game, clock, "A", 5);
    earn(game, clock, "B", 2);
    toFlight(game, clock);
    const a = byName(game, "A");
    const b = byName(game, "B");
    clock.advance(SLEIGH_TICK_MS);
    // A teleports from house to house, one per tick.
    let guard = 0;
    while (game.houses.some((h) => h.deliveredBy === null) && guard++ < 100) {
      aim(a, waiting(game));
      clock.advance(SLEIGH_TICK_MS);
    }
    expect(game.delivered).toBe(game.houses.length);
    expect(game.finished).toBe(true);
    expect(game.phase).toBe("flight");
    expect(game.phaseDurationMs).toBe(SLEIGH_FINALE_MS);
    for (const p of [a, b]) {
      expect(p.moving).toBe(false);
      expect(p.sleigh.speed).toBe(0);
      expect(p.fuelMs).toBe(0);
      expect(game.playerView(p.id)!.fuelMs).toBe(0);
    }
    expect(game.steer(a.id, 1)).toBe(false);
    const host = game.hostView();
    expect(host).toMatchObject({ finished: true, phase: "flight", delivered: host.total });
    expect(host.sleighs.every((s) => !s.moving)).toBe(true);
    expect(game.playerView(b.id)).toMatchObject({ finished: true, delivered: host.total, total: host.total });
    const pos = { ...a.sleigh };
    const c0 = changes();
    clock.advance(SLEIGH_FINALE_MS - 1);
    expect(game.phase).toBe("flight");
    expect(a.sleigh).toEqual(pos);
    expect(changes()).toBe(c0);
    clock.advance(1);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    expect(game.round).toBe(1);
    expect(game.standings()[0]!.nickname).toBe("A");
    expect(game.hostView().standings).not.toBeNull();
  });

  test("end() goes straight to the podium and stops ticking", () => {
    const { game, clock, ticks, finished } = setup(["A", "B"]);
    earn(game, clock, "A", 5);
    toFlight(game, clock);
    game.kick(byName(game, "B").id);
    expect(game.players.size).toBe(1);
    clock.advance(SLEIGH_TICK_MS * 2);
    game.end();
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    const t = ticks();
    clock.advance(10_000);
    expect(ticks()).toBe(t);
    expect(game.phase).toBe("podium");
    game.end();
    expect(finished()).toBe(1);
  });

  test("onTick fires every flight tick but onChange only on discrete events", () => {
    const { game, clock, changes, ticks } = setup(["A", "B"], 15, 3);
    earn(game, clock, "A", 4);
    earn(game, clock, "B", 2);
    toFlight(game, clock);
    game.steer(byName(game, "A").id, 1);
    game.steer(byName(game, "B").id, -1);
    const c0 = changes();
    const t0 = ticks();
    clock.advance(1000);
    expect(ticks() - t0).toBe(1000 / SLEIGH_TICK_MS);
    // Nobody has stopped yet: the only discrete events are deliveries (at most one per house).
    expect(changes() - c0).toBeLessThanOrEqual(game.delivered);
    expect(changes() - c0).toBeLessThan(ticks() - t0);
    finishFlight(game, clock);
    // B stops, A stops (→ hold), next round: a handful, not one per tick.
    expect(changes() - c0).toBeLessThanOrEqual(5 + game.delivered);
    expect(ticks() - t0).toBeGreaterThan(80);
    const t1 = ticks();
    clock.advance(SLEIGH_QUIZ_MS);
    expect(ticks()).toBe(t1);
  });

  test("host view rounds numbers and stamps the tick", () => {
    const { game, clock } = setup(["A"]);
    earn(game, clock, "A", 2);
    toFlight(game, clock);
    game.steer(game.hostView().sleighs[0]!.id, 0.37);
    clock.advance(SLEIGH_TICK_MS * 3);
    const v = game.hostView();
    expect(v.tick).toBe(clock.now());
    const s = v.sleighs[0]!;
    expect(Math.round(s.x * 10) / 10).toBe(s.x);
    expect(Math.round(s.y * 10) / 10).toBe(s.y);
    expect(Math.round(s.heading * 1000) / 1000).toBe(s.heading);
    expect(Math.round(s.distance * 10) / 10).toBe(s.distance);
    expect(s.moving).toBe(true);
    expect(s.wheel).toBeCloseTo(0.37, 6);
    expect(v.kind).toBe("sleigh");
    expect(v.round).toBe(1);
  });

  test("standings: presents, then distance; ties share a rank ordered by correct answers", () => {
    const { game, clock } = setup(["A", "B", "C", "D"]);
    earn(game, clock, "D", 2);
    const [a, b, c, d] = ["A", "B", "C", "D"].map((n) => byName(game, n));
    a!.presents = 2;
    a!.sleigh = { ...a!.sleigh, distance: 100 };
    b!.presents = 3;
    b!.sleigh = { ...b!.sleigh, distance: 50 };
    c!.presents = 2;
    c!.sleigh = { ...c!.sleigh, distance: 400 };
    d!.presents = 2;
    d!.sleigh = { ...d!.sleigh, distance: 100.01 };
    const st = game.standings();
    expect(st.map((s) => s.nickname)).toEqual(["B", "C", "D", "A"]);
    expect(st.map((s) => s.rank)).toEqual([1, 2, 3, 3]);
    expect(st[0]).toMatchObject({ presents: 3, distance: 50, bumps: 0, correct: 0 });
    expect(game.playerView(a!.id)!.me.rank).toBe(3);
  });

  test("awards: most correct, smoothest flyer (fewest bumps, 0 counts) and furthest flown; CSV", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    expect(game.awards()).toEqual({ mostCorrect: null, smoothest: null, furthest: null });
    earn(game, clock, "A", 3);
    earn(game, clock, "B", 5);
    answer(game, clock, byName(game, "C"), false);
    toFlight(game, clock);
    finishFlight(game, clock);
    const [a, b, c] = ["A", "B", "C"].map((n) => byName(game, n));
    b!.bumps = 2;
    a!.bumps = 0;
    a!.presents = 1;
    b!.presents = 1;
    a!.sleigh = { ...a!.sleigh, distance: 1234.5 };
    b!.sleigh = { ...b!.sleigh, distance: 2000 };
    game.end();
    const aw = game.awards();
    expect(aw.mostCorrect).toEqual({ value: 5, nicknames: ["B"] });
    // C never flew, so it can't be smoothest even with 0 bumps.
    expect(aw.smoothest).toEqual({ value: 0, nicknames: ["A"] });
    expect(aw.furthest).toEqual({ value: 2000, nicknames: ["B"] });
    expect(c!.flownMs).toBe(0);
    const st = game.standings();
    expect(st.map((s) => s.nickname)).toEqual(["B", "A", "C"]);
    expect(game.playerView(a!.id)!.result).toEqual({ rank: 2, playerCount: 3, presents: 1, distance: 1234.5, awards: ["Smoothest flyer"] });
    expect(game.playerView(b!.id)!.result).toMatchObject({ rank: 1, playerCount: 3, presents: 1, distance: 2000, awards: ["Most correct answers", "Furthest flown"] });
    expect(game.playerView(c!.id)!.result!.awards).toEqual([]);
    const host = game.hostView();
    expect(host.hasResults).toBe(true);
    expect(host.awards).toEqual(aw);
    expect(host.standings).toEqual(st);
    const lines = buildSleighResultsCsv(game).replace(/^﻿/, "").split(/\r?\n/);
    expect(lines[0]).toBe("Rank,Nickname,Presents,Distance (m),Correct,Wrong,Accuracy %,Bumps,Seconds flown");
    expect(lines[1]).toBe(`1,B,1,200,5,0,100,2,${Math.round(b!.flownMs / 100) / 10}`);
    expect(lines[2]).toBe(`2,A,1,123,3,0,100,0,${Math.round(a!.flownMs / 100) / 10}`);
    expect(lines[3]).toBe("3,C,0,0,0,1,0,0,0");
  });

  test("late joiners get the next launch slot and can play", () => {
    const { game, clock } = setup(["A", "B"]);
    const c = game.join("C");
    expect(c.sleigh).toEqual(launchSlot(2, 3));
    expect(c.current).not.toBeNull();
    earn(game, clock, "C", 2);
    toFlight(game, clock);
    expect(c.fuelStartMs).toBe(2 * SLEIGH_MS_PER_POINT);
    const d = game.join("D");
    expect(d.sleigh).toEqual(launchSlot(3, 4));
    expect(d.moving).toBe(false);
    finishFlight(game, clock);
    expect(d.sleigh).toEqual(launchSlot(3, 4));
    game.end();
    expect(() => game.join("E")).toThrow();
  });
});
