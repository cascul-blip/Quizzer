import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DuelGame } from "../src/server/game/duel.ts";
import { Game, GameError } from "../src/server/game/game.ts";
import { GiftGame } from "../src/server/game/gift.ts";
import { type LiveGame, startLobbyGame } from "../src/server/game/lobby-handoff.ts";
import { RacerGame } from "../src/server/game/racer.ts";
import type { GameMode } from "../src/shared/protocol.ts";
import { FakeClock, sampleQuiz, tempDir } from "./helpers.ts";

let data: ReturnType<typeof tempDir>;
beforeEach(() => {
  data = tempDir();
});
afterEach(() => data.cleanup());

function setup(mode: GameMode, players: string[]) {
  const clock = new FakeClock();
  const lobby = new Game(sampleQuiz(), { clock, mode, protect: false });
  const joined = players.map((name) => lobby.join(name));
  const events: string[] = [];
  let installed: LiveGame | null = null;
  const opts = {
    clock,
    dataDir: data.dir,
    onChange: () => events.push("change"),
    onActivity: () => {},
    onTick: () => {},
    onFinish: () => {},
    install: (game: LiveGame) => {
      installed = game;
      events.push("install");
    },
    log: () => {},
  };
  return { lobby, joined, events, opts, installedGame: (): LiveGame | null => installed };
}

describe("Lobby handoff", () => {
  test("an empty lobby refuses to start and installs nothing, so Start can be retried", () => {
    const { lobby, opts, installedGame } = setup("gift", []);
    expect(() => startLobbyGame(lobby, undefined, opts)).toThrow(GameError);
    expect(installedGame()).toBeNull();
    expect(lobby.phase).toBe("lobby");
  });

  test("players carry their ids into the selected game, which the hub sees before it starts", () => {
    const { lobby, joined, events, opts, installedGame } = setup("gift", ["Noel", "Holly"]);
    startLobbyGame(lobby, undefined, opts);
    const game = installedGame();
    expect(game).toBeInstanceOf(GiftGame);
    expect([...game!.players.keys()].sort()).toEqual(joined.map((p) => p.id).sort());
    expect(events[0]).toBe("install");
  });

  test("Racer and Showdown carry the chosen pacing forward to the next lobby", () => {
    for (const [mode, kind] of [["racer", RacerGame], ["duel", DuelGame]] as const) {
      const { lobby, opts, installedGame } = setup(mode, ["Noel", "Holly"]);
      expect(startLobbyGame(lobby, "manual", opts)).toBe("manual");
      expect(installedGame()).toBeInstanceOf(kind);
    }
  });

  test("modes without pacing carry nothing forward", () => {
    const { lobby, opts } = setup("gift", ["Noel"]);
    expect(startLobbyGame(lobby, "manual", opts)).toBeUndefined();
  });

  test("classic starts in place and carries its pacing forward", () => {
    const { lobby, opts, installedGame } = setup("classic", ["Noel"]);
    expect(startLobbyGame(lobby, "manual", opts)).toBe("manual");
    expect(installedGame()).toBeNull();
    expect(lobby.phase).not.toBe("lobby");
  });
});
