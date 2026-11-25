import { describe, expect, test } from "bun:test";
import type { BasePlayer } from "../src/server/game/roster.ts";
import type { AnswerTotals } from "../src/server/game/stream.ts";
import { StreamedSession } from "../src/server/game/streamed-session.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

type Phase = "countdown" | "playing" | "podium";
type TestPlayer = BasePlayer & AnswerTotals;

const COUNTDOWN_MS = 3000;

function setup({ minutes = 1 }: { minutes?: number } = {}) {
  const clock = new FakeClock();
  const calls = { change: 0, activity: 0, finish: 0 };
  const q = sampleQuiz();
  const session: StreamedSession<TestPlayer, Phase> = new StreamedSession<TestPlayer, Phase>({
    questions: q.questions,
    shuffleAnswers: false,
    clock,
    rng: () => 0,
    minutes,
    canAnswer: () => true,
    podium: { build: () => ({}), empty: () => ({}) },
    hub: {
      onChange: () => calls.change++,
      onActivity: () => calls.activity++,
      onFinish: () => calls.finish++,
    },
  });
  const newPlayer = (base: BasePlayer) => base;
  const join = (name: string) => session.join(name, null, newPlayer);
  const start = () =>
    session.start(COUNTDOWN_MS, () => {
      session.startGameLength("playing");
      for (const p of session.players.values()) session.stream.open(p);
    });
  return { clock, calls, session, join, start };
}

describe("Streamed session", () => {
  test("refuses a second start", () => {
    const { join, start, session } = setup();
    join("Ann");
    start();
    expect(session.phase).toBe("countdown");
    expect(start).toThrow("already started");
  });

  test("refuses to start with no players", () => {
    const { start, calls } = setup();
    expect(start).toThrow("at least one player");
    expect(calls.change).toBe(0);
  });

  test("refuses joins on the podium", () => {
    const { join, start, session } = setup();
    join("Ann");
    start();
    session.end();
    expect(() => join("Bob")).toThrow("finished");
    expect(session.players.size).toBe(1);
  });

  test("setConnected calls onChange only when the connected flag changes", () => {
    const { join, session, calls } = setup();
    const ann = join("Ann");
    const before = calls.change;
    session.setConnected(ann.id, true);
    expect(calls.change).toBe(before);
    session.setConnected(ann.id, false);
    expect(calls.change).toBe(before + 1);
    session.setConnected(ann.id, false);
    expect(calls.change).toBe(before + 1);
  });

  test("refuses an answer after the podium", () => {
    const { join, start, session, clock } = setup();
    const ann = join("Ann");
    start();
    clock.advance(COUNTDOWN_MS);
    const seq = session.stream.fragment(ann).question?.seq ?? 0;
    session.end();
    expect(session.answer(ann.id, seq, 0)).toBeNull();
  });

  test("finishes once when the game-length clock runs out after an early end", () => {
    const { join, start, session, clock, calls } = setup({ minutes: 1 });
    join("Ann");
    start();
    clock.advance(COUNTDOWN_MS);
    session.end();
    session.end();
    clock.advance(60_000);
    expect(session.phase).toBe("podium");
    expect(calls.finish).toBe(1);
  });

  test("finishes once when the game-length clock runs out", () => {
    const { join, start, session, clock, calls } = setup({ minutes: 1 });
    join("Ann");
    start();
    clock.advance(COUNTDOWN_MS + 60_000);
    session.end();
    expect(session.phase).toBe("podium");
    expect(calls.finish).toBe(1);
  });
});
