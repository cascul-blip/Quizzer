import { describe, expect, test } from "bun:test";
import { Game, GameError } from "../src/server/game/game.ts";
import { GiftGame } from "../src/server/game/gift.ts";
import { type LiveGame, startLobbyGame } from "../src/server/game/lobby-handoff.ts";
import { RacerGame } from "../src/server/game/racer.ts";
import type { GameMode } from "../src/shared/protocol.ts";
import { FakeClock, sampleQuiz, tempDir } from "./helpers.ts";

function setup(mode: GameMode, players: string[]) {
  const clock = new FakeClock();
  const lobby = new Game(sampleQuiz(), { clock, mode, protect: false });
  const joined = players.map((name) => lobby.join(name));
  const events: string[] = [];
  let installed: LiveGame | null = null;
  const { dir, cleanup } = tempDir();
  const opts = {
    clock,
    dataDir: dir,
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
  return { lobby, joined, events, opts, cleanup, installed: () => installed as LiveGame | null };
}

describe("Lobby handoff", () => {
  test("an empty lobby refuses to start and installs nothing, so Start can be retried", () => {
    const { lobby, opts, installed, cleanup } = setup("gift", []);
    try {
      expect(() => startLobbyGame(lobby, undefined, opts)).toThrow(GameError);
      expect(installed()).toBeNull();
      expect(lobby.phase).toBe("lobby");
    } finally {
      cleanup();
    }
  });

  test("players carry their ids into the selected game, which the hub sees before it starts", () => {
    const { lobby, joined, events, opts, installed, cleanup } = setup("gift", ["Noel", "Holly"]);
    try {
      startLobbyGame(lobby, undefined, opts);
      const game = installed();
      expect(game).toBeInstanceOf(GiftGame);
      expect([...game!.players.keys()].sort()).toEqual(joined.map((p) => p.id).sort());
      expect(events[0]).toBe("install");
    } finally {
      cleanup();
    }
  });

  test("Racer carries the chosen pacing forward to the next lobby", () => {
    const { lobby, opts, installed, cleanup } = setup("racer", ["Noel"]);
    try {
      expect(startLobbyGame(lobby, "manual", opts)).toBe("manual");
      expect(installed()).toBeInstanceOf(RacerGame);
    } finally {
      cleanup();
    }
  });

  test("modes without pacing carry nothing forward", () => {
    const { lobby, opts, cleanup } = setup("gift", ["Noel"]);
    try {
      expect(startLobbyGame(lobby, "manual", opts)).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  test("classic starts in place and carries its pacing forward", () => {
    const { lobby, opts, installed, cleanup } = setup("classic", ["Noel"]);
    try {
      expect(startLobbyGame(lobby, "manual", opts)).toBe("manual");
      expect(installed()).toBeNull();
      expect(lobby.phase).not.toBe("lobby");
    } finally {
      cleanup();
    }
  });
});
