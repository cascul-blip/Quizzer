import { describe, expect, test } from "bun:test";
import { COUNTDOWN_MS, CupGame, FEEDBACK_MS, type CupPlayer } from "../src/server/game/cup.ts";
import { Game } from "../src/server/game/game.ts";
import { buildCupResultsCsv } from "../src/server/game/results.ts";
import { CUP_ALL_SAFE_MS, CUP_DEFAULT_CUPS, CUP_DRINK_MS, CUP_MAX_CUPS, CUP_MIN_CUPS, CUP_QUIZ_MIN_MS, CUP_ROLL_MS, CUP_SIP_MS, CUP_VERDICT_MS, cupQuizMs } from "../src/shared/protocol.ts";
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

/** Deterministic rng. */
function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

/** An rng that plays back fixed values, then falls back to a seeded one. */
function scripted(values: number[]) {
  const rest = seeded();
  return { values, rng: () => (values.length > 0 ? values.shift()! : rest()) };
}

function setup(names: string[], rng: () => number = seeded(), cups = CUP_DEFAULT_CUPS) {
  const clock = new FakeClock();
  let finished = 0;
  const lobby = new Game(quiz(), { clock });
  lobby.setMode("cup");
  lobby.setCup({ cups });
  for (const n of names) lobby.join(n);
  const game = CupGame.fromLobby(lobby, { clock, rng, onFinish: () => finished++ });
  game.start();
  clock.advance(COUNTDOWN_MS);
  expect(game.phase).toBe("roll");
  return { clock, game, finished: () => finished };
}

const byName = (game: CupGame, name: string) => [...game.players.values()].find((p) => p.nickname === name)!;

function answer(game: CupGame, clock: FakeClock, p: CupPlayer, right: boolean) {
  const cur = p.current!;
  const option = right ? cur.correct[0]! : cur.options.findIndex((_, i) => !cur.correct.includes(i));
  expect(game.answer(p.id, cur.seq, option)).toBe(true);
  clock.advance(FEEDBACK_MS);
}

/** Answer enough right to be safe this round. */
function makeSafe(game: CupGame, clock: FakeClock, p: CupPlayer) {
  while (!p.safe) answer(game, clock, p, true);
}

function toQuiz(game: CupGame, clock: FakeClock) {
  clock.advance(game.phaseEndsAt - clock.now());
  expect(game.phase).toBe("quiz");
}

/** Run out the quiz clock. */
function endQuiz(game: CupGame, clock: FakeClock) {
  clock.advance(game.phaseEndsAt - clock.now());
}

describe("Cup of Death", () => {
  test("quiz timer: 30 s, 2 s shorter each round, never under 10 s", () => {
    expect([1, 2, 3, 10, 11, 12, 30].map(cupQuizMs)).toEqual([30_000, 28_000, 26_000, 12_000, 10_000, 10_000, 10_000]);
    expect(cupQuizMs(100)).toBe(CUP_QUIZ_MIN_MS);
  });

  test("everyone starts with 3 cups (the default) and rolls a die from 1 to 6 each round", () => {
    const { game, clock } = setup(["A", "B", "C", "D", "E", "F", "G", "H"]);
    for (const p of game.players.values()) {
      expect(p.cups).toBe(CUP_DEFAULT_CUPS);
      expect(p.target).toBeGreaterThanOrEqual(1);
      expect(p.target).toBeLessThanOrEqual(6);
      expect(p.safe).toBe(false);
    }
    expect(game.hostView().phaseDurationMs).toBe(CUP_ROLL_MS);
    // No questions while the dice tumble.
    expect(game.playerView(byName(game, "A").id)!.question).toBeNull();
    toQuiz(game, clock);
    expect(game.phaseDurationMs).toBe(30_000);
    expect(game.playerView(byName(game, "A").id)!.question).not.toBeNull();
  });

  test("reaching the dice number makes a player safe; wrong answers just move on", () => {
    const { game, clock } = setup(["A", "B"]);
    const a = byName(game, "A");
    a.target = 2;
    toQuiz(game, clock);
    answer(game, clock, a, false);
    expect(a.progress).toBe(0);
    answer(game, clock, a, true);
    expect(a.progress).toBe(1);
    expect(a.safe).toBe(false);
    answer(game, clock, a, true);
    expect(a.safe).toBe(true);
    // Safe players stop getting questions and can't answer.
    expect(game.playerView(a.id)!.question).toBeNull();
    expect(game.answer(a.id, a.current!.seq, 0)).toBe(false);
    expect(game.hostView().players.find((p) => p.id === a.id)).toMatchObject({ safe: true, progress: 2, target: 2 });
  });

  test("the quiz ends early once every living player is safe, and nobody drinks", () => {
    const { game, clock } = setup(["A", "B"]);
    toQuiz(game, clock);
    makeSafe(game, clock, byName(game, "A"));
    expect(game.phase).toBe("quiz");
    makeSafe(game, clock, byName(game, "B"));
    expect(game.phase).toBe("reveal");
    expect(game.hostView().reveal).toMatchObject({ drinks: [], current: -1 });
    clock.advance(CUP_ALL_SAFE_MS);
    expect(game.phase).toBe("roll");
    expect(game.round).toBe(2);
    expect(byName(game, "A").safeRounds).toBe(1);
    expect(byName(game, "A").cups).toBe(CUP_DEFAULT_CUPS);
  });

  test("players who fall short pick a cup; a safe drink costs them that cup", () => {
    const { rng, values } = scripted([]);
    const { game, clock } = setup(["A", "B"], rng);
    const a = byName(game, "A");
    const b = byName(game, "B");
    toQuiz(game, clock);
    makeSafe(game, clock, a);
    endQuiz(game, clock);
    expect(game.phase).toBe("drink");
    expect(game.drinkers).toEqual([b.id]);
    expect(game.playerView(b.id)!.drink).toEqual({ picked: null });
    expect(game.playerView(a.id)!.drink).toBeNull();
    expect(game.hostView().players.find((p) => p.id === b.id)).toMatchObject({ drinker: true, picked: false });
    // A's not drinking, and B can only pick a cup that's there.
    expect(game.pick(a.id, 0)).toBe(false);
    expect(game.pick(b.id, CUP_DEFAULT_CUPS)).toBe(false);
    // The poison goes in the last cup; B drinks cup 1.
    values.push(0.9);
    expect(game.pick(b.id, 1)).toBe(true);
    // Everyone has picked: the reveal starts at once.
    expect(game.phase).toBe("reveal");
    expect(game.pick(b.id, 0)).toBe(false);
    let r = game.hostView().reveal!;
    expect(r.current).toBe(0);
    expect(r.drinks).toEqual([{ id: b.id, cup: 1, cupsBefore: CUP_DEFAULT_CUPS, auto: false, verdict: null }]);
    expect(game.playerView(b.id)!.myDrink).toMatchObject({ turn: true, waiting: false, verdict: null });
    clock.advance(CUP_SIP_MS);
    r = game.hostView().reveal!;
    expect(r.drinks[0]!.verdict).toBe("safe");
    expect(b.cups).toBe(CUP_DEFAULT_CUPS - 1);
    expect(b.drinksSurvived).toBe(1);
    clock.advance(CUP_VERDICT_MS);
    expect(game.phase).toBe("roll");
    expect(b.outRound).toBeNull();
  });

  test("a poisoned drink knocks the player out; they keep answering for practice", () => {
    const { rng, values } = scripted([]);
    const { game, clock } = setup(["A", "B", "C"], rng);
    const a = byName(game, "A");
    const c = byName(game, "C");
    toQuiz(game, clock);
    makeSafe(game, clock, a);
    makeSafe(game, clock, c);
    endQuiz(game, clock);
    const b = byName(game, "B");
    values.push(0); // poison in cup 0
    game.pick(b.id, 0);
    clock.advance(CUP_SIP_MS);
    expect(b.outRound).toBe(1);
    expect(b.poisonedFrom).toBe(CUP_DEFAULT_CUPS);
    expect(game.hostView().players.find((p) => p.id === b.id)!.out).toBe(true);
    clock.advance(CUP_VERDICT_MS);
    expect(game.phase).toBe("roll");
    // Poisoned players answer any time, but it doesn't count toward anything.
    expect(game.playerView(b.id)!.question).not.toBeNull();
    answer(game, clock, b, true);
    expect(b.progress).toBe(0);
    expect(b.target).toBe(0);
    expect(game.playerView(b.id)!.me.out).toBe(true);
  });

  test("the lobby sets the cups, 1 to 6, 3 by default", () => {
    const lobby = new Game(quiz(), { clock: new FakeClock() });
    expect(lobby.cup.cups).toBe(CUP_DEFAULT_CUPS);
    expect(lobby.hostView().cup).toEqual({ cups: CUP_DEFAULT_CUPS });
    for (const cups of [0, 7, 2.5, NaN]) expect(() => lobby.setCup({ cups })).toThrow();
    for (let cups = CUP_MIN_CUPS; cups <= CUP_MAX_CUPS; cups++) lobby.setCup({ cups });
    expect(lobby.cup.cups).toBe(CUP_MAX_CUPS);
  });

  for (let cups = CUP_MIN_CUPS; cups <= CUP_MAX_CUPS; cups++) {
    test(`with ${cups} cups, they run out one by one, and the last cup is certain death`, () => {
      const { rng, values } = scripted([]);
      const { game, clock } = setup(["A", "B"], rng, cups);
      const a = byName(game, "A");
      const b = byName(game, "B");
      expect(b.cups).toBe(cups);
      expect(game.hostView().startCups).toBe(cups);
      expect(game.playerView(b.id)!.startCups).toBe(cups);
      for (let round = 1; round <= cups; round++) {
        toQuiz(game, clock);
        makeSafe(game, clock, a);
        endQuiz(game, clock);
        expect(game.phase).toBe(round < cups ? "drink" : "reveal");
        if (round < cups) {
          // Poison is in the last cup; B drinks the first.
          values.push(0.999);
          game.pick(b.id, 0);
        }
        const drink = game.hostView().reveal!.drinks[0]!;
        expect(drink.cupsBefore).toBe(cups + 1 - round);
        expect(drink.auto).toBe(round === cups);
        clock.advance(CUP_SIP_MS + CUP_VERDICT_MS);
        if (round < cups) expect(b.cups).toBe(cups - round);
      }
      expect(b.outRound).toBe(cups);
      expect(b.poisonedFrom).toBe(1);
      expect(game.phase).toBe("podium");
      // B survived their first cup, or (with one cup) there was no luck in it: no "Unluckiest".
      expect(game.awards().unluckiest).toBeNull();
    });
  }

  test("anyone who doesn't pick in time gets a random cup", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    toQuiz(game, clock);
    endQuiz(game, clock);
    expect(game.phase).toBe("drink");
    expect(game.drinkers.length).toBe(3);
    game.pick(byName(game, "A").id, 2);
    clock.advance(CUP_DRINK_MS);
    expect(game.phase).toBe("reveal");
    const drinks = game.hostView().reveal!.drinks;
    expect(drinks.length).toBe(3);
    for (const d of drinks) {
      expect(d.auto).toBe(d.id !== byName(game, "A").id);
      expect(d.cup).toBeGreaterThanOrEqual(0);
      expect(d.cup).toBeLessThan(CUP_DEFAULT_CUPS);
    }
    expect(drinks.find((d) => d.id === byName(game, "A").id)!.cup).toBe(2);
    // The reveal lasts one sip and one verdict per drinker.
    expect(game.phaseDurationMs).toBe(3 * (CUP_SIP_MS + CUP_VERDICT_MS));
  });

  test("the reveal goes one drinker at a time", () => {
    const { rng, values } = scripted([]);
    const { game, clock } = setup(["A", "B", "C"], rng);
    toQuiz(game, clock);
    makeSafe(game, clock, byName(game, "A"));
    endQuiz(game, clock);
    const [first, second] = game.drinkers;
    game.pick(first!, 0);
    // Poison draws: first drinker safe (cup 2), second poisoned (cup 0).
    values.push(0.9, 0);
    game.pick(second!, 0);
    let r = game.hostView().reveal!;
    expect(r.drinks.map((d) => d.id)).toEqual([first!, second!]);
    expect(game.playerView(second!)!.myDrink).toMatchObject({ turn: false, waiting: true });
    clock.advance(CUP_SIP_MS);
    r = game.hostView().reveal!;
    expect([r.current, r.drinks[0]!.verdict, r.drinks[1]!.verdict]).toEqual([0, "safe", null]);
    clock.advance(CUP_VERDICT_MS);
    r = game.hostView().reveal!;
    expect([r.current, r.drinks[1]!.verdict]).toEqual([1, null]);
    expect(game.players.get(second!)!.outRound).toBeNull();
    clock.advance(CUP_SIP_MS);
    expect(game.hostView().reveal!.drinks[1]!.verdict).toBe("poison");
    expect(game.players.get(second!)!.outRound).toBe(1);
  });

  test("last one standing wins", () => {
    const { rng, values } = scripted([]);
    const { game, clock, finished } = setup(["A", "B"], rng);
    toQuiz(game, clock);
    makeSafe(game, clock, byName(game, "A"));
    endQuiz(game, clock);
    values.push(0);
    game.pick(byName(game, "B").id, 0);
    clock.advance(CUP_SIP_MS + CUP_VERDICT_MS);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    const s = game.standings();
    expect(s.map((x) => [x.nickname, x.rank])).toEqual([
      ["A", 1],
      ["B", 2],
    ]);
    expect(game.playerView(byName(game, "A").id)!.result).toMatchObject({ rank: 1, won: true });
  });

  test("if everyone left is poisoned in the same round, they share the win", () => {
    const { rng, values } = scripted([]);
    const { game, clock } = setup(["A", "B", "C"], rng);
    const c = byName(game, "C");
    // Round 1: C is poisoned; A and B survive.
    toQuiz(game, clock);
    endQuiz(game, clock);
    for (const id of game.drinkers) {
      values.push(game.players.get(id) === c ? 0 : 0.999);
      game.pick(id, 0);
    }
    clock.advance(game.phaseEndsAt - clock.now());
    expect(c.outRound).toBe(1);
    expect(game.phase).toBe("roll");
    // Round 2: A and B both poisoned.
    toQuiz(game, clock);
    endQuiz(game, clock);
    values.push(0);
    game.pick(game.drinkers[0]!, 0);
    values.push(0);
    game.pick(game.drinkers[1]!, 0);
    clock.advance(game.phaseEndsAt - clock.now());
    expect(game.phase).toBe("podium");
    const s = game.standings();
    expect(s.filter((x) => x.rank === 1).map((x) => x.nickname).sort()).toEqual(["A", "B"]);
    expect(s.find((x) => x.nickname === "C")!.rank).toBe(3);
    expect(buildCupResultsCsv(game)).toContain("Winner");
  });

  test("a solo game runs until its player is poisoned", () => {
    const { rng, values } = scripted([]);
    const { game, clock } = setup(["Solo"], rng);
    const p = byName(game, "Solo");
    toQuiz(game, clock);
    makeSafe(game, clock, p);
    clock.advance(CUP_ALL_SAFE_MS);
    expect(game.phase).toBe("roll");
    toQuiz(game, clock);
    endQuiz(game, clock);
    values.push(0);
    game.pick(p.id, 0);
    clock.advance(CUP_SIP_MS + CUP_VERDICT_MS);
    expect(game.phase).toBe("podium");
    expect(game.standings()[0]).toMatchObject({ rank: 1, outRound: 2 });
  });

  test("the drink phase doesn't wait for disconnected players", () => {
    const { game, clock } = setup(["A", "B"]);
    toQuiz(game, clock);
    game.setConnected(byName(game, "B").id, false);
    endQuiz(game, clock);
    expect(game.phase).toBe("drink");
    game.pick(byName(game, "A").id, 0);
    expect(game.phase).toBe("reveal");
    expect(game.hostView().reveal!.drinks.find((d) => d.id === byName(game, "B").id)!.auto).toBe(true);
  });

  test("ending mid-reveal still counts the drinks already poured", () => {
    const { rng, values } = scripted([]);
    const { game, clock } = setup(["A", "B", "C"], rng);
    toQuiz(game, clock);
    makeSafe(game, clock, byName(game, "A"));
    makeSafe(game, clock, byName(game, "B"));
    endQuiz(game, clock);
    values.push(0);
    game.pick(byName(game, "C").id, 0);
    expect(game.phase).toBe("reveal");
    game.end();
    expect(game.phase).toBe("podium");
    expect(byName(game, "C").outRound).toBe(1);
  });

  test("awards", () => {
    const { rng, values } = scripted([]);
    const { game, clock } = setup(["A", "B", "C"], rng);
    const [a, c] = ["A", "C"].map((n) => byName(game, n)) as [CupPlayer, CupPlayer];
    toQuiz(game, clock);
    makeSafe(game, clock, a);
    endQuiz(game, clock);
    // B survives, C is poisoned by the first cup they drink.
    for (const id of game.drinkers) {
      values.push(id === c.id ? 0 : 0.999);
      game.pick(id, 0);
    }
    clock.advance(game.phaseEndsAt - clock.now());
    game.end();
    const aw = game.awards();
    expect(aw.mostCorrect!.nicknames).toEqual(["A"]);
    expect(aw.luckiest).toEqual({ value: 1, nicknames: ["B"] });
    expect(aw.neverThirsty).toEqual({ value: 1, nicknames: ["A"] });
    expect(aw.unluckiest).toEqual({ value: 1, nicknames: ["C"] });
    expect(game.playerView(c.id)!.result!.awards).toEqual(["Unluckiest"]);
  });

  test("late joiners roll in during the quiz, and sit out a drink already under way", () => {
    const { game, clock } = setup(["A", "B"]);
    toQuiz(game, clock);
    const late = game.join("Late");
    expect(late.target).toBeGreaterThanOrEqual(1);
    expect(late.safe).toBe(false);
    endQuiz(game, clock);
    expect(game.drinkers).toContain(late.id);
    const later = game.join("Later");
    expect(later.safe).toBe(true);
    expect(game.drinkers).not.toContain(later.id);
  });
});
