import { describe, expect, test } from "bun:test";
import { CupGame } from "../src/server/game/cup.ts";
import { FightGame } from "../src/server/game/fight.ts";
import { GiftGame } from "../src/server/game/gift.ts";
import { LandGame } from "../src/server/game/land.ts";
import { Lobby } from "../src/server/game/lobby.ts";
import { RobotGame } from "../src/server/game/robot.ts";
import { SiegeGame } from "../src/server/game/siege.ts";
import { FEEDBACK_MS } from "../src/server/game/stream.ts";
import { SubGame } from "../src/server/game/submarine.ts";
import { TowerGame } from "../src/server/game/tower.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

interface StreamedGame {
  readonly phase: string;
  readonly players: ReadonlyMap<string, unknown>;
  readonly phaseEndsAt?: number;
  playerView(id: string): { question: { seq: number } | null; feedback: unknown } | null;
  answer(id: string, seq: number, option: number): unknown;
  start(): void;
  end(): void;
}

interface Scenario {
  clock: FakeClock;
  game: StreamedGame;
  id: string;
}

const RIGHT = 0;
const WRONG = 1;

function lobbyFor(mode: "tower" | "land" | "fight" | "submarine" | "cup" | "robot" | "siege" | "gift") {
  const lobby = new Lobby(
    sampleQuiz({ questions: [{ id: "q1", type: "multiple_choice", text: "Pick the right one", timeLimitSec: 20, options: ["right", "wrong"], correct: [0] }] }),
  );
  lobby.setMode(mode);
  lobby.setProtect(false);
  lobby.join("Ana");
  lobby.join("Ben");
  return lobby;
}

interface StreamedMode {
  game(clock: FakeClock): StreamedGame;
  advanceToAnswering(clock: FakeClock, game: StreamedGame): void;
  /** why: null when the mode has no phase between answering and the end. */
  toBetween: ((scenario: Scenario) => void) | null;
}

/** why: leaves the clock inside the last flash, so callers can check it still shows. */
function answerUntilLeft(scenario: Scenario, answering: readonly string[]) {
  const { clock, game, id } = scenario;
  let answeredAt = -Infinity;
  // why: off the whole seconds, so no phase ends at the very instant a flash does.
  clock.advance(37);
  for (let i = 0; i < 100_000 && answering.includes(game.phase); i++) {
    const question = game.playerView(id)!.question;
    if (question && game.answer(id, question.seq, WRONG)) answeredAt = clock.now();
    // why: steps miss the flash's end, so the check below sees a flash still showing.
    for (const ms of [130, 130, 130, 130, 130, 130, 130, 89, 1]) {
      if (answering.includes(game.phase)) clock.advance(ms);
    }
  }
  expect(game.phase).not.toBeOneOf(answering);
  expect(clock.now() - answeredAt).toBeLessThan(FEEDBACK_MS);
}

function answerThenQuizEnds({ clock, game, id }: Scenario) {
  clock.advance(game.phaseEndsAt! - clock.now() - 500);
  const question = game.playerView(id)!.question!;
  expect(game.answer(id, question.seq, WRONG)).toBe(true);
  expect(game.playerView(id)!.feedback).not.toBeNull();
  clock.advance(500);
}

const MODES: Record<string, StreamedMode> = {
  "Tallest Tower": {
    game: (clock) => TowerGame.fromLobby(lobbyFor("tower").handoffFacts("tower"), { clock }),
    advanceToAnswering: (clock) => clock.advance(3_000),
    toBetween: null,
  },
  "Land Grab": {
    game: (clock) => LandGame.fromLobby(lobbyFor("land").handoffFacts("land"), { clock }),
    advanceToAnswering: (clock) => clock.advance(3_000),
    toBetween: null,
  },
  "Hill Fight": {
    game: (clock) => FightGame.fromLobby(lobbyFor("fight").handoffFacts("fight"), { clock }),
    advanceToAnswering: (clock) => clock.advance(3_000),
    // why: the collapse is covered in tests/fight.test.ts with a tower that falls.
    toBetween: null,
  },
  Submarine: {
    game: (clock) => SubGame.fromLobby(lobbyFor("submarine").handoffFacts("submarine"), { clock }),
    advanceToAnswering: (clock) => clock.advance(3_000),
    toBetween: (scenario) => answerUntilLeft(scenario, ["chase"]),
  },
  "Cup of Death": {
    game: (clock) => CupGame.fromLobby(lobbyFor("cup").handoffFacts("cup"), { clock }),
    advanceToAnswering: (clock, game) => {
      clock.advance(3_000);
      clock.advance(game.phaseEndsAt! - clock.now());
    },
    toBetween: answerThenQuizEnds,
  },
  "Robot Attack": {
    game: (clock) => RobotGame.fromLobby(lobbyFor("robot").handoffFacts("robot"), { clock }),
    advanceToAnswering: (clock) => clock.advance(3_000),
    toBetween: answerThenQuizEnds,
  },
  "Kingdom Siege": {
    game: (clock) => SiegeGame.fromLobby(lobbyFor("siege").handoffFacts("siege"), { clock }),
    advanceToAnswering: (clock) => clock.advance(3_000),
    toBetween: (scenario) => answerUntilLeft(scenario, ["build", "wave"]),
  },
  "Gift Grab": {
    game: (clock) => GiftGame.fromLobby(lobbyFor("gift").handoffFacts("gift"), { clock }),
    advanceToAnswering: (clock) => clock.advance(3_000),
    // why: its bonus round is within playing, not a phase between; see its own test below.
    toBetween: null,
  },
};

function started(mode: StreamedMode): Scenario {
  const clock = new FakeClock();
  const game = mode.game(clock);
  game.start();
  return { clock, game, id: [...game.players.keys()][0]! };
}

function answerOnce({ game, id }: Scenario, option = RIGHT) {
  const question = game.playerView(id)!.question!;
  expect(game.answer(id, question.seq, option)).toBeTruthy();
}

describe("Streamed question feedback", () => {
  for (const [name, mode] of Object.entries(MODES)) {
    test(`${name} shows no question or feedback during the countdown`, () => {
      const { game, id } = started(mode);
      expect(game.phase).toBe("countdown");
      expect(game.playerView(id)).toMatchObject({ question: null, feedback: null });
    });

    test(`${name} shows feedback while answering and hides it once the game has finished`, () => {
      const scenario = started(mode);
      mode.advanceToAnswering(scenario.clock, scenario.game);
      // why: wrong, so no mode moves the player off answering (Cup's safe step, Gift's bonus round).
      answerOnce(scenario, WRONG);
      expect(scenario.game.playerView(scenario.id)!.feedback).not.toBeNull();
      scenario.game.end();
      expect(scenario.game.phase).toBe("podium");
      expect(scenario.game.playerView(scenario.id)!.feedback).toBeNull();
      expect(scenario.game.playerView(scenario.id)!.question).toBeNull();
    });

    if (mode.toBetween) {
      test(`${name} hides the question and the feedback flash between rounds, once the quiz is over`, () => {
        const scenario = started(mode);
        mode.advanceToAnswering(scenario.clock, scenario.game);
        mode.toBetween!(scenario);
        expect(scenario.game.phase).not.toBe("podium");
        expect(scenario.game.playerView(scenario.id)).toMatchObject({ question: null, feedback: null });
      });
    }
  }

  test("Cup of Death hides the feedback flash once an answer makes a player safe, while the quiz goes on", () => {
    const clock = new FakeClock();
    const game = CupGame.fromLobby(lobbyFor("cup").handoffFacts("cup"), { clock });
    game.start();
    MODES["Cup of Death"]!.advanceToAnswering(clock, game);
    const ana = [...game.players.values()][0]!;
    while (!ana.safe) {
      answerOnce({ clock, game, id: ana.id });
      if (!ana.safe) clock.advance(FEEDBACK_MS);
    }
    expect(game.phase).toBe("quiz");
    expect(game.playerView(ana.id)).toMatchObject({ question: null, feedback: null });
    expect(game.answer(ana.id, 1, RIGHT)).toBe(false);
  });

  test("Gift Grab hides the question and the feedback flash during its bonus round", () => {
    const clock = new FakeClock();
    const game = GiftGame.fromLobby(lobbyFor("gift").handoffFacts("gift"), { clock });
    game.start();
    clock.advance(3_000);
    const id = [...game.players.keys()][0]!;
    for (let i = 0; i < 5; i++) {
      const question = game.playerView(id)!.question!;
      expect(game.answer(id, question.seq, RIGHT)).toBe(true);
      if (i < 4) clock.advance(1000);
    }
    const view = game.playerView(id)!;
    expect(view.bonus).not.toBeNull();
    expect(view.question).toBeNull();
    expect(view.feedback).toBeNull();
  });

  test("Gift Grab takes an answer one tick before the game's end and refuses it at the end", () => {
    const clock = new FakeClock();
    const game = GiftGame.fromLobby(lobbyFor("gift").handoffFacts("gift"), { clock });
    game.start();
    clock.advance(3_000);
    const id = [...game.players.keys()][0]!;
    clock.advance(game.hostView().remainingMs - 1);
    expect(game.answer(id, game.playerView(id)!.question!.seq, WRONG)).toBe(true);
    const seq = game.playerView(id)!.question!.seq;
    clock.advance(1);
    expect(game.playerView(id)).toMatchObject({ question: null, feedback: null });
    expect(game.answer(id, seq, RIGHT)).toBe(false);
  });
});
