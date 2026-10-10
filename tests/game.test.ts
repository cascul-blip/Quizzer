import { describe, expect, test } from "bun:test";
import { AUTO_LEADERBOARD_MS, AUTO_REVEAL_MS, GRACE_MS, Game, GameError, INTRO_MS, preparePlayOrder } from "../src/server/game/game.ts";
import { FightGame } from "../src/server/game/fight.ts";
import { LandGame } from "../src/server/game/land.ts";
import { TowerGame } from "../src/server/game/tower.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

function setup(opts: { pacing?: "manual" | "auto" } = {}) {
  const clock = new FakeClock();
  let finished = 0;
  const game = new Game(sampleQuiz(), { clock, pacing: opts.pacing, onFinish: () => finished++ });
  return { clock, game, finished: () => finished };
}

function toOpen(game: Game, clock: FakeClock) {
  expect(game.phase).toBe("intro");
  clock.advance(INTRO_MS);
  expect(game.phase).toBe("open");
}

describe("joining", () => {
  test("nicknames are trimmed and unique (case-insensitive)", () => {
    const { game } = setup();
    expect(game.join("  Ann   Lee ").nickname).toBe("Ann Lee");
    expect(() => game.join("ann lee")).toThrow(GameError);
    expect(() => game.join("")).toThrow(GameError);
    expect(() => game.join("x".repeat(21))).toThrow(GameError);
    expect(() => game.join(42)).toThrow(GameError);
  });

  test("cannot start without players", () => {
    const { game } = setup();
    expect(() => game.start()).toThrow(/at least one player/);
  });

  test("resume by token", () => {
    const { game } = setup();
    const p = game.join("A");
    expect(game.byToken(p.token)?.id).toBe(p.id);
    expect(game.byToken("nope")).toBeNull();
  });
});

describe("question flow", () => {
  test("closes early when every connected player has answered, and scores by speed", () => {
    const { game, clock } = setup();
    const a = game.join("A");
    const b = game.join("B");
    game.start();
    toOpen(game, clock);

    clock.advance(2000);
    expect(game.answer(a.id, 0, 1)).toBe(true); // correct at 2s of 20s → 950
    expect(game.answer(a.id, 0, 2)).toBe(false); // no second answer
    expect(game.phase).toBe("open");
    // Scores are hidden until the reveal.
    expect(a.score).toBe(0);
    clock.advance(1000);
    expect(game.answer(b.id, 0, 0)).toBe(true); // wrong
    expect(game.phase).toBe("reveal");
    expect(a.score).toBe(950);
    expect(b.score).toBe(0);
    expect(game.hostView().answerCounts).toEqual([1, 1, 0, 0]);
    // Avatars per option, fastest first; hidden until the reveal (checked in "views" below).
    expect(game.hostView().answerAvatars).toEqual([[b.avatar], [a.avatar], [], []]);
    expect(game.leaderboard().map((e) => e.avatar)).toEqual([a.avatar, b.avatar]);
    expect(game.hostView().correct).toEqual([1]);
  });

  test("disconnected players don't hold up the question", () => {
    const { game, clock } = setup();
    const a = game.join("A");
    const b = game.join("B");
    game.start();
    toOpen(game, clock);
    game.answer(a.id, 0, 1);
    expect(game.phase).toBe("open");
    game.setConnected(b.id, false);
    expect(game.phase).toBe("reveal");
  });

  test("times out after the limit plus grace; late answers rejected", () => {
    const { game, clock } = setup();
    const a = game.join("A");
    game.join("B");
    game.start();
    toOpen(game, clock);
    clock.advance(20_000 + GRACE_MS - 1);
    expect(game.phase).toBe("open");
    // Within grace: accepted but scored as if at the limit.
    expect(game.answer(a.id, 0, 1)).toBe(true);
    expect(a.answers[0]!.points).toBe(500);
    clock.advance(1);
    expect(game.phase).toBe("reveal");
    expect(game.answer(a.id, 0, 1)).toBe(false);
  });

  test("answers for the wrong question or out-of-range options are rejected", () => {
    const { game, clock } = setup();
    const a = game.join("A");
    game.join("B");
    game.start();
    expect(game.answer(a.id, 0, 1)).toBe(false); // still intro
    clock.advance(INTRO_MS);
    expect(game.answer(a.id, 1, 1)).toBe(false);
    expect(game.answer(a.id, 0, 4)).toBe(false);
    expect(game.answer(a.id, 0, -1)).toBe(false);
    expect(game.answer(a.id, 0, 1.5)).toBe(false);
    expect(game.answer("ghost", 0, 1)).toBe(false);
  });

  test("multiple correct answers: any of them counts", () => {
    const { game, clock } = setup();
    const a = game.join("A");
    const b = game.join("B");
    const c = game.join("C");
    game.start();
    for (let i = 0; i < 2; i++) {
      toOpen(game, clock);
      game.skip();
      game.next(); // → leaderboard
      game.next(); // → intro
    }
    toOpen(game, clock);
    game.answer(a.id, 2, 0);
    game.answer(b.id, 2, 2);
    game.answer(c.id, 2, 1);
    expect([a, b, c].map((p) => p.answers[2]!.correct)).toEqual([true, true, false]);
  });

  test("manual pacing walks through every phase to the podium", () => {
    const { game, clock, finished } = setup();
    game.join("A");
    game.start();
    const seen: string[] = [];
    for (let guard = 0; guard < 50 && game.phase !== "podium"; guard++) {
      seen.push(game.phase);
      game.next();
    }
    expect(seen).toEqual(["intro", "open", "reveal", "leaderboard", "intro", "open", "reveal", "leaderboard", "intro", "open", "reveal"]);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    // Manual pacing never advances on its own.
    clock.advance(60_000);
    expect(game.phase).toBe("podium");
  });

  test("manual pacing waits on reveal", () => {
    const { game, clock } = setup();
    game.join("A");
    game.start();
    toOpen(game, clock);
    game.skip();
    clock.advance(60_000);
    expect(game.phase).toBe("reveal");
  });

  test("auto pacing advances reveal → leaderboard → next intro", () => {
    const { game, clock } = setup({ pacing: "auto" });
    game.join("A");
    game.start();
    toOpen(game, clock);
    game.skip();
    expect(game.phase).toBe("reveal");
    clock.advance(AUTO_REVEAL_MS);
    expect(game.phase).toBe("leaderboard");
    clock.advance(AUTO_LEADERBOARD_MS);
    expect(game.phase).toBe("intro");
    expect(game.qIndex).toBe(1);
  });

  test("switching to auto mid-reveal schedules the advance", () => {
    const { game, clock } = setup();
    game.join("A");
    game.start();
    toOpen(game, clock);
    game.skip();
    game.setPacing("auto");
    clock.advance(AUTO_REVEAL_MS);
    expect(game.phase).toBe("leaderboard");
  });

  test("end() jumps to the podium from anywhere", () => {
    const { game, clock, finished } = setup();
    const a = game.join("A");
    game.start();
    toOpen(game, clock);
    game.answer(a.id, 0, 1);
    game.end();
    expect(game.phase).toBe("podium");
    expect(a.score).toBeGreaterThan(0);
    expect(finished()).toBe(1);
    expect(() => game.join("Late")).toThrow(/finished/);
  });

  test("kick removes the player and invalidates their token", () => {
    const { game } = setup();
    const a = game.join("A");
    game.kick(a.id);
    expect(game.players.size).toBe(0);
    expect(game.byToken(a.token)).toBeNull();
    // Nickname becomes available again.
    expect(game.join("A").nickname).toBe("A");
  });
});

describe("views", () => {
  test("players never see the correct answer before the reveal", () => {
    const { game, clock } = setup();
    const a = game.join("A");
    game.join("B");
    game.start();
    let v = game.playerView(a.id);
    expect(v.kind === "player" && v.question?.options).toEqual([]); // intro hides options
    clock.advance(INTRO_MS);
    v = game.playerView(a.id);
    expect(JSON.stringify(v)).not.toContain('"correct"');
    expect(JSON.stringify(game.hostView().correct)).toBe("null");
    expect(game.hostView().answerAvatars).toBeNull();
    game.answer(a.id, 0, 2);
    v = game.playerView(a.id);
    expect(v.kind === "player" && v.myChoice).toBe(2);
    game.skip();
    v = game.playerView(a.id);
    expect(v.kind === "player" && v.result).toEqual({ choice: 2, correct: [1], wasCorrect: false, points: 0 });
  });

  test("remainingMs counts down", () => {
    const { game, clock } = setup();
    game.join("A");
    game.start();
    clock.advance(INTRO_MS + 5000);
    expect(game.hostView().question!.remainingMs).toBe(15_000);
  });
});

describe("preparePlayOrder", () => {
  const off = { questions: false, answers: false };

  test("no shuffle keeps order", () => {
    expect(preparePlayOrder(sampleQuiz().questions, off).map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
  });

  test("answer shuffle remaps correct indices; true/false stays put", () => {
    const quiz = sampleQuiz();
    const q1Positions = new Set<number>();
    for (let seed = 0; seed < 20; seed++) {
      let s = seed + 1;
      const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const [q1, q2, q3] = preparePlayOrder(quiz.questions, { questions: false, answers: true }, rng);
      expect(q1!.correct.map((i) => q1!.options[i])).toEqual(["4"]);
      expect([...q1!.options].sort()).toEqual(["22", "3", "4", "5"]);
      expect(q2!.options).toEqual(["True", "False"]);
      expect(q3!.correct.map((i) => q3!.options[i]).sort()).toEqual(["2", "7"]);
      q1Positions.add(q1!.correct[0]!);
    }
    // The correct answer really moves around (not always the 2nd, blue tile).
    expect(q1Positions.size).toBeGreaterThan(1);
    // The source quiz is untouched.
    expect(quiz.questions[0]!.options).toEqual(["3", "4", "5", "22"]);
  });

  test("question shuffle is a permutation", () => {
    expect(preparePlayOrder(sampleQuiz().questions, { questions: true, answers: false }, () => 0).map((q) => q.id).sort()).toEqual(["q1", "q2", "q3"]);
  });
});

describe("lobby shuffle options", () => {
  test("default to the quiz settings and apply when the game starts", () => {
    const clock = new FakeClock();
    const quiz = sampleQuiz({ settings: { shuffleQuestions: true, shuffleAnswers: false } });
    const game = new Game(quiz, { clock, rng: () => 0 });
    expect(game.hostView().shuffle).toEqual({ questions: true, answers: false });
    // Lobby keeps the authored order until Start.
    expect(game.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    game.join("A");
    game.start();
    // rng() = 0 turns a Fisher-Yates shuffle into a rotation.
    expect(game.questions.map((q) => q.id)).toEqual(["q2", "q3", "q1"]);
  });

  test("the host can change them in the lobby only", () => {
    const game = new Game(sampleQuiz(), { clock: new FakeClock(), rng: () => 0 });
    game.setShuffle({ questions: false, answers: true });
    expect(game.hostView().shuffle).toEqual({ questions: false, answers: true });
    game.join("A");
    game.start();
    expect(game.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    expect(game.questions[0]!.options).toEqual(["4", "5", "22", "3"]);
    expect(game.questions[0]!.correct).toEqual([0]);
    expect(() => game.setShuffle({ questions: true, answers: true })).toThrow(GameError);
  });
});

describe("lobby Protect from abuse option", () => {
  test("is on by default and the host can change it in the lobby only", () => {
    const game = new Game(sampleQuiz(), { clock: new FakeClock() });
    expect(game.hostView().protect).toBe(true);
    game.setProtect(false);
    expect(game.hostView().protect).toBe(false);
    game.join("A");
    game.start();
    expect(() => game.setProtect(true)).toThrow(GameError);
  });

  test("carries over from the previous lobby", () => {
    expect(new Game(sampleQuiz(), { clock: new FakeClock(), protect: false }).hostView().protect).toBe(false);
  });
});

describe("lobby teams", () => {
  function teamLobby(names: string[], teams = 3) {
    const { game, clock } = setup();
    game.setMode("tower");
    game.setTower({ teams, minutes: 5 });
    const ids = names.map((n) => game.join(n).id);
    /** Nicknames per team, in join order. */
    const layout = () => {
      const a = game.teamAssignment();
      return Array.from({ length: game.hostView().teams!.length }, (_, i) => [...game.players.values()].filter((p) => a.get(p.id) === i).map((p) => p.nickname));
    };
    const badge = (id: string) => {
      const v = game.playerView(id);
      return v.kind === "player" ? v.team : null;
    };
    return { game, clock, ids, layout, badge };
  }

  test("round-robin by join order until the host moves someone", () => {
    const { game, layout } = teamLobby(["A", "B", "C", "D", "E"]);
    expect(layout()).toEqual([["A", "D"], ["B", "E"], ["C"]]);
    game.kick([...game.players.keys()][0]!);
    expect(layout()).toEqual([["B", "E"], ["C"], ["D"]]);
    game.setTower({ teams: 2, minutes: 5 });
    expect(layout()).toEqual([["B", "D"], ["C", "E"]]);
    expect(game.hostView().teams!.map((t) => t.members.map((m) => m.nickname))).toEqual(layout());
  });

  test("setTeam moves only that player; the phone badge follows", () => {
    const { game, ids, layout, badge } = teamLobby(["A", "B", "C", "D", "E"]);
    expect(badge(ids[0]!)?.index).toBe(0);
    game.setTeam(ids[0]!, 2);
    expect(layout()).toEqual([["D"], ["B", "E"], ["A", "C"]]);
    expect(badge(ids[0]!)).toMatchObject({ index: 2, name: "Yellow" });
    expect(badge(ids[3]!)?.index).toBe(0);
    expect(game.hostView().teams!.map((t) => t.members.map((m) => m.nickname))).toEqual([["D"], ["B", "E"], ["A", "C"]]);
  });

  test("after a manual move, joiners go to the smallest team and a kick leaves the rest in place", () => {
    const { game, ids, layout } = teamLobby(["A", "B", "C", "D", "E"]);
    game.setTeam(ids[0]!, 2);
    game.join("F");
    expect(layout()).toEqual([["D", "F"], ["B", "E"], ["A", "C"]]);
    game.join("G"); // all equal: lowest index
    expect(layout()).toEqual([["D", "F", "G"], ["B", "E"], ["A", "C"]]);
    game.kick(ids[1]!);
    expect(layout()).toEqual([["D", "F", "G"], ["E"], ["A", "C"]]);
    game.join("H");
    expect(layout()).toEqual([["D", "F", "G"], ["E", "H"], ["A", "C"]]);
  });

  test("shrinking re-homes players of removed teams to the smallest team; growing keeps everyone", () => {
    const { game, ids, layout } = teamLobby(["A", "B", "C", "D", "E"]);
    game.setTeam(ids[3]!, 1);
    expect(layout()).toEqual([["A"], ["B", "D", "E"], ["C"]]);
    game.setTower({ teams: 2, minutes: 5 });
    expect(layout()).toEqual([["A", "C"], ["B", "D", "E"]]);
    game.setTower({ teams: 4, minutes: 5 });
    expect(layout()).toEqual([["A", "C"], ["B", "D", "E"], [], []]);
    // Another team mode keeps what fits (Tower Fight has 2 teams).
    game.setTeam(ids[4]!, 3);
    game.setMode("fight");
    expect(layout()).toEqual([["A", "C", "E"], ["B", "D"]]);
  });

  test("setTeam is rejected outside a team-mode lobby and for bad arguments", () => {
    const { game, ids, layout, badge } = teamLobby(["A", "B"], 2);
    expect(() => game.setTeam(ids[0]!, 2)).toThrow(GameError);
    expect(() => game.setTeam(ids[0]!, -1)).toThrow(GameError);
    expect(() => game.setTeam(ids[0]!, 0.5)).toThrow(GameError);
    expect(() => game.setTeam(ids[0]!, NaN)).toThrow(GameError);
    expect(() => game.setTeam("nope", 1)).toThrow(GameError);
    expect(layout()).toEqual([["A"], ["B"]]);
    game.setMode("classic");
    expect(() => game.setTeam(ids[0]!, 1)).toThrow(/no teams/);
    expect(badge(ids[0]!)).toBeNull();
    game.start();
    expect(() => game.setTeam(ids[0]!, 1)).toThrow(/before the game starts/);
  });

  test("the team games start with the host's arrangement", () => {
    const { game, clock, ids } = teamLobby(["A", "B", "C"], 2);
    game.setTeam(ids[2]!, 1);
    expect([...TowerGame.fromLobby(game, { clock }).players.values()].map((p) => p.team)).toEqual([0, 1, 1]);
    game.setMode("fight");
    expect([...FightGame.fromLobby(game, { clock }).players.values()].map((p) => p.team)).toEqual([0, 1, 1]);
    game.setMode("land");
    expect([...LandGame.fromLobby(game, { clock }).players.values()].map((p) => p.team)).toEqual([0, 1, 1]);
  });
});

describe("streaks", () => {
  test("count consecutive correct answers and reset on a wrong or missing answer", () => {
    const clock = new FakeClock();
    const q = (i: number) => ({ id: `q${i}`, type: "true_false" as const, text: `Q${i}`, timeLimitSec: 10, options: ["True", "False"], correct: [0] });
    const game = new Game(sampleQuiz({ questions: [1, 2, 3, 4, 5, 6].map(q) }), { clock });
    const a = game.join("A");
    const b = game.join("B");
    game.start();
    // A: right ×4, wrong, right. B: right, no answer, right…
    const aPicks = [0, 0, 0, 0, 1, 0];
    const bPicks = [0, null, 0, 0, 0, 0];
    const aStreaks: number[] = [];
    const bStreaks: number[] = [];
    for (let i = 0; i < 6; i++) {
      clock.advance(INTRO_MS);
      game.answer(a.id, i, aPicks[i]!);
      if (bPicks[i] !== null) game.answer(b.id, i, bPicks[i]!);
      game.skip();
      aStreaks.push(a.streak);
      bStreaks.push(b.streak);
      expect(game.leaderboard().find((e) => e.id === a.id)!.streak).toBe(a.streak);
      const v = game.playerView(a.id);
      expect(v.kind === "player" && v.me.streak).toBe(a.streak);
      game.next(); // → leaderboard (or podium after the last)
      game.next(); // → next intro
    }
    expect(aStreaks).toEqual([1, 2, 3, 4, 0, 1]);
    expect(bStreaks).toEqual([1, 0, 1, 2, 3, 4]);
  });
});

test("answer avatars list pickers in answer order and match the counts", () => {
  const clock = new FakeClock();
  const game = new Game(sampleQuiz(), { clock });
  const ps = ["P1", "P2", "P3", "P4"].map((n) => game.join(n));
  game.start();
  clock.advance(INTRO_MS);
  // P3 fastest, then P1, then P4 — all on option 1; P2 on option 0.
  for (const [p, opt] of [[ps[2]!, 1], [ps[0]!, 1], [ps[1]!, 0], [ps[3]!, 1]] as const) {
    clock.advance(500);
    game.answer(p.id, 0, opt);
  }
  const v = game.hostView();
  expect(v.answerAvatars![1]).toEqual([ps[2]!.avatar, ps[0]!.avatar, ps[3]!.avatar]);
  expect(v.answerAvatars!.map((x) => x.length)).toEqual(v.answerCounts!);
});
