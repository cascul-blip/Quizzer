import { describe, expect, test } from "bun:test";
import { Lobby } from "../src/server/game/lobby.ts";
import { GameFinish, GameLengthClock, PhaseTimer } from "../src/server/game/phase-timer.ts";
import { RobotGame } from "../src/server/game/robot.ts";
import { COUNTDOWN_MS, TowerGame } from "../src/server/game/tower.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

type Phase = "countdown" | "playing" | "podium";

describe("Phase timer", () => {
  test("setting a new phase cancels the pending continuation of the previous one", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "countdown");
    const fired: string[] = [];
    timer.set("countdown", 1000, () => fired.push("countdown"));
    clock.advance(999);
    timer.set("playing", 5000, () => fired.push("playing"));
    clock.advance(1);
    expect(fired).toEqual([]);
    clock.advance(4999);
    expect(fired).toEqual(["playing"]);
    expect(timer.phase).toBe("playing");
  });

  test("a phase continuation that sets the next phase leaves one pending timer", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "countdown");
    const fired: string[] = [];
    timer.set("countdown", 1000, () => {
      fired.push("countdown");
      timer.set("playing", 1000, () => fired.push("playing"));
    });
    clock.advance(2000);
    expect(fired).toEqual(["countdown", "playing"]);
  });

  test("remaining ms and progress are right at the start, midway and after expiry", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "countdown");
    timer.set("playing", 4000, () => {});
    expect([timer.remainingMs(), timer.progress(), timer.durationMs, timer.endsAt]).toEqual([4000, 0, 4000, clock.now() + 4000]);
    clock.advance(1000);
    expect([timer.remainingMs(), timer.progress()]).toEqual([3000, 0.25]);
    clock.advance(3000);
    expect([timer.remainingMs(), timer.progress()]).toEqual([0, 1]);
    clock.advance(10_000);
    expect([timer.remainingMs(), timer.progress()]).toEqual([0, 1]);
  });

  test("a phase with no countdown reads zero remaining and zero progress", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "countdown", 3000);
    expect([timer.durationMs, timer.remainingMs(), timer.progress()]).toEqual([3000, 0, 0]);
    timer.enter("podium");
    expect([timer.phase, timer.durationMs, timer.endsAt, timer.remainingMs(), timer.progress()]).toEqual(["podium", 0, 0, 0, 0]);
  });

  test("a grace period delays the continuation but not the countdown", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "countdown");
    let fired = 0;
    timer.set("playing", 1000, () => fired++, { graceMs: 500 });
    clock.advance(1000);
    expect([fired, timer.remainingMs()]).toEqual([0, 0]);
    clock.advance(500);
    expect(fired).toBe(1);
  });

  test("a hidden countdown still ends the phase but shows no deadline", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "countdown");
    let fired = 0;
    timer.set("playing", 1000, () => fired++, { hidden: true });
    expect([timer.endsAt, timer.durationMs, timer.remainingMs()]).toEqual([0, 0, 0]);
    clock.advance(1000);
    expect(fired).toBe(1);
  });

  test("entering the same phase again keeps when it was entered", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "countdown");
    timer.set("playing", 1000, () => {});
    const entered = timer.enteredAtMs;
    clock.advance(400);
    timer.set("playing", 1000, () => {});
    expect(timer.enteredAtMs).toBe(entered);
    timer.set("podium", 0);
    expect(timer.enteredAtMs).toBe(clock.now());
  });

  test("named slots fire independently of the phase and of each other", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "countdown");
    const fired: string[] = [];
    timer.set("playing", 3000, () => fired.push("phase"));
    timer.after("warn", 1000, () => fired.push("warn"));
    timer.after("tick", 2000, () => fired.push("tick"));
    clock.advance(1000);
    expect(fired).toEqual(["warn"]);
    clock.advance(1000);
    expect(fired).toEqual(["warn", "tick"]);
    clock.advance(1000);
    expect(fired).toEqual(["warn", "tick", "phase"]);
  });

  test("a slot that is replaced does not fire, and a slot that is cancelled does not either", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "countdown");
    const fired: string[] = [];
    timer.after("warn", 1000, () => fired.push("first"));
    timer.after("warn", 2000, () => fired.push("second"));
    timer.after("tick", 1000, () => fired.push("tick"));
    timer.cancel("tick");
    clock.advance(1000);
    expect(fired).toEqual([]);
    clock.advance(1000);
    expect(fired).toEqual(["second"]);
  });

  test("a player's slot taken over by a later timer fires only the later one, as Hill Fight's decision, repair and result timers do", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "playing");
    const fired: string[] = [];
    timer.after("player:p1", 10_500, () => fired.push("forfeit"));
    clock.advance(1000);
    timer.after("player:p1", 4000, () => fired.push("repair"));
    timer.after("player:p2", 10_500, () => fired.push("other player"));
    clock.advance(3999);
    expect(fired).toEqual([]);
    clock.advance(1);
    expect(fired).toEqual(["repair"]);
    clock.advance(10_000);
    expect(fired).toEqual(["repair", "other player"]);
  });

  test("a named slot reports its remaining time until it fires, is replaced or is cancelled", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "countdown");
    expect(timer.slotRemainingMs("warn")).toBeNull();
    timer.after("warn", 1000, () => {});
    clock.advance(400);
    expect(timer.slotRemainingMs("warn")).toBe(600);
    timer.after("warn", 2000, () => {});
    expect(timer.slotRemainingMs("warn")).toBe(2000);
    clock.advance(2000);
    expect(timer.slotRemainingMs("warn")).toBeNull();
    timer.after("warn", 1000, () => {});
    timer.cancel("warn");
    expect(timer.slotRemainingMs("warn")).toBeNull();
  });

  test("setting a phase leaves the named slots alone", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "countdown");
    let fired = 0;
    timer.after("warn", 1000, () => fired++);
    timer.set("playing", 5000, () => {});
    clock.advance(1000);
    expect(fired).toBe(1);
  });

  test("dispose cancels the phase timer and every slot", () => {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "countdown");
    const fired: string[] = [];
    timer.set("playing", 1000, () => fired.push("phase"));
    timer.after("a", 1000, () => fired.push("a"));
    timer.after("b", 2000, () => fired.push("b"));
    timer.dispose();
    clock.advance(10_000);
    expect(fired).toEqual([]);
  });
});

describe("Game-length clock", () => {
  function setup(atDeadline?: () => void) {
    const clock = new FakeClock();
    const timer = new PhaseTimer<Phase>(clock, "countdown");
    let finished = 0;
    const length = new GameLengthClock(timer, new GameFinish(timer, "podium", { onFinish: () => finished++, onChange: () => {} }));
    length.start("playing", 60_000, atDeadline);
    return { clock, timer, length, finished: () => finished };
  }

  test("exposes the remaining time and runs the finish at the deadline", () => {
    const { clock, timer, length, finished } = setup();
    expect([timer.phase, length.remainingMs()]).toEqual(["playing", 60_000]);
    clock.advance(45_000);
    expect(length.remainingMs()).toBe(15_000);
    clock.advance(15_000);
    expect([finished(), timer.phase, length.remainingMs(), length.ended]).toEqual([1, "podium", 0, true]);
  });

  test("finish runs once when an early end comes first and the deadline passes after", () => {
    const { clock, length, finished } = setup();
    clock.advance(59_999);
    length.end();
    clock.advance(10_000);
    expect(finished()).toBe(1);
  });

  test("finish runs once when the deadline comes first and an early end follows", () => {
    const { clock, length, finished } = setup();
    clock.advance(60_000);
    length.end();
    length.end();
    expect(finished()).toBe(1);
  });

  test("finish runs once when an early end lands at the deadline tick", () => {
    const { clock, length, finished } = setup();
    clock.advance(59_999);
    length.end();
    clock.advance(1);
    length.end();
    expect(finished()).toBe(1);
    expect(length.ended).toBe(true);
  });

  test("a mode that wraps up at the deadline finishes only when it ends the game", () => {
    const wrapped: string[] = [];
    const { clock, length, finished } = setup(() => wrapped.push("deadline"));
    clock.advance(60_000);
    expect([wrapped, finished()]).toEqual([["deadline"], 0]);
    length.end();
    length.end();
    expect(finished()).toBe(1);
  });
});

describe("Phase timer through the game modes", () => {
  function tower(onFinish: () => void) {
    const clock = new FakeClock();
    const lobby = new Lobby(sampleQuiz());
    lobby.setMode("tower");
    lobby.setModeSettings("tower", { teams: 2, minutes: 5, monster: true });
    lobby.join("Ann");
    lobby.join("Bo");
    const game = TowerGame.fromLobby(lobby.handoffFacts("tower"), { clock, onFinish });
    return { clock, game };
  }

  test("Tallest Tower's host view counts down the game length and finishes once when the host ends the game at the deadline", () => {
    let finished = 0;
    const { clock, game } = tower(() => finished++);
    game.start();
    expect(game.hostView()).toMatchObject({ phase: "countdown", remainingMs: COUNTDOWN_MS });
    clock.advance(COUNTDOWN_MS);
    expect(game.hostView()).toMatchObject({ phase: "playing", remainingMs: 300_000 });
    clock.advance(100_000);
    expect(game.hostView()).toMatchObject({ remainingMs: 200_000 });
    clock.advance(199_999);
    expect(game.hostView()).toMatchObject({ phase: "playing", remainingMs: 1 });
    game.end();
    clock.advance(1);
    game.end();
    expect(finished).toBe(1);
    expect(game.hostView()).toMatchObject({ phase: "podium", remainingMs: 0 });
  });

  test("Tallest Tower's deadline ends the game once and a later host end does nothing", () => {
    let finished = 0;
    const { clock, game } = tower(() => finished++);
    game.start();
    clock.advance(COUNTDOWN_MS + 300_000);
    expect(game.phase).toBe("podium");
    game.end();
    clock.advance(600_000);
    expect(finished).toBe(1);
  });

  test("disposing Tallest Tower leaves no pending timer, monster announcements included", () => {
    let finished = 0;
    const { clock, game } = tower(() => finished++);
    game.start();
    clock.advance(COUNTDOWN_MS);
    game.dispose();
    clock.advance(600_000);
    expect(finished).toBe(0);
    expect(game.phase).toBe("playing");
    expect(game.hostView()).toMatchObject({ egg: null });
  });

  test("Robot Attack's warning timer marks the targets before the quiz phase ends, and disposing cancels it", () => {
    const clock = new FakeClock();
    const lobby = new Lobby(sampleQuiz());
    lobby.setMode("robot");
    lobby.join("Ann");
    const game = RobotGame.fromLobby(lobby.handoffFacts("robot"), { clock });
    game.start();
    clock.advance(game.phaseEndsAt - clock.now());
    expect(game.phase).toBe("quiz");
    expect(game.marked.size).toBe(0);
    clock.advance(game.phaseDurationMs - 5000 - 1);
    expect(game.marked.size).toBe(0);
    clock.advance(1);
    expect(game.marked.size).toBeGreaterThan(0);
    game.dispose();
    clock.advance(600_000);
    expect(game.phase).toBe("quiz");
  });
});
