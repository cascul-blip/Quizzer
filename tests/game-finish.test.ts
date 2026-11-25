import { describe, expect, test } from "bun:test";
import { GameFinish, PhaseTimer } from "../src/server/game/phase-timer.ts";
import { FakeClock } from "./helpers.ts";

type Phase = "playing" | "podium";

function setup(onFinish: () => void = () => {}) {
  const clock = new FakeClock();
  const timer = new PhaseTimer<Phase>(clock, "playing");
  const calls: string[] = [];
  const finish = new GameFinish(timer, "podium", {
    cleanup: () => calls.push(`cleanup:${timer.phase}`),
    onFinish: () => {
      calls.push(`finish:${timer.phase}`);
      onFinish();
    },
    onChange: () => calls.push("change"),
  });
  return { clock, timer, finish, calls };
}

describe("Game finish", () => {
  test("cleans up, enters the podium, hands the game over, then broadcasts", () => {
    const { timer, finish, calls } = setup();
    finish.finish();
    expect(calls).toEqual(["cleanup:playing", "finish:podium", "change"]);
    expect([timer.phase, finish.finished]).toEqual(["podium", true]);
  });

  test("finishing twice runs the steps once", () => {
    const { finish, calls } = setup();
    finish.finish();
    finish.finish();
    expect(calls).toEqual(["cleanup:playing", "finish:podium", "change"]);
  });

  test("cancels the phase timer and every slot", () => {
    const { clock, timer, finish } = setup();
    const fired: string[] = [];
    timer.set("playing", 1000, () => fired.push("phase"));
    timer.after("slot", 500, () => fired.push("slot"));
    finish.finish();
    clock.advance(5000);
    expect(fired).toEqual([]);
    expect(timer.remainingMs()).toBe(0);
  });

  test("a clean-up that throws still cancels the timers, enters the podium and broadcasts", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "playing");
    const calls: string[] = [];
    const fired: string[] = [];
    timer.set("playing", 1000, () => fired.push("phase"));
    const finish = new GameFinish(timer, "podium", {
      cleanup: () => {
        throw new Error("cleanup");
      },
      onFinish: () => calls.push("finish"),
      onChange: () => calls.push("change"),
    });
    expect(() => finish.finish()).toThrow("cleanup");
    clock.advance(5000);
    expect([timer.phase, fired, calls]).toEqual(["podium", [], ["change"]]);
  });

  test("works out the podium after the clean-up, before handing the game over", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "playing");
    const calls: string[] = [];
    const finish = new GameFinish(timer, "podium", {
      cleanup: () => calls.push("cleanup"),
      podium: { build: () => (calls.push("podium"), "built"), empty: () => "empty" },
      onFinish: () => calls.push(`finish:${finish.podium}`),
      onChange: () => calls.push("change"),
    });
    expect(() => finish.podium).toThrow("This game has not finished");
    finish.finish();
    expect(calls).toEqual(["cleanup", "podium", "finish:built", "change"]);
  });

  test("a podium that fails to build leaves an empty podium, still hands the game over, and reaches the caller", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "playing");
    const calls: string[] = [];
    const finish = new GameFinish(timer, "podium", {
      podium: {
        build: (): string => {
          throw new Error("podium");
        },
        empty: () => "empty",
      },
      onFinish: () => calls.push(`finish:${finish.podium}`),
      onChange: () => calls.push("change"),
    });
    expect(() => finish.finish()).toThrow("podium");
    expect([timer.phase, finish.podium, calls]).toEqual(["podium", "empty", ["finish:empty", "change"]]);
  });

  test("a clean-up that throws still works out the podium", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "playing");
    const finish = new GameFinish(timer, "podium", {
      cleanup: () => {
        throw new Error("cleanup");
      },
      podium: { build: () => "built", empty: () => "empty" },
      onFinish: () => {},
      onChange: () => {},
    });
    expect(() => finish.finish()).toThrow("cleanup");
    expect(finish.podium).toBe("built");
  });

  test("an onFinish that throws still broadcasts and reaches the caller", () => {
    const { finish, calls, timer } = setup(() => {
      throw new Error("boom");
    });
    expect(() => finish.finish()).toThrow("boom");
    expect(calls.at(-1)).toBe("change");
    expect(timer.phase).toBe("podium");
    finish.finish();
    expect(calls.filter((c) => c === "change")).toHaveLength(1);
  });
});
