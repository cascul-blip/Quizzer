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

/** What every Streamed question mode's game gives a phone and the host. */
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

/** The only question's options: the first is right, the second wrong. */
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
  /** The game for the first player's scenario, not started. */
  game(clock: FakeClock): StreamedGame;
  /** How long after the start the first question can be answered. */
  toAnswering(clock: FakeClock, game: StreamedGame): void;
  /** Leave answering for a phase that is not the end, with the feedback flash of an answer still showing; null when the mode has none. */
  toBetween: ((scenario: Scenario) => void) | null;
}

/** Keep answering wrong, the moment each flash ends, until the game leaves the phases where it is answering. Leaves the clock inside the last flash. */
function answerUntilLeft(scenario: Scenario, answering: readonly string[]) {
  const { clock, game, id } = scenario;
  let answeredAt = -Infinity;
  // Off the whole seconds that phases last, so no phase ends at the very instant a flash does.
  clock.advance(37);
  for (let i = 0; i < 100_000 && answering.includes(game.phase); i++) {
    const question = game.playerView(id)!.question;
    if (question && game.answer(id, question.seq, WRONG)) answeredAt = clock.now();
    // Steps that do not end on the flash's end, so the check below sees a flash still showing.
    for (const ms of [130, 130, 130, 130, 130, 130, 130, 89, 1]) {
      if (answering.includes(game.phase)) clock.advance(ms);
    }
  }
  expect(game.phase).not.toBeOneOf(answering);
  expect(clock.now() - answeredAt).toBeLessThan(FEEDBACK_MS);
}

/** Answer wrong just before the quiz phase ends, then let it end. */
function answerThenQuizEnds({ clock, game, id }: Scenario) {
  clock.advance(game.phaseEndsAt! - clock.now() - 500);
  const question = game.playerView(id)!.question!;
  expect(game.answer(id, question.seq, WRONG)).toBe(true);
  expect(game.playerView(id)!.feedback).not.toBeNull();
  clock.advance(500);
}

/** Each Streamed question mode. */
const MODES: Record<string, StreamedMode> = {
  "Tallest Tower": {
    game: (clock) => TowerGame.fromLobby(lobbyFor("tower").handoffFacts("tower"), { clock }),
    toAnswering: (clock) => clock.advance(3_000),
    // Its only phases are the countdown, playing and the podium.
    toBetween: null,
  },
  "Land Grab": {
    game: (clock) => LandGame.fromLobby(lobbyFor("land").handoffFacts("land"), { clock }),
    toAnswering: (clock) => clock.advance(3_000),
    toBetween: null,
  },
  "Hill Fight": {
    game: (clock) => FightGame.fromLobby(lobbyFor("fight").handoffFacts("fight"), { clock }),
    toAnswering: (clock) => clock.advance(3_000),
    // The collapse is the only phase after playing; tests/fight.test.ts covers it with a tower that falls.
    toBetween: null,
  },
  Submarine: {
    game: (clock) => SubGame.fromLobby(lobbyFor("submarine").handoffFacts("submarine"), { clock }),
    toAnswering: (clock) => clock.advance(3_000),
    // Caught by the fish.
    toBetween: (scenario) => answerUntilLeft(scenario, ["chase"]),
  },
  "Cup of Death": {
    game: (clock) => CupGame.fromLobby(lobbyFor("cup").handoffFacts("cup"), { clock }),
    toAnswering: (clock, game) => {
      clock.advance(3_000);
      clock.advance(game.phaseEndsAt! - clock.now());
    },
    // A wrong answer, so the player is not safe and is still answering when the flash starts.
    toBetween: answerThenQuizEnds,
  },
  "Robot Attack": {
    game: (clock) => RobotGame.fromLobby(lobbyFor("robot").handoffFacts("robot"), { clock }),
    toAnswering: (clock) => clock.advance(3_000),
    toBetween: answerThenQuizEnds,
  },
  "Kingdom Siege": {
    game: (clock) => SiegeGame.fromLobby(lobbyFor("siege").handoffFacts("siege"), { clock }),
    toAnswering: (clock) => clock.advance(3_000),
    // Its build breaks count as answering; the ending cinematic (the wall stands or falls) does not.
    toBetween: (scenario) => answerUntilLeft(scenario, ["build", "wave"]),
  },
  "Gift Grab": {
    game: (clock) => GiftGame.fromLobby(lobbyFor("gift").handoffFacts("gift"), { clock }),
    toAnswering: (clock) => clock.advance(3_000),
    // Its bonus round is part of answering, so it has no phase between.
    toBetween: null,
  },
};

function started(mode: StreamedMode): Scenario {
  const clock = new FakeClock();
  const game = mode.game(clock);
  game.start();
  return { clock, game, id: [...game.players.keys()][0]! };
}

/** Answer the player's current question, leaving the feedback flash running. */
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
      mode.toAnswering(scenario.clock, scenario.game);
      answerOnce(scenario);
      expect(scenario.game.playerView(scenario.id)!.feedback).not.toBeNull();
      scenario.game.end();
      expect(scenario.game.phase).toBe("podium");
      expect(scenario.game.playerView(scenario.id)!.feedback).toBeNull();
      expect(scenario.game.playerView(scenario.id)!.question).toBeNull();
    });

    if (mode.toBetween) {
      test(`${name} hides the question and the feedback flash between rounds, once the quiz is over`, () => {
        const scenario = started(mode);
        mode.toAnswering(scenario.clock, scenario.game);
        mode.toBetween!(scenario);
        expect(scenario.game.phase).not.toBe("podium");
        expect(scenario.game.playerView(scenario.id)).toMatchObject({ question: null, feedback: null });
      });
    }
  }

  test("Cup of Death keeps the feedback flash of the answer that made a player safe, while the quiz goes on", () => {
    const clock = new FakeClock();
    const game = CupGame.fromLobby(lobbyFor("cup").handoffFacts("cup"), { clock });
    game.start();
    MODES["Cup of Death"]!.toAnswering(clock, game);
    const ana = [...game.players.values()][0]!;
    while (!ana.safe) {
      answerOnce({ clock, game, id: ana.id });
      if (!ana.safe) clock.advance(FEEDBACK_MS);
    }
    // Ben is not safe, so the quiz continues; Ana has nothing left to answer but still sees her last flash.
    expect(game.phase).toBe("quiz");
    expect(game.playerView(ana.id)!.question).toBeNull();
    expect(game.playerView(ana.id)!.feedback).not.toBeNull();
    clock.advance(FEEDBACK_MS);
    expect(game.playerView(ana.id)!.feedback).toBeNull();
  });

  test("Gift Grab counts its bonus round as answering and keeps the feedback flash", () => {
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
    expect(view.feedback).not.toBeNull();
  });
});
