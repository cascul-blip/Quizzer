import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { DuelGame } from "../src/server/game/duel.ts";
import { ClassicGame, GameError } from "../src/server/game/game.ts";
import { Lobby } from "../src/server/game/lobby.ts";
import { GiftGame } from "../src/server/game/gift.ts";
import type { LiveGame } from "../src/server/game/mode-entry.ts";
import { MODES } from "../src/server/game/modes.ts";
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
  const lobby = new Lobby(sampleQuiz(), { mode, protect: false });
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
    install: (game: LiveGame, activate: () => void) => {
      installed = game;
      events.push("install");
      activate();
    },
    log: () => {},
  };
  return { lobby, joined, events, opts, installedGame: (): LiveGame | null => installed };
}

describe("Lobby handoff", () => {
  test("an empty lobby refuses to start and installs nothing, so Start can be retried", () => {
    const { lobby, opts, installedGame } = setup("gift", []);
    expect(() => lobby.start(undefined, opts)).toThrow(GameError);
    expect(installedGame()).toBeNull();
    expect(lobby.phase).toBe("lobby");
  });

  test("players carry their ids into the selected game, which the hub sees before it starts", () => {
    const { lobby, joined, events, opts, installedGame } = setup("gift", ["Noel", "Holly"]);
    lobby.start(undefined, opts);
    const game = installedGame();
    expect(game).toBeInstanceOf(GiftGame);
    expect([...game!.players.keys()].sort()).toEqual(joined.map((p) => p.id).sort());
    expect(events[0]).toBe("install");
  });

  test("Racer and Showdown carry the chosen pacing forward to the next lobby", () => {
    for (const [mode, kind] of [["racer", RacerGame], ["duel", DuelGame]] as const) {
      const { lobby, opts, installedGame } = setup(mode, ["Noel", "Holly"]);
      lobby.start("auto", opts);
      expect(lobby.choices.pacing).toBe("auto");
      expect(installedGame()).toBeInstanceOf(kind);
    }
  });

  test("modes without pacing carry nothing forward", () => {
    const { lobby, opts } = setup("gift", ["Noel"]);
    lobby.start("auto", opts);
    expect(lobby.choices.pacing).toBe("manual");
  });

  test("Protect from abuse reaches the started mode as the host set it, and stays off in a mode that doesn't protect", () => {
    for (const [mode, host, expected] of [["gift", true, true], ["gift", false, false], ["land", true, false]] as const) {
      const { lobby, opts } = setup(mode, ["Noel"]);
      lobby.setProtect(host);
      const start = spyOn(MODES[mode], "start");
      try {
        lobby.start(undefined, opts);
        expect(start.mock.calls[0]![0].protect).toBe(expected);
      } finally {
        start.mockRestore();
      }
    }
  });

  test("Classic installs before its first view and preserves player identity", () => {
    const { lobby, joined, events, opts, installedGame } = setup("classic", ["Noel"]);
    lobby.start("manual", opts);
    expect(lobby.choices.pacing).toBe("manual");
    const game = installedGame();
    expect(game).toBeInstanceOf(ClassicGame);
    expect(game?.phase).toBe("intro");
    expect(game?.byToken(joined[0]!.token)?.id).toBe(joined[0]!.id);
    expect(events[0]).toBe("install");
  });
});
