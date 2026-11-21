import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { ClassicGame, GameError } from "../src/server/game/classic.ts";
import { DuelGame } from "../src/server/game/duel.ts";
import { GiftGame } from "../src/server/game/gift.ts";
import { Lobby } from "../src/server/game/lobby.ts";
import { MODES } from "../src/server/game/modes.ts";
import { RacerGame } from "../src/server/game/racer.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
import type { GameMode } from "../src/shared/mode-entries.ts";
import { FakeClock, sampleQuiz, tempDir } from "./helpers.ts";
import { fakeHub, HubSocket } from "./hub-harness.ts";

let data: ReturnType<typeof tempDir>;
let hub: GameHub;
let store: QuizStore;
beforeEach(() => {
  data = tempDir();
  store = new QuizStore(data.dir);
  hub = fakeHub(store, new FakeClock());
});
afterEach(() => {
  hub.closeGame();
  data.cleanup();
});

async function setup(mode: GameMode, players: string[]) {
  const quiz = await store.create(sampleQuiz());
  const host = new HubSocket(hub, { admin: true });
  host.sendMsg({ type: "host.hello" });
  host.sendMsg({ type: "host.open", quizId: quiz.id });
  host.sendMsg({ type: "host.setMode", mode });
  host.sendMsg({ type: "host.setProtect", on: false });
  const lobby = hub.game;
  if (!(lobby instanceof Lobby)) throw new Error("Expected an open lobby");
  const phones = players.map((nickname) => {
    const phone = new HubSocket(hub);
    phone.sendMsg({ type: "join", nickname });
    return phone;
  });
  return { lobby, phones, joined: [...lobby.players.values()], host, quizId: quiz.id };
}

describe("Lobby handoff", () => {
  test("projector and phone switch from lobby views to Classic gameplay views", async () => {
    const {
      lobby,
      joined: [player],
      phones: [phone],
      host: projector,
    } = await setup("classic", ["Noel"]);
    const playerId = player!.id;

    expect(lobby.hostView()).toMatchObject({ kind: "lobby", mode: "classic", players: [{ id: playerId }] });
    expect(lobby.playerView(playerId)).toMatchObject({ kind: "lobby", mode: "classic", me: { id: playerId } });

    projector.sendMsg({ type: "host.start", pacing: "manual" });
    const { view: hostView } = await projector.hostState((v) => v.kind === "classic");
    const { view: phoneView } = await phone!.playerState((v) => v.kind === "classic");
    expect(hostView).toMatchObject({ kind: "classic", phase: "intro" });
    expect(phoneView).toMatchObject({ kind: "classic", phase: "intro", me: { id: playerId } });
    for (const field of ["mode", "settings", "teams", "shuffle", "protect"]) expect(hostView).not.toHaveProperty(field);
    for (const field of ["mode", "team", "banner"]) expect(phoneView).not.toHaveProperty(field);
  });

  test("an empty lobby refuses to start and installs nothing, so Start can be retried", async () => {
    const { lobby, host } = await setup("gift", []);
    host.sendMsg({ type: "host.start", pacing: "manual" });
    expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: "Wait for at least one player to join" });
    expect(hub.game).toBe(lobby);
    new HubSocket(hub).sendMsg({ type: "join", nickname: "Noel" });
    host.sendMsg({ type: "host.start", pacing: "manual" });
    expect(hub.game).toBeInstanceOf(GiftGame);
  });

  test("players carry their ids into the selected game", async () => {
    const { joined, host } = await setup("gift", ["Noel", "Holly"]);
    host.sendMsg({ type: "host.start", pacing: "manual" });
    const game = hub.game;
    expect(game).toBeInstanceOf(GiftGame);
    expect([...game!.players.keys()].sort()).toEqual(joined.map((p) => p.id).sort());
  });

  test.each(["no view", "projector view", "phone view"])("team assignments survive shrinking and growing with %s read between edits", async (read) => {
    const { lobby, joined, host } = await setup("tower", ["A", "B", "C", "D", "E"]);
    lobby.setModeSettings("tower", { teams: 3, minutes: 5 });
    lobby.setTeam(joined[3]!.id, 1);
    lobby.setModeSettings("tower", { teams: 2, minutes: 5 });
    if (read === "projector view") {
      expect(lobby.hostView().teams?.[0]?.members.map((p) => p.nickname)).toEqual(["A", "C"]);
    } else if (read === "phone view") {
      expect(lobby.playerView(joined[2]!.id)).toMatchObject({ team: { index: 0 } });
    }
    lobby.setModeSettings("tower", { teams: 4, minutes: 5 });

    host.sendMsg({ type: "host.start", pacing: "manual" });
    const game = hub.game;
    const expectedTeams = [0, 1, 0, 1, 1];
    expect(
      joined.map(({ id }) => {
        const view = game?.playerView(id);
        return view?.kind === "tower" ? view.team.index : null;
      }),
    ).toEqual(expectedTeams);
    expect(lobby.hostView().teams?.map((t) => t.members.map((p) => p.nickname))).toEqual([["A", "C"], ["B", "D", "E"], [], []]);
    expect(
      joined.map(({ id }) => {
        const view = lobby.playerView(id);
        return view.kind === "lobby" ? view.team?.index : null;
      }),
    ).toEqual(expectedTeams);
  });

  test("Racer and Showdown carry the chosen pacing forward to the next lobby", async () => {
    for (const [mode, kind] of [
      ["racer", RacerGame],
      ["duel", DuelGame],
    ] as const) {
      const { host, quizId } = await setup(mode, ["Noel", "Holly"]);
      host.sendMsg({ type: "host.start", pacing: "auto" });
      expect(hub.game).toBeInstanceOf(kind);
      host.sendMsg({ type: "host.open", quizId });
      expect(hub.hostView()).toMatchObject({ kind: "lobby", pacing: "auto" });
    }
  });

  test("modes without pacing carry nothing forward", async () => {
    const { host, quizId } = await setup("gift", ["Noel"]);
    host.sendMsg({ type: "host.start", pacing: "auto" });
    host.sendMsg({ type: "host.open", quizId });
    expect(hub.hostView()).toMatchObject({ kind: "lobby", pacing: "manual" });
  });

  test("Protect from abuse reaches the started mode as the host set it, and stays off in a mode that doesn't protect", async () => {
    for (const [mode, protect, expected] of [
      ["gift", true, true],
      ["gift", false, false],
      ["land", true, false],
    ] as const) {
      const { host } = await setup(mode, ["Noel"]);
      host.sendMsg({ type: "host.setProtect", on: protect });
      const start = spyOn(MODES[mode], "start");
      try {
        host.sendMsg({ type: "host.start", pacing: "manual" });
        expect(start.mock.calls[0]![0].protect).toBe(expected);
      } finally {
        start.mockRestore();
      }
    }
  });

  test("Classic installs before activation and preserves player identity", async () => {
    const { joined, host } = await setup("classic", ["Noel"]);
    const activate = ClassicGame.prototype.start;
    let installedBeforeActivation = false;
    // Classic has no gameplay view until activation starts.
    const observedStart = spyOn(ClassicGame.prototype, "start").mockImplementation(function (this: ClassicGame, pacing) {
      installedBeforeActivation = hub.game === this;
      activate.call(this, pacing);
    });
    try {
      host.sendMsg({ type: "host.start", pacing: "manual" });
      expect(installedBeforeActivation).toBe(true);
      const game = hub.game;
      expect(game?.phase).toBe("intro");
      expect(game?.byToken(joined[0]!.token)?.id).toBe(joined[0]!.id);
    } finally {
      observedStart.mockRestore();
    }
  });

  test("failed activation restores the lobby and its phone attachment so Start can be retried", async () => {
    const { lobby, phones, joined, host } = await setup("classic", ["Noel"]);
    const dispose = spyOn(ClassicGame.prototype, "dispose");
    const start = spyOn(ClassicGame.prototype, "start").mockImplementation(() => {
      throw new GameError("Unable to start");
    });
    try {
      host.sendMsg({ type: "host.start", pacing: "auto" });
      expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: "Unable to start" });
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(hub.game).toBe(lobby);
      expect(hub.hostView()).toMatchObject({ kind: "lobby", pacing: "manual" });
      expect(hub.playerView(phones[0]!)).toMatchObject({ kind: "lobby", me: { id: joined[0]!.id } });
    } finally {
      start.mockRestore();
      dispose.mockRestore();
    }
    host.sendMsg({ type: "host.start", pacing: "manual" });
    expect(hub.playerView(phones[0]!)).toMatchObject({ kind: "classic", phase: "intro", me: { id: joined[0]!.id } });
  });
});
