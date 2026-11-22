import { describe, expect, test } from "bun:test";
import { CupGame } from "../src/server/game/cup.ts";
import { FightGame } from "../src/server/game/fight.ts";
import { GiftGame } from "../src/server/game/gift.ts";
import { LandGame } from "../src/server/game/land.ts";
import { Lobby } from "../src/server/game/lobby.ts";
import { RobotGame } from "../src/server/game/robot.ts";
import { SiegeGame } from "../src/server/game/siege.ts";
import { SubGame } from "../src/server/game/submarine.ts";
import { TowerGame } from "../src/server/game/tower.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

/** What every Streamed question mode's game gives a phone and the host. */
interface StreamedGame {
  readonly phase: string;
  readonly phaseEndsAt?: number;
  playerView(id: string): { question: unknown; feedback: unknown } | null;
  answer(id: string, seq: number, option: number): unknown;
  end(): void;
}

interface Scenario {
  clock: FakeClock;
  game: StreamedGame;
  id: string;
}

function lobbyFor(mode: "tower" | "land" | "fight" | "submarine" | "cup" | "robot" | "siege" | "gift") {
  const lobby = new Lobby(sampleQuiz());
  lobby.setMode(mode);
  lobby.setProtect(false);
  lobby.join("Ana");
  lobby.join("Ben");
  return lobby;
}

/** Each Streamed question mode, started and answering. */
const MODES: Record<string, () => Scenario> = {
  "Tallest Tower": () => {
    const clock = new FakeClock();
    const game = TowerGame.fromLobby(lobbyFor("tower").handoffFacts("tower"), { clock });
    game.start();
    clock.advance(3_000);
    return { clock, game, id: [...game.players.keys()][0]! };
  },
  "Land Grab": () => {
    const clock = new FakeClock();
    const game = LandGame.fromLobby(lobbyFor("land").handoffFacts("land"), { clock });
    game.start();
    clock.advance(3_000);
    return { clock, game, id: [...game.players.keys()][0]! };
  },
  "Hill Fight": () => {
    const clock = new FakeClock();
    const game = FightGame.fromLobby(lobbyFor("fight").handoffFacts("fight"), { clock });
    game.start();
    clock.advance(3_000);
    return { clock, game, id: [...game.players.keys()][0]! };
  },
  Submarine: () => {
    const clock = new FakeClock();
    const game = SubGame.fromLobby(lobbyFor("submarine").handoffFacts("submarine"), { clock });
    game.start();
    clock.advance(3_000);
    return { clock, game, id: [...game.players.keys()][0]! };
  },
  "Cup of Death": () => {
    const clock = new FakeClock();
    const game = CupGame.fromLobby(lobbyFor("cup").handoffFacts("cup"), { clock });
    game.start();
    clock.advance(3_000);
    clock.advance(game.phaseEndsAt - clock.now());
    return { clock, game, id: [...game.players.keys()][0]! };
  },
  "Robot Attack": () => {
    const clock = new FakeClock();
    const game = RobotGame.fromLobby(lobbyFor("robot").handoffFacts("robot"), { clock });
    game.start();
    clock.advance(3_000);
    return { clock, game, id: [...game.players.keys()][0]! };
  },
  "Kingdom Siege": () => {
    const clock = new FakeClock();
    const game = SiegeGame.fromLobby(lobbyFor("siege").handoffFacts("siege"), { clock });
    game.start();
    clock.advance(3_000);
    return { clock, game, id: [...game.players.keys()][0]! };
  },
  "Gift Grab": () => {
    const clock = new FakeClock();
    const game = GiftGame.fromLobby(lobbyFor("gift").handoffFacts("gift"), { clock });
    game.start();
    clock.advance(3_000);
    return { clock, game, id: [...game.players.keys()][0]! };
  },
};

/** Answer the player's current question, leaving the feedback flash running. */
function answerOnce({ game, id }: Scenario) {
  const question = game.playerView(id)!.question as { seq: number };
  expect(game.answer(id, question.seq, 0)).toBeTruthy();
}

describe("Streamed question feedback", () => {
  for (const [mode, start] of Object.entries(MODES)) {
    test(`${mode} shows feedback while answering and hides it once the game has finished`, () => {
      const scenario = start();
      answerOnce(scenario);
      expect(scenario.game.playerView(scenario.id)!.feedback).not.toBeNull();
      scenario.game.end();
      expect(scenario.game.phase).toBe("podium");
      expect(scenario.game.playerView(scenario.id)!.feedback).toBeNull();
      expect(scenario.game.playerView(scenario.id)!.question).toBeNull();
    });
  }

  test("Robot Attack hides feedback between rounds, in the move phase", () => {
    const { clock, game, id } = MODES["Robot Attack"]!();
    clock.advance(game.phaseEndsAt! - clock.now() - 500);
    answerOnce({ clock, game, id });
    expect(game.playerView(id)!.feedback).not.toBeNull();
    clock.advance(500);
    expect(game.phase).toBe("move");
    expect(game.playerView(id)!.feedback).toBeNull();
  });

  test("Cup of Death hides feedback between rounds, once the quiz is over", () => {
    const { clock, game, id } = MODES["Cup of Death"]!();
    clock.advance(game.phaseEndsAt! - clock.now() - 500);
    // A wrong answer, so the player is not safe and is still answering when the flash starts.
    const question = game.playerView(id)!.question as { seq: number; text: string };
    expect(game.answer(id, question.seq, question.text === "2 + 2?" ? 0 : 1)).toBe(true);
    expect(game.playerView(id)!.feedback).not.toBeNull();
    clock.advance(500);
    expect(game.phase).not.toBe("quiz");
    expect(game.playerView(id)!.feedback).toBeNull();
  });

  test("Gift Grab counts its bonus round as answering and keeps the feedback flash", () => {
    const clock = new FakeClock();
    const game = GiftGame.fromLobby(lobbyFor("gift").handoffFacts("gift"), { clock });
    game.start();
    clock.advance(3_000);
    const id = [...game.players.keys()][0]!;
    for (let i = 0; i < 5; i++) {
      const question = game.playerView(id)!.question!;
      expect(game.answer(id, question.seq, question.text === "2 + 2?" ? 1 : 0)).toBe(true);
      if (i < 4) clock.advance(1000);
    }
    const view = game.playerView(id)!;
    expect(view.bonus).not.toBeNull();
    expect(view.question).toBeNull();
    expect(view.feedback).not.toBeNull();
  });
});
