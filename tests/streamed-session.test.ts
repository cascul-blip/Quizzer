import { describe, expect, test } from "bun:test";
import { GiftGame } from "../src/server/game/gift.ts";
import { Lobby } from "../src/server/game/lobby.ts";
import type { LobbyChoices } from "../src/server/game/lobby-facts.ts";
import type { BasePlayer } from "../src/server/game/roster.ts";
import type { AnswerTotals } from "../src/server/game/stream.ts";
import { StreamedSession } from "../src/server/game/streamed-session.ts";
import { SubGame } from "../src/server/game/submarine.ts";
import { randomAvatar } from "../src/shared/avatars.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

type Phase = "countdown" | "playing" | "podium";
type TestPlayer = BasePlayer & AnswerTotals;

const COUNTDOWN_MS = 3000;

function setup({ minutes = 1 as number | null, onActivity = true } = {}) {
  const clock = new FakeClock();
  const calls = { change: 0, activity: 0, finish: 0, podium: 0 };
  const q = sampleQuiz();
  const session: StreamedSession<TestPlayer, Phase> = new StreamedSession<TestPlayer, Phase>({
    questions: q.questions,
    shuffleAnswers: false,
    clock,
    rng: () => 0,
    countdownMs: COUNTDOWN_MS,
    minutes: minutes ?? undefined,
    inPlay: (phase) => phase === "playing",
    canAnswer: () => true,
    podium: {
      build: () => {
        calls.podium++;
        return {};
      },
      empty: () => ({}),
    },
    hub: {
      onChange: () => calls.change++,
      onActivity: onActivity ? () => calls.activity++ : undefined,
      onFinish: () => calls.finish++,
    },
  });
  const newPlayer = (base: BasePlayer) => base;
  const join = (name: string) => session.addPlayer(name, null, newPlayer);
  const start = () =>
    session.start(() => {
      session.startGameLength("playing");
      for (const p of session.players.values()) session.stream.open(p);
    });
  return { clock, calls, session, join, start, newPlayer };
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

  test("activity falls back to onChange without an onActivity callback", () => {
    const { session, calls } = setup({ onActivity: false });
    session.activity("someone");
    expect(calls.change).toBe(1);
    expect(calls.activity).toBe(0);
  });

  test("adoptLobby keeps the lobby's ids, tokens and choices", () => {
    const { session, newPlayer } = setup();
    const lobbyPlayer: BasePlayer = { id: "p1", token: "t1", nickname: "Ann", avatar: randomAvatar(() => 0), connected: true };
    const choices: LobbyChoices = { mode: "tower", settings: {}, protect: false, pacing: "manual" };
    session.adoptLobby({ players: [lobbyPlayer], choices }, newPlayer);
    expect(session.byToken("t1")?.id).toBe("p1");
    expect(session.choices).toBe(choices);
  });

  test("a late joiner gets a question while playing but not in the countdown", () => {
    const { session, join, start, clock } = setup();
    join("Ann");
    start();
    const early = join("Bob");
    expect(session.stream.fragment(early).question).toBeFalsy();
    clock.advance(COUNTDOWN_MS);
    const late = join("Cat");
    expect(session.stream.fragment(late).question).toBeTruthy();
  });

  test("adding and removing a player leave the broadcast to the mode", () => {
    const { session, join, calls } = setup();
    const ann = join("Ann");
    expect(session.removePlayer("nobody")).toBeNull();
    expect(session.removePlayer(ann.id)).toBe(ann);
    expect(calls.change).toBe(0);
  });

  test("start enters the countdown for its duration and broadcasts", () => {
    const { session, join, start, calls } = setup();
    join("Ann");
    expect(session.phases.durationMs).toBe(COUNTDOWN_MS);
    start();
    expect(session.phase).toBe("countdown");
    expect(session.phases.remainingMs()).toBe(COUNTDOWN_MS);
    expect(calls.change).toBe(1);
  });

  test("startGameLength without minutes refuses", () => {
    const { session } = setup({ minutes: null });
    expect(() => session.startGameLength("playing")).toThrow("no game length");
  });

  test("dispose cancels the countdown", () => {
    const { session, join, clock } = setup();
    join("Ann");
    let began = false;
    session.start(() => {
      began = true;
    });
    session.dispose();
    clock.advance(COUNTDOWN_MS * 2);
    expect(began).toBe(false);
  });

  test("builds the Podium once", () => {
    const { session, join, start, calls } = setup();
    join("Ann");
    start();
    session.end();
    expect(session.podium).toBe(session.podium);
    session.end();
    expect(calls.podium).toBe(1);
  });
});

describe("Late join and kick broadcast once", () => {
  function playing<G extends { start(): void }>(make: (lobby: Lobby, clock: FakeClock, onChange: () => void) => G) {
    const clock = new FakeClock();
    let changes = 0;
    const lobby = new Lobby(sampleQuiz());
    lobby.join("Ann");
    lobby.join("Bob");
    const game = make(lobby, clock, () => changes++);
    game.start();
    clock.advance(COUNTDOWN_MS);
    changes = 0;
    return { game, changes: () => changes };
  }

  test("Gift Grab", () => {
    const { game, changes } = playing((lobby, clock, onChange) => {
      lobby.setMode("gift");
      return GiftGame.fromLobby(lobby.handoffFacts("gift"), { clock, onChange });
    });
    const cat = game.join("Cat");
    expect(changes()).toBe(1);
    game.kick(cat.id);
    expect(changes()).toBe(2);
  });

  test("Sled Squad", () => {
    const { game, changes } = playing((lobby, clock, onChange) => {
      lobby.setMode("submarine");
      return SubGame.fromLobby(lobby.handoffFacts("submarine"), { clock, onChange });
    });
    const cat = game.join("Cat");
    expect(changes()).toBe(1);
    game.kick(cat.id);
    expect(changes()).toBe(2);
  });
});
