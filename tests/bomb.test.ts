import { describe, expect, test } from "bun:test";
import { BOMB_KEYPAD_LOCK_MS, BombGame, dealBombWires } from "../src/server/game/bomb.ts";
import { DEFAULT_BOMB, Game } from "../src/server/game/game.ts";
import { buildBombResultsCsv } from "../src/server/game/results.ts";
import {
  BOMB_COUNTDOWN_MS,
  BOMB_HOLD_MS,
  BOMB_NEXT_MS,
  BOMB_REDEAL_MS,
  BOMB_RESULT_MS,
  type BombSettings,
} from "../src/shared/protocol.ts";
import type { Question } from "../src/shared/quiz-schema.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

const rng = () => 0;

function mc(i: number, choices = 4, correct: number[] = [0]): Question {
  return {
    id: `q${i}`,
    type: "multiple_choice",
    text: `Question ${i}`,
    timeLimitSec: 20,
    options: Array.from({ length: choices }, (_, c) => `Q${i}C${c}`),
    correct,
  };
}

function boot(questions: Question[], names: string[], settings: Partial<BombSettings> = {}) {
  const clock = new FakeClock();
  const lobby = new Game(sampleQuiz({ questions }), { clock, rng });
  lobby.setMode("bomb");
  lobby.setBomb({ ...DEFAULT_BOMB, squads: 1, modules: 2, wires: 2, minutes: 3, penaltySec: 15, ...settings });
  const joined = names.map((n) => lobby.join(n));
  const game = BombGame.fromLobby(lobby, { clock, rng });
  game.start();
  clock.advance(BOMB_COUNTDOWN_MS);
  return { clock, lobby, game, joined };
}

function question(game: BombGame, squad = 0) {
  const q = game.squads[squad]?.question;
  if (!q) throw new Error(`squad ${squad} has no question`);
  return q;
}

function cut(game: BombGame, clock: FakeClock, playerId: string, wireId: string) {
  expect(game.hold(playerId, wireId, true)).toBe(true);
  clock.advance(BOMB_HOLD_MS);
  return game.cut(playerId, wireId);
}

const players = (ids: string[]) => ids.map((id) => ({ id, rightHolds: 0, extras: 0 }));

describe("dealing wires", () => {
  test("fewer players than choices: extras rotate, and the right wire goes to whoever has held it least", () => {
    const options = [
      { index: 0, label: "Right", correct: true },
      { index: 1, label: "A", correct: false },
      { index: 2, label: "B", correct: false },
      { index: 3, label: "C", correct: false },
    ];
    const group = players(["a", "b", "c"]);
    const first = dealBombWires({ players: group, options, kind: "multiple_choice", decoys: [], rng });
    expect(first.find((w) => w.correct)!.playerId).toBe("a");
    expect(first.filter((w) => w.playerId === "a")).toHaveLength(2);
    expect(first.filter((w) => w.playerId === "b")).toHaveLength(1);
    expect(first.filter((w) => w.playerId === "c")).toHaveLength(1);

    group[0]!.rightHolds = 1;
    group[0]!.extras = 1;
    const second = dealBombWires({ players: group, options, kind: "multiple_choice", decoys: [], rng });
    expect(second.find((w) => w.correct)!.playerId).toBe("b");
    expect(second.filter((w) => w.playerId === "b")).toHaveLength(2);

    group[1]!.rightHolds = 1;
    group[1]!.extras = 1;
    const third = dealBombWires({ players: group, options, kind: "multiple_choice", decoys: [], rng });
    expect(third.find((w) => w.correct)!.playerId).toBe("c");
    expect(third.filter((w) => w.playerId === "c")).toHaveLength(2);
  });

  test("more players than choices: decoys once, then copies of a wrong answer", () => {
    const options = [
      { index: 0, label: "Yes", correct: true },
      { index: 1, label: "No", correct: false },
    ];
    const group = players(["a", "b", "c", "d", "e", "f"]);
    const decoyed = dealBombWires({ players: group, options, kind: "multiple_choice", decoys: ["X", "Y", "Z", "W"], rng });
    expect(decoyed).toHaveLength(6);
    expect(decoyed.filter((w) => w.correct)).toHaveLength(1);
    expect(decoyed.filter((w) => w.decoy).map((w) => w.label)).toEqual(["X", "Y", "Z", "W"]);

    const copied = dealBombWires({ players: group, options, kind: "multiple_choice", decoys: [], rng });
    expect(copied.filter((w) => w.label === "No")).toHaveLength(5);
    expect(copied.filter((w) => w.copy)).toHaveLength(4);
    expect(copied.filter((w) => w.correct)).toHaveLength(1);
  });

  test("true/false splits evenly and the extra wire is the wrong one; one player holds both", () => {
    const options = [
      { index: 0, label: "True", correct: true },
      { index: 1, label: "False", correct: false },
    ];
    const split = dealBombWires({ players: players(["a", "b", "c"]), options, kind: "true_false", decoys: [], rng });
    expect(split.filter((w) => w.correct)).toHaveLength(1);
    expect(split.filter((w) => !w.correct)).toHaveLength(2);
    expect(split.find((w) => w.correct)!.color).toBe("green");
    expect(split.find((w) => !w.correct)!.color).toBe("red");

    const solo = dealBombWires({ players: players(["a"]), options, kind: "true_false", decoys: [], rng });
    expect(solo.map((w) => w.label).sort()).toEqual(["False", "True"]);
    expect(new Set(solo.map((w) => w.playerId))).toEqual(new Set(["a"]));
  });

  test("several right answers go to empty hands first, so every phone gets a wire", () => {
    const group = players(["a", "b", "c"]);
    group[1]!.rightHolds = 5;
    group[2]!.rightHolds = 5;
    const wires = dealBombWires({
      players: group,
      options: [
        { index: 0, label: "R1", correct: true },
        { index: 1, label: "R2", correct: true },
        { index: 2, label: "W", correct: false },
      ],
      kind: "multiple_choice",
      decoys: [],
      rng,
    });
    expect(new Set(wires.map((w) => w.playerId))).toEqual(new Set(["a", "b", "c"]));
    expect(wires.find((w) => w.label === "R1")!.playerId).toBe("a");

    // More right answers than phones: the extras follow the same rotation as before.
    const two = dealBombWires({
      players: players(["a", "b"]),
      options: [0, 1, 2, 3].map((index) => ({ index, label: `O${index}`, correct: index < 3 })),
      kind: "multiple_choice",
      decoys: [],
      rng,
    });
    expect(two.filter((w) => w.playerId === "a")).toHaveLength(2);
    expect(two.filter((w) => w.playerId === "b")).toHaveLength(2);
  });

  test("a pin extra is a copy of a wrong spot", () => {
    const spots = [
      { x: 0.2, y: 0.3 },
      { x: 0.8, y: 0.6 },
    ];
    const wires = dealBombWires({
      players: players(["a", "b", "c"]),
      options: [
        { index: 0, label: "Door", correct: true, spot: spots[0] },
        { index: 1, label: "Window", correct: false, spot: spots[1] },
      ],
      kind: "pin",
      decoys: [],
      rng,
    });
    expect(wires.filter((w) => w.correct)).toHaveLength(1);
    expect(wires.find((w) => w.copy)!.spot).toEqual(spots[1]);
    expect(wires.find((w) => w.copy)!.label).toBe("Window");
  });
});

describe("cutting", () => {
  test("a squad of one holds every wire, phones never see which wire is right, and a wrong cut stays on the same question", () => {
    const { game, clock, joined } = boot([mc(0)], ["Ada"]);
    const id = joined[0]!.id;
    const q = question(game);
    expect(q.wires).toHaveLength(4);
    expect(q.wires.every((w) => w.playerId === id)).toBe(true);
    const view = game.playerView(id);
    expect(view.wires).toHaveLength(4);
    for (const w of view.wires) expect(w).not.toHaveProperty("correct");
    expect(game.hostView().squads[0]!.question?.text).toBe(q.text);

    const wrong = q.wires.find((w) => !w.correct)!;
    expect(cut(game, clock, id, wrong.id)).toBe(true);
    expect(wrong.cut).toBe(true);
    expect(question(game).text).toBe(q.text);
    expect(game.playerView(id).reveal).toBeNull();
    expect(game.hostView().errors).toBeNull();
  });

  test("hold can be cancelled, an early cut is refused, and only one cut happens at a time", () => {
    const { game, clock, joined } = boot([mc(0)], ["Ada", "Ben"]);
    const a = joined[0]!.id;
    const b = joined[1]!.id;
    const wires = question(game).wires;
    const wa = wires.find((w) => w.playerId === a)!;
    const wb = wires.find((w) => w.playerId === b)!;
    expect(game.hold(a, wa.id, true)).toBe(true);
    expect(game.hold(b, wb.id, true)).toBe(false);
    expect(game.playerView(b).cutting?.name).toBe("Ada");
    expect(game.playerView(b).cutLocked).toBe(true);
    expect(game.hold(a, wa.id, false)).toBe(true);
    expect(game.cut(a, wa.id)).toBe(false);

    expect(game.hold(a, wa.id, true)).toBe(true);
    clock.advance(BOMB_HOLD_MS - 500);
    expect(game.cut(a, wa.id)).toBe(false);
    expect(question(game).wires.find((w) => w.id === wa.id)!.cut).toBe(false);
    clock.advance(500);
    expect(game.cut(a, wa.id)).toBe(true);
  });

  test("cutting any right wire clears a question with more than one right answer", () => {
    const { game, clock, joined } = boot([mc(0, 3, [0, 2])], ["Ada"]);
    const id = joined[0]!.id;
    const right = question(game).wires.find((w) => w.correct)!;
    expect(cut(game, clock, id, right.id)).toBe(true);
    expect(game.squads[0]!.reveal?.slice().sort()).toEqual(["Q0C0", "Q0C2"]);
    expect(game.players.get(id)!.rightCuts).toBe(1);
    expect(game.playerView(id).keypad).toBe(false);
  });

  test("a wrong cut takes time off every squad together, and only that squad in a race", () => {
    const together = boot([mc(0)], ["Ada", "Ben"], { squads: 2, penaltySec: 15 });
    const ada = together.joined[0]!.id;
    expect(together.game.players.get(ada)!.squad).toBe(0);
    const wrong = question(together.game, 0).wires.find((w) => !w.correct)!;
    const before = together.game.hostView().squads.map((s) => s.remainingMs);
    expect(cut(together.game, together.clock, ada, wrong.id)).toBe(true);
    const after = together.game.hostView().squads.map((s) => s.remainingMs);
    expect(after[0]).toBe(before[0]! - BOMB_HOLD_MS - 15_000);
    expect(after[1]).toBe(after[0]);
    expect(together.game.hostView().squads.every((s) => s.question === null)).toBe(true);

    const race = boot([mc(0)], ["Ada", "Ben"], { game: "race", squads: 2, penaltySec: 15 });
    const id = race.joined[0]!.id;
    const bad = question(race.game, 0).wires.find((w) => !w.correct)!;
    const was = race.game.hostView().squads.map((s) => s.remainingMs);
    cut(race.game, race.clock, id, bad.id);
    const now = race.game.hostView().squads.map((s) => s.remainingMs);
    expect(now[0]).toBe(was[0]! - BOMB_HOLD_MS - 15_000);
    expect(now[1]).toBe(was[1]! - BOMB_HOLD_MS);
  });

  test("a wrong cut clears every copy of that answer, so it only costs time once", () => {
    const { game, clock, joined } = boot([mc(0, 2)], ["A", "B", "C", "D", "E", "F"]);
    const q = question(game);
    const copies = q.wires.filter((w) => !w.correct);
    expect(copies).toHaveLength(5);
    expect(copies.filter((w) => w.copy)).toHaveLength(4);
    const before = game.hostView().remainingMs;
    const first = copies[0]!;
    expect(cut(game, clock, first.playerId, first.id)).toBe(true);
    expect(q.wires.filter((w) => !w.cut).map((w) => w.correct)).toEqual([true]);
    expect(game.squads[0]!.wrongCuts).toBe(1);
    expect(game.hostView().remainingMs).toBe(before - BOMB_HOLD_MS - 15_000);
    const other = copies[1]!;
    expect(game.hold(other.playerId, other.id, true)).toBe(false);
    expect(game.playerView(other.playerId).wires).toEqual([]);
    expect(joined.every((p) => game.players.get(p.id)!.wrongCuts <= 1)).toBe(true);
  });

  test("in a race the projector's timerRev moves with any squad's penalty", () => {
    const { game, clock, joined } = boot([mc(0)], ["Ada", "Ben"], { game: "race", squads: 2 });
    const rev = game.hostView().timerRev;
    const bad = question(game, 1).wires.find((w) => !w.correct)!;
    expect(game.players.get(bad.playerId)!.squad).toBe(1);
    cut(game, clock, bad.playerId, bad.id);
    expect(game.hostView().timerRev).toBe(rev + 1);
    expect(game.hostView().squads[1]!.timerRev).toBe(2);
    expect(joined).toHaveLength(2);
  });

  test("keypad answers ignore case, a wrong entry locks for 800ms, and it is not a right cut", () => {
    const q: Question = { id: "t1", type: "text", text: "Capital of France?", timeLimitSec: 20, options: ["Paris"], correct: [0] };
    const { game, clock, joined } = boot([q], ["Ada"]);
    const id = joined[0]!.id;
    const p = game.players.get(id)!;
    expect(game.playerView(id).keypad).toBe(true);
    expect(game.type(id, "nope")).toBe(true);
    expect(p.keypadWrong).toBe(1);
    expect(p.wrongCuts).toBe(1);
    expect(game.squads[0]!.wrongCuts).toBe(1);
    expect(game.type(id, "Paris")).toBe(false);
    expect(p.keypadWrong).toBe(1);
    clock.advance(BOMB_KEYPAD_LOCK_MS);
    expect(game.type(id, "paris")).toBe(true);
    expect(p.keypadRight).toBe(1);
    expect(p.rightCuts).toBe(0);
    expect(p.firstTry).toBe(0);
    expect(game.playerView(id).keypad).toBe(false);
    expect(game.playerView(id).reveal).toEqual(["Paris"]);
  });

  test("each squad shuffles its own question order", () => {
    const { game } = boot([mc(0), mc(1), mc(2), mc(3)], ["Ada"]);
    expect(question(game).text).toBe("Question 1");
  });
});

describe("squads, reconnecting, and the ending", () => {
  test("wires wait out a short drop, move after 5 seconds, and a kick re-deals immediately", () => {
    const { game, clock, joined } = boot([mc(0, 3)], ["Ada", "Ben", "Cara"]);
    const right = () => question(game).wires.find((w) => w.correct)!;
    const holder = right().playerId;
    game.setConnected(holder, false);
    clock.advance(1000);
    game.setConnected(holder, true);
    expect(right().playerId).toBe(holder);

    game.setConnected(holder, false);
    clock.advance(BOMB_REDEAL_MS - 1);
    expect(right().playerId).toBe(holder);
    clock.advance(1);
    expect(right().playerId).not.toBe(holder);
    expect(game.players.get(right().playerId)!.connected).toBe(true);

    const kicked = right().playerId;
    game.kick(kicked);
    expect(right().playerId).not.toBe(kicked);
  });

  test("a reconnect only moves the wires of players gone for 5 seconds", () => {
    const { game, clock, joined } = boot([mc(0, 3)], ["Ada", "Ben", "Cara"]);
    const [a, b] = [joined[0]!.id, joined[1]!.id];
    const owners = () => question(game).wires.map((w) => w.playerId);
    const dealt = owners();
    game.setConnected(a, false);
    clock.advance(3000);
    game.setConnected(b, false);
    game.setConnected(b, true);
    expect(owners()).toEqual(dealt);
    clock.advance(BOMB_REDEAL_MS - 3000);
    expect(owners()).not.toContain(a);
  });

  test("a re-deal only moves the stranded wires, and a player back with no wire gets a copy", () => {
    const { game, clock, joined } = boot([mc(0, 4)], ["Ada", "Ben", "Cara", "Dev"]);
    const q = question(game);
    const gone = q.wires.find((w) => w.correct)!.playerId;
    const kept = new Map(q.wires.filter((w) => w.playerId !== gone).map((w) => [w.id, w.playerId]));
    game.setConnected(gone, false);
    clock.advance(BOMB_REDEAL_MS);
    for (const [id, owner] of kept) expect(q.wires.find((w) => w.id === id)!.playerId).toBe(owner);
    expect(q.wires.find((w) => w.correct)!.playerId).not.toBe(gone);
    expect(q.wires.filter((w) => !w.cut)).toHaveLength(4);

    game.setConnected(gone, true);
    const back = game.playerView(gone).wires;
    expect(back).toHaveLength(1);
    const copy = question(game).wires.find((w) => w.playerId === gone)!;
    expect(copy.copy).toBe(true);
    expect(copy.correct).toBe(false);
    for (const [id, owner] of kept) expect(q.wires.find((w) => w.id === id)!.playerId).toBe(owner);
    expect(new Set(q.wires.map((w) => w.id)).size).toBe(q.wires.length);
    expect(joined).toHaveLength(4);
  });

  test("if everyone drops, the wires stay until someone comes back", () => {
    const { game, clock, joined } = boot([mc(0, 3)], ["Ada", "Ben", "Cara"]);
    const ids = question(game).wires.map((w) => w.playerId);
    for (const p of joined) game.setConnected(p.id, false);
    clock.advance(BOMB_REDEAL_MS);
    expect(question(game).wires.map((w) => w.playerId)).toEqual(ids);
    game.setConnected(joined[0]!.id, true);
    expect(question(game).wires.every((w) => w.playerId === joined[0]!.id)).toBe(true);
  });

  test("a late joiner sits out the current wire and is dealt in on the next one", () => {
    const { game, clock } = boot([mc(0, 2), mc(1, 2)], ["Ada", "Ben"]);
    const late = game.join("Cara");
    expect(late.satOut).toBe(true);
    expect(game.playerView(late.id).wires).toEqual([]);
    const right = question(game).wires.find((w) => w.correct)!;
    expect(cut(game, clock, right.playerId, right.id)).toBe(true);
    clock.advance(BOMB_NEXT_MS);
    expect(game.playerView(late.id).wires.length).toBeGreaterThan(0);
    expect(late.satOut).toBe(false);
  });

  test("together is defused when every module is clear, then the podium", () => {
    const { game, clock, joined } = boot([mc(0)], ["Ada"], { modules: 2, wires: 2 });
    const id = joined[0]!.id;
    for (let i = 0; i < 4; i++) {
      const wire = question(game).wires.find((w) => w.correct)!;
      expect(cut(game, clock, id, wire.id)).toBe(true);
      clock.advance(BOMB_NEXT_MS);
    }
    expect(game.phase).toBe("defused");
    expect(game.headline()).toMatch(/^Defused with /);
    expect(game.playerView(id).squadState).toBe("defused");
    clock.advance(BOMB_RESULT_MS);
    expect(game.phase).toBe("podium");
    expect(game.hostView().awards?.steadyHands?.nicknames).toEqual(["Ada"]);
    const csv = buildBombResultsCsv(game);
    expect(csv).toContain("Squad,Squad result,Squad time left,Squad rank,Nickname,Wires held,Right wires held,Right cuts,Wrong cuts,Keypad right,Keypad wrong,Time lost to wrong cuts,Modules cleared,Total time lost");
    expect(csv).toContain("defused");
    expect(csv).toContain("Ada");
    expect(csv.split("\r\n")[1]).toContain(",,"); // Together rank is blank
  });

  test("running out of time explodes, and the host ending skips that screen", () => {
    const boom = boot([mc(0)], ["Ada"], { modules: 4, wires: 4, minutes: 3, penaltySec: 20 });
    let n = 0;
    while (boom.game.phase === "defuse" && n++ < 40) {
      const squad = boom.game.squads[0]!;
      if (squad.pauseUntil) {
        boom.clock.advance(BOMB_NEXT_MS);
        continue;
      }
      const q = squad.question;
      if (!q) break;
      const wire = q.wires.find((w) => !w.cut && !w.correct) ?? q.wires.find((w) => !w.cut);
      if (!wire) break;
      expect(boom.game.hold(boom.joined[0]!.id, wire.id, true)).toBe(true);
      boom.clock.advance(BOMB_HOLD_MS);
      boom.game.cut(boom.joined[0]!.id, wire.id);
    }
    expect(boom.game.phase).toBe("exploded");
    expect(boom.game.outcome).toBe("exploded");
    expect(boom.game.playerView(boom.joined[0]!.id).status).toBe("BOOM! The bomb exploded.");
    expect(boom.game.headline()).toMatch(/^Exploded with /);
    expect(boom.game.hostView().errors).toBeNull();
    boom.clock.advance(BOMB_RESULT_MS);
    expect(boom.game.phase).toBe("podium");
    expect(boom.game.hostView().errors?.length).toBeGreaterThan(0);

    const { game } = boot([mc(0)], ["Ada"]);
    game.end();
    expect(game.phase).toBe("podium");
    expect(game.outcome).toBe("exploded");
  });

  test("in a race the first squad to finish wins, and ending the game keeps that", () => {
    const { game, clock, joined } = boot([mc(0)], ["Ada", "Ben"], { game: "race", squads: 2, modules: 2, wires: 2 });
    const ada = joined[0]!.id;
    for (let i = 0; i < 4; i++) {
      const wire = question(game, 0).wires.find((w) => w.correct)!;
      expect(cut(game, clock, ada, wire.id)).toBe(true);
      if (game.squads[0]!.pauseUntil) clock.advance(BOMB_NEXT_MS);
    }
    expect(game.squads[0]!.finished).toBe(true);
    expect(game.phase).toBe("defuse");
    expect(game.playerView(ada).squadState).toBe("defused");
    expect(game.playerView(joined[1]!.id).squadState).toBe("playing");
    game.end();
    expect(game.phase).toBe("podium");
    expect(game.outcome).toBe("defused");
    expect(game.headline()).toMatch(/defused their bomb/);
    const view = game.hostView();
    expect(view.squads.find((s) => s.index === 0)!.rank).toBe(1);
    expect(view.squads.find((s) => s.index === 1)!.rank).toBe(2);
    const csv = buildBombResultsCsv(game);
    const rows = csv.trim().split("\r\n").slice(1);
    expect(rows[0]).toContain("defused");
    expect(rows.some((r) => r.includes("exploded"))).toBe(true);
  });

  test("squad count follows the class until the host picks a number", () => {
    const clock = new FakeClock();
    const lobby = new Game(sampleQuiz({ questions: [mc(0)] }), { clock, rng });
    lobby.setMode("bomb");
    for (let i = 0; i < 7; i++) lobby.join(`P${i}`);
    expect(lobby.bomb.squads).toBe(2);
    expect(BombGame.recommendSquads(3, "together")).toBe(1);
    expect(BombGame.recommendSquads(6, "together")).toBe(1);
    expect(BombGame.recommendSquads(7, "together")).toBe(2);
    expect(BombGame.recommendSquads(3, "race")).toBe(2);

    lobby.setBomb({ ...lobby.bomb, minutes: 10 });
    expect(lobby.bomb.squads).toBe(2);
    lobby.setBomb({ ...lobby.bomb, squads: 4 });
    const first = [...lobby.players.keys()][0]!;
    lobby.kick(first);
    expect(lobby.bomb.squads).toBe(4);

    const race = new Game(sampleQuiz({ questions: [mc(0)] }), { clock, rng });
    race.setMode("bomb");
    race.setBomb({ ...DEFAULT_BOMB, game: "race", squads: 1 });
    expect(race.bomb.squads).toBe(2);
    expect(race.bomb.game).toBe("race");
  });

  test("a race cannot start with one squad", () => {
    const clock = new FakeClock();
    const lobby = new Game(sampleQuiz({ questions: [mc(0)] }), { clock, rng });
    lobby.setMode("bomb");
    lobby.setBomb({ ...DEFAULT_BOMB, game: "race", squads: 2, modules: 2, wires: 2, minutes: 3, penaltySec: 15 });
    lobby.join("Ada");
    const game = BombGame.fromLobby(lobby, { clock, rng });
    expect(() => game.start()).toThrow(/Race needs at least 2 squads/);
  });
});

/** Width and height from a WebP file's header (lossy, lossless or extended). */
function webpSize(bytes: Buffer): [number, number] {
  expect(bytes.toString("latin1", 0, 4) + bytes.toString("latin1", 8, 12)).toBe("RIFFWEBP");
  const chunk = bytes.toString("latin1", 12, 16);
  if (chunk === "VP8X") return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  if (chunk === "VP8L") {
    const v = bytes.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1];
  }
  return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
}

describe("art slots", () => {
  test("the art module lists exactly the WebPs in src/client/shared/bomb/, at their real sizes", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { BOMB_ART_SLOTS, BOMB_PHONE_ART, BOMB_PROJECTOR_ART } = await import("../src/client/shared/bomb-art.tsx");
    const dir = new URL("../src/client/shared/bomb/", import.meta.url);
    const byId = (a: [string, number[]], b: [string, number[]]) => (a[0] < b[0] ? -1 : 1);
    const onDisk = (sub: string) =>
      readdirSync(new URL(sub, dir))
        .filter((f) => f.endsWith(".webp"))
        .map((f): [string, number[]] => [f.replace(/\.webp$/, ""), webpSize(readFileSync(new URL(sub + f, dir)))])
        .sort(byId);
    const listed = (pick: (s: (typeof BOMB_ART_SLOTS)[number]) => { w: number; h: number } | null) =>
      BOMB_ART_SLOTS.flatMap((s): [string, number[]][] => {
        const f = pick(s);
        return f ? [[s.id, [f.w, f.h]]] : [];
      }).sort(byId);
    expect(listed((s) => s.projector)).toEqual(onDisk("./"));
    expect(listed((s) => s.phone)).toEqual(onDisk("phone/"));
    expect(Object.keys(BOMB_PROJECTOR_ART).sort()).toEqual(
      BOMB_ART_SLOTS.filter((s) => s.projector)
        .map((s) => s.id)
        .sort(),
    );
    expect(Object.keys(BOMB_PHONE_ART).sort()).toEqual(
      BOMB_ART_SLOTS.filter((s) => s.phone)
        .map((s) => s.id)
        .sort(),
    );
    expect(new Set(BOMB_ART_SLOTS.map((s) => s.id)).size).toBe(BOMB_ART_SLOTS.length);
    for (const s of BOMB_ART_SLOTS) {
      const rel = s.projector ? `${s.id}.webp` : `phone/${s.id}.webp`;
      const bytes = readFileSync(new URL(rel, dir));
      const alpha = bytes.toString("latin1", 12, 16) === "VP8X" && (bytes[20]! & 0x10) !== 0;
      expect([s.id, alpha]).toEqual([s.id, s.alpha]);
    }
  });
});
