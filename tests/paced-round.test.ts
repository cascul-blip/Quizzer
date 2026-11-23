import { describe, expect, test } from "bun:test";
import type { PacedAnswer, PacedAnswerer } from "../src/server/game/paced-round.ts";
import { PacedRound } from "../src/server/game/paced-round.ts";
import { MAX_TYPED_ANSWER } from "../src/shared/answer-match.ts";
import type { Pacing } from "../src/shared/mode-views.ts";
import type { Question } from "../src/shared/quiz-schema.ts";
import { FakeClock } from "./helpers.ts";

const questions: Question[] = [
  { id: "a", type: "multiple_choice", text: "A?", timeLimitSec: 10, options: ["x", "y"], correct: [0], spots: undefined },
  { id: "b", type: "text", text: "B?", timeLimitSec: 5, options: ["answer"], correct: [0] },
];

function answerer(connected = true): PacedAnswerer<PacedAnswer> {
  return { connected, answers: [] };
}

function round(opts: { pacing?: Pacing; hideAutoCountdown?: boolean; asked?: PacedAnswerer<unknown>[] } = {}) {
  const clock = new FakeClock();
  const log: string[] = [];
  const asked = opts.asked ?? [];
  const paced = new PacedRound<"confidence" | "podium">(clock, {
    initial: "intro",
    pacing: opts.pacing ?? "manual",
    questions: () => questions,
    asked: () => asked,
    opensFrom: ["confidence"],
    hideAutoCountdown: opts.hideAutoCountdown,
    settle: () => log.push("settle"),
    advance: () => log.push("advance"),
    onChange: () => log.push("change"),
  });
  return { clock, log, paced };
}

describe("Paced question round", () => {
  test("the intro lasts 3 seconds, then the question opens with its deadline", () => {
    const { clock, paced } = round();
    paced.intro(0);
    expect(paced.phase).toBe("intro");
    clock.advance(2999);
    expect(paced.phase).toBe("intro");
    clock.advance(1);
    expect(paced.phase).toBe("open");
    expect(paced.phases.endsAt).toBe(clock.now() + 10_000);
    expect(paced.openedAt).toBe(clock.now());
  });

  test("answers are accepted until the deadline plus grace and rejected after", () => {
    const { clock, paced } = round();
    paced.intro(0);
    clock.advance(3000);
    clock.advance(10_000 + 500 - 1);
    expect(paced.accepts(0)).toBe(true);
    expect(paced.elapsedMs()).toBe(10_499);
    clock.advance(1);
    expect(paced.accepts(0)).toBe(false);
    expect(paced.phase).toBe("reveal");
  });

  test("the question closes only after the grace, and views count down to the deadline", () => {
    const { clock, log, paced } = round();
    paced.intro(0);
    clock.advance(3000);
    clock.advance(9999);
    expect(paced.view()?.remainingMs).toBe(1);
    clock.advance(1);
    expect(paced.view()?.remainingMs).toBe(0);
    expect(paced.phase).toBe("open");
    expect(paced.accepts(0)).toBe(true);
    clock.advance(499);
    expect(paced.accepts(0)).toBe(true);
    expect(log).not.toContain("settle");
    clock.advance(1);
    expect(paced.phase).toBe("reveal");
    expect(log.filter((l) => l === "settle")).toHaveLength(1);
    expect(paced.accepts(0)).toBe(false);
  });

  test("an answer for another question is not accepted", () => {
    const { clock, paced } = round();
    paced.intro(0);
    clock.advance(3000);
    expect(paced.accepts(1)).toBe(false);
    expect(paced.accepts(0)).toBe(true);
  });

  test("auto pacing moves on from the reveal after 5 seconds, manual pacing waits for the host", () => {
    const auto = round({ pacing: "auto" });
    auto.paced.intro(0);
    auto.paced.skip();
    auto.paced.skip();
    expect(auto.paced.phase).toBe("reveal");
    auto.clock.advance(4999);
    expect(auto.log).not.toContain("advance");
    auto.clock.advance(1);
    expect(auto.log).toContain("advance");

    const manual = round();
    manual.paced.intro(0);
    manual.paced.skip();
    manual.paced.skip();
    manual.clock.advance(60_000);
    expect(manual.log).not.toContain("advance");
    manual.paced.next();
    expect(manual.log).toContain("advance");
  });

  test("a countdown shows for an auto reveal unless the mode hides it", () => {
    for (const [hide, remaining] of [
      [false, 5000],
      [true, 0],
    ] as const) {
      const { paced } = round({ pacing: "auto", hideAutoCountdown: hide });
      paced.intro(0);
      paced.skip();
      paced.skip();
      expect(paced.phases.remainingMs()).toBe(remaining);
      expect(paced.view()?.remainingMs).toBe(0);
    }
  });

  test("changing pacing during the reveal schedules or cancels the auto advance", () => {
    const { clock, log, paced } = round();
    paced.intro(0);
    paced.skip();
    paced.skip();
    paced.setPacing("auto");
    clock.advance(5000);
    expect(log.filter((l) => l === "advance")).toHaveLength(1);

    const other = round({ pacing: "auto" });
    other.paced.intro(0);
    other.paced.skip();
    other.paced.skip();
    other.clock.advance(4000);
    other.paced.setPacing("manual");
    other.clock.advance(60_000);
    expect(other.log).not.toContain("advance");
  });

  test("next and skip step through intro, open and reveal; skipping a reveal does nothing", () => {
    const { log, paced } = round();
    paced.intro(0);
    paced.next();
    expect(paced.phase).toBe("open");
    paced.next();
    expect(paced.phase).toBe("reveal");
    paced.skip();
    expect(log).not.toContain("advance");
    expect(paced.phase).toBe("reveal");
  });

  test("a phase of the mode's own opens the question and shows no options before it", () => {
    const { clock, paced } = round();
    paced.begin(0);
    paced.phases.set("confidence", 20_000, () => paced.open());
    expect(paced.view()).toMatchObject({ options: [], remainingMs: 20_000 });
    clock.advance(20_000);
    expect(paced.phase).toBe("open");
    expect(paced.view()?.options).toEqual(["x", "y"]);
  });

  test("a typed question's accepted answers stay hidden until the reveal", () => {
    const { paced } = round();
    paced.intro(1);
    paced.skip();
    expect(paced.view()?.options).toEqual([]);
    paced.skip();
    expect(paced.view()?.options).toEqual(["answer"]);
  });

  test("closing a question that is not open does nothing", () => {
    const { log, paced } = round();
    paced.intro(0);
    paced.close();
    expect(log).not.toContain("settle");
    expect(paced.phase).toBe("intro");
  });

  test("the view has no question before the first", () => {
    expect(round().paced.view()).toBeNull();
  });

  describe("taking answers", () => {
    const keep = (a: PacedAnswer) => a;
    const openAt = (index: number, asked: PacedAnswerer<unknown>[] = []) => {
      const r = round({ asked });
      r.paced.intro(index);
      r.clock.advance(3000);
      return r;
    };

    test("an answer inside grace is accepted and recorded with its time", () => {
      const p = answerer();
      const { clock, paced } = openAt(0, [p, answerer()]);
      clock.advance(10_499);
      expect(paced.take(p, 0, 1, keep)).toEqual({ option: 1, correct: false, ms: 10_499 });
      expect(p.answers[0]).toEqual({ option: 1, correct: false, ms: 10_499 });
    });

    test("an answer after grace is refused", () => {
      const p = answerer();
      const { clock, paced } = openAt(0, [p]);
      clock.advance(10_500);
      expect(paced.take(p, 0, 0, keep)).toBeNull();
      expect(p.answers[0]).toBeUndefined();
    });

    test("a duplicate answer is refused and the first one kept", () => {
      const p = answerer();
      const { paced } = openAt(0, [p, answerer()]);
      expect(paced.take(p, 0, 0, keep)?.correct).toBe(true);
      expect(paced.take(p, 0, 1, keep)).toBeNull();
      expect(p.answers[0]?.option).toBe(0);
    });

    test("an answer for another question, before opening, or that does not fit is refused", () => {
      const p = answerer();
      const r = round({ asked: [p] });
      r.paced.intro(0);
      expect(r.paced.take(p, 0, 0, keep)).toBeNull();
      r.clock.advance(3000);
      expect(r.paced.take(p, 1, 0, keep)).toBeNull();
      expect(r.paced.take(p, 0, 7, keep)).toBeNull();
      expect(r.paced.take(undefined, 0, 0, keep)).toBeNull();
    });

    test("typed text is cut to the maximum length, and the mode adds its own fields", () => {
      const p: PacedAnswerer<PacedAnswer & { points: number }> = { connected: true, answers: [] };
      const { paced } = openAt(1, [p, answerer()]);
      const taken = paced.take(p, 1, "x".repeat(500), (a) => ({ ...a, points: 7 }));
      expect(taken?.option).toBe(-1);
      expect(taken?.text?.length).toBe(MAX_TYPED_ANSWER);
      expect(taken?.points).toBe(7);
    });

    test("typed answers stay hidden until the reveal, and the phone sees its own answer only while open or revealed", () => {
      const p = answerer();
      const { paced } = openAt(1, [p, answerer()]);
      expect(paced.view()?.options).toEqual([]);
      paced.take(p, 1, "answers", keep);
      expect(paced.shownAnswer(p)?.correct).toBe(true);
      paced.close();
      expect(paced.view()?.options).toEqual(["answer"]);
      expect(paced.shownAnswer(p)?.text).toBe("answers");
      paced.intro(0);
      expect(paced.shownAnswer(p)).toBeUndefined();
    });

    test("the round closes early once everyone connected who is asked has answered", () => {
      const a = answerer();
      const b = answerer();
      const away = answerer(false);
      const notAsked = answerer();
      const { log, paced } = openAt(0, [a, b, away]);
      paced.take(a, 0, 0, keep);
      expect(paced.closeIfAllAnswered()).toBe(false);
      expect(paced.phase).toBe("open");
      paced.take(notAsked, 0, 0, keep);
      expect(paced.closeIfAllAnswered()).toBe(false);
      paced.take(b, 0, 1, keep);
      expect(paced.closeIfAllAnswered()).toBe(true);
      expect(paced.phase).toBe("reveal");
      expect(log.filter((l) => l === "settle")).toHaveLength(1);
      expect(paced.closeIfAllAnswered()).toBe(false);
    });

    test("with nobody connected asked, the round does not close early", () => {
      const { paced } = openAt(0, [answerer(false)]);
      expect(paced.closeIfAllAnswered()).toBe(false);
      expect(paced.phase).toBe("open");
    });
  });
});
