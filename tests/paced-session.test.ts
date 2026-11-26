import { describe, expect, test } from "bun:test";
import type { PacedAnswer } from "../src/server/game/paced-round.ts";
import { PacedSession } from "../src/server/game/paced-session.ts";
import type { BasePlayer } from "../src/server/game/roster.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

type TestPlayer = BasePlayer & { answers: (PacedAnswer | undefined)[] };

function setup() {
  const clock = new FakeClock();
  const calls = { change: 0, activity: 0, finish: 0 };
  const events: string[] = [];
  const seen: string[] = [];
  const questions = sampleQuiz().questions;
  const session: PacedSession<TestPlayer, never, string[]> = new PacedSession<TestPlayer, never, string[]>({
    game: null,
    clock,
    rng: () => 0,
    initial: "intro",
    pacing: "manual",
    questions: () => questions,
    settle: () => events.push("settle"),
    advance: () => session.paced.intro(session.paced.qIndex + 1),
    cleanup: () => events.push("cleanup"),
    podium: { build: () => [...events], empty: () => [] },
    hub: {
      onChange: () => {
        calls.change++;
        seen.push(session.phase);
      },
      onActivity: () => calls.activity++,
      onFinish: () => calls.finish++,
    },
  });
  const join = (name: string) => session.addPlayer(name, null, (base) => ({ ...base, answers: [] }));
  const start = () => session.start(() => session.paced.intro(0));
  const open = () => {
    start();
    session.paced.open();
  };
  const answer = (p: TestPlayer) => {
    if (!session.paced.take(p, session.paced.qIndex, 0, (a) => a)) throw new Error("refused");
    session.answered(p.id);
  };
  return { clock, calls, events, seen, session, join, start, open, answer };
}

describe("Paced session", () => {
  test("refuses a second start", () => {
    const { join, start } = setup();
    join("Ann");
    start();
    expect(start).toThrow("The game has already started");
  });

  test("refuses to start once finished", () => {
    const { join, session, calls } = setup();
    join("Ann");
    session.end();
    const changes = calls.change;
    expect(() => session.start(() => session.paced.intro(0))).toThrow("This game has finished");
    expect(session.phase).toBe("podium");
    expect(calls.change).toBe(changes);
  });

  test("a start whose first step throws can be retried", () => {
    const { join, session, start } = setup();
    join("Ann");
    expect(() =>
      session.start(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    start();
    expect(session.phase).toBe("intro");
  });

  test("a quiet disconnect marks the player without broadcasting", () => {
    const { join, open, session, calls } = setup();
    const ann = join("Ann");
    join("Bob");
    open();
    calls.change = 0;
    expect(session.markDisconnectedQuietly(ann.id)).toBe(true);
    expect(ann.connected).toBe(false);
    expect(calls.change).toBe(0);
    expect(session.markDisconnectedQuietly(ann.id)).toBe(false);
    expect(session.markDisconnectedQuietly("nobody")).toBe(false);
  });

  test("refuses to start with no players", () => {
    const { start, calls } = setup();
    expect(start).toThrow("Wait for at least one player to join");
    expect(calls.change).toBe(0);
  });

  test("refuses joins once finished", () => {
    const { join, start, session } = setup();
    join("Ann");
    start();
    session.end();
    expect(() => join("Bob")).toThrow("This game has finished");
  });

  test("end during an open question settles and reveals it before the podium", () => {
    const { join, open, session, events, calls, seen } = setup();
    join("Ann");
    open();
    seen.length = 0;
    session.end();
    expect(seen).toEqual(["reveal", "podium"]);
    expect(session.phase).toBe("podium");
    expect(session.podium).toEqual(["settle", "cleanup"]);
    expect(calls.finish).toBe(1);
    expect(events).toEqual(["settle", "cleanup"]);
  });

  test("a second end does nothing", () => {
    const { join, open, session, calls } = setup();
    join("Ann");
    open();
    session.end();
    const changes = calls.change;
    session.end();
    expect(calls.finish).toBe(1);
    expect(calls.change).toBe(changes);
  });

  test("a disconnect broadcasts once", () => {
    const { join, open, session, calls } = setup();
    const ann = join("Ann");
    join("Bob");
    open();
    calls.change = 0;
    session.setConnected(ann.id, false);
    expect(calls.change).toBe(1);
    expect(session.phase).toBe("open");
    session.setConnected(ann.id, false);
    expect(calls.change).toBe(1);
  });

  test("an answer reports activity once and leaves the question open", () => {
    const { join, open, session, calls, answer } = setup();
    const ann = join("Ann");
    join("Bob");
    open();
    calls.change = 0;
    answer(ann);
    expect(calls.activity).toBe(1);
    expect(calls.change).toBe(0);
    expect(session.phase).toBe("open");
  });

  test("the last asked player's answer closes the question early, broadcasting once", () => {
    const { join, open, session, calls, answer, events } = setup();
    const ann = join("Ann");
    const bob = join("Bob");
    open();
    answer(ann);
    calls.change = 0;
    calls.activity = 0;
    answer(bob);
    expect(session.phase).toBe("reveal");
    expect(events).toEqual(["settle"]);
    expect(calls.change + calls.activity).toBe(1);
  });

  test("the last unanswered player disconnecting closes the question early, broadcasting once", () => {
    const { join, open, session, calls, answer } = setup();
    const ann = join("Ann");
    const bob = join("Bob");
    open();
    answer(ann);
    calls.change = 0;
    session.setConnected(bob.id, false);
    expect(session.phase).toBe("reveal");
    expect(calls.change).toBe(1);
  });

  test("a reconnect broadcasts once", () => {
    const { join, session, calls } = setup();
    const ann = join("Ann");
    session.setConnected(ann.id, false);
    calls.change = 0;
    session.setConnected(ann.id, true);
    expect(calls.change).toBe(1);
  });

  test("removing the last unanswered player closes the question early, broadcasting once", () => {
    const { join, open, session, calls, answer } = setup();
    const ann = join("Ann");
    const bob = join("Bob");
    open();
    answer(ann);
    calls.change = 0;
    session.removePlayer(bob.id);
    expect(calls.change).toBe(0);
    session.playerLeft();
    expect(session.phase).toBe("reveal");
    expect(calls.change).toBe(1);
  });

  test("set pacing applies at once and broadcasts once", () => {
    const { join, open, session, calls, clock } = setup();
    join("Ann");
    open();
    session.paced.close();
    calls.change = 0;
    session.setPacing("auto");
    expect(session.pacing).toBe("auto");
    expect(calls.change).toBe(1);
    clock.advance(60_000);
    expect(session.phase).toBe("intro");
  });
});
