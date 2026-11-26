import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from "bun:test";
import { PLAYER_MODES } from "../src/client/player/modes.tsx";
import { GRACE_MS } from "../src/server/game/common.ts";
import { Lobby } from "../src/server/game/lobby.ts";
import type { ModeMsg } from "../src/server/game/mode-entry.ts";
import { entryOf, MODES } from "../src/server/game/modes.ts";
import { BOM } from "../src/server/game/results.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
import { keysOf } from "../src/shared/keys-of.ts";
import type { GameMode } from "../src/shared/mode-entries.ts";
import { SHARED_MODES } from "../src/shared/mode-entries.ts";
import type { ClientMsg, ModeSettingsInput } from "../src/shared/protocol.ts";
import { FakeClock, tempDir } from "./helpers.ts";
import { fakeHub, HubSocket } from "./hub-harness.ts";

const GAME_MODES = keysOf(MODES);

const THEMED_MODES = ["tower", "fight", "land", "racer", "cup", "siege", "duel"] as const satisfies readonly GameMode[];

const CHANGED: { [M in GameMode]: ModeSettingsInput[M] } = {
  classic: {},
  tower: { teams: 3, minutes: 7, monster: false, theme: "classic" },
  submarine: {},
  fight: { hill: "high", theme: "classic" },
  robot: {},
  land: { teams: 3, minutes: 7, theme: "classic" },
  racer: { theme: "classic" },
  cup: { cups: 5, theme: "classic" },
  siege: { waves: 10, theme: "classic" },
  duel: { rounds: 20, theme: "classic" },
  gift: { minutes: 3 },
  memory: { boardSize: 6 },
};

const TEAM_COUNTS_WITH_CHANGED_SETTINGS: { [M in GameMode]: number | null } = {
  classic: null,
  tower: 3,
  submarine: null,
  fight: 2,
  robot: null,
  land: 3,
  racer: null,
  cup: null,
  siege: null,
  duel: null,
  gift: null,
  memory: null,
};

const PACED = new Set<GameMode>(["classic", "racer", "duel", "memory"]);

const MODES_WITH_LOBBY_BANNER = new Set<GameMode>(["siege"]);

const MODES_WITH_PROTECT_FROM_ABUSE = new Set<GameMode>(["tower", "submarine", "fight", "robot", "cup", "siege", "gift"]);

const PHONE_MSG: { [M in GameMode]: ModeMsg<M> } = {
  classic: { type: "answer", qIndex: 0, option: 0 },
  tower: { type: "tower.drop", zone: 2 },
  submarine: { type: "sub.boost" },
  fight: { type: "fight.choose", action: "attack" },
  robot: { type: "robot.move", dir: "up" },
  land: { type: "land.done" },
  racer: { type: "racer.go" },
  cup: { type: "cup.pick", cup: 0 },
  siege: { type: "siege.place", defender: "archer", lane: 0, square: 1 },
  duel: { type: "duel.answer", index: 0, option: 0 },
  gift: { type: "gift.tap", round: 0, item: 0 },
  memory: { type: "memory.answer", index: 0, option: 0 },
};

const flush = () => new Promise((r) => setTimeout(r, 0));

let data: ReturnType<typeof tempDir>;
let clock: FakeClock;
let hub: GameHub;
let host: HubSocket;
let quizId: string;
let store: QuizStore;

const send = (ws: HubSocket, msg: ClientMsg) => ws.sendMsg(msg);
const errors = (ws: HubSocket) => ws.raw.filter((m) => m.type === "error");

function phoneLobbyView(playerId: string) {
  const view = hub.game?.playerView(playerId);
  if (view?.kind !== "lobby") throw new Error(`expected the lobby, got ${view?.kind}`);
  return view;
}

function lobbyView() {
  const view = hub.hostView();
  if (view.kind !== "lobby") throw new Error(`expected the lobby, got ${view.kind}`);
  return view;
}

function openLobby(mode: GameMode, nicknames: string[]) {
  send(host, { type: "host.open", quizId });
  send(host, { type: "host.setMode", mode });
  return nicknames.map((nickname) => {
    const phone = new HubSocket(hub);
    send(phone, { type: "join", nickname });
    const joined = phone.raw.find((m) => m.type === "joined");
    if (joined?.type !== "joined") throw new Error(`${nickname} did not join`);
    return { phone, playerId: joined.playerId, token: joined.token };
  });
}

beforeEach(async () => {
  data = tempDir();
  store = new QuizStore(data.dir);
  const quiz = await store.create({
    title: "Modes",
    questions: [
      { type: "true_false", text: "One", correct: [0] },
      { type: "true_false", text: "Two", correct: [1] },
      { type: "true_false", text: "Three", correct: [0] },
    ],
  });
  quizId = quiz.id;
  clock = new FakeClock();
  hub = fakeHub(store, clock);
  host = new HubSocket(hub, { admin: true, role: "host" });
  send(host, { type: "host.hello" });
});

afterEach(() => {
  jest.restoreAllMocks();
  send(host, { type: "host.close" });
  data.cleanup();
});

describe("Lobby handoff", () => {
  for (const mode of GAME_MODES) {
    test(`each player can reconnect to ${SHARED_MODES[mode].name} with the same id and token`, () => {
      const players = openLobby(mode, ["Noel", "Holly"]);
      send(host, { type: "host.start", pacing: "manual" });
      expect(errors(host)).toEqual([]);
      expect(hub.hostView().phase).not.toBe("lobby");
      for (const { phone, playerId, token } of players) {
        phone.close();
        const reconnected = new HubSocket(hub);
        send(reconnected, { type: "resume", token });
        expect(reconnected.raw).toContainEqual({ type: "joined", playerId, token, images: [] });
        expect(reconnected.view?.kind).toBe(mode);
        reconnected.close();
      }
    });
  }
});

describe("Starting", () => {
  for (const mode of GAME_MODES) {
    test(`${SHARED_MODES[mode].name} refuses to start again once running`, () => {
      openLobby(mode, ["Noel", "Holly"]);
      send(host, { type: "host.start", pacing: "manual" });
      expect(errors(host)).toEqual([]);
      const game = hub.game;
      if (!game || !("start" in game) || typeof game.start !== "function") throw new Error(`${mode} has no start()`);
      const phase = hub.hostView().phase;
      expect(() => game.start()).toThrow("The game has already started");
      expect(hub.hostView().phase).toBe(phase);
    });
  }
});

describe("Mode settings carryover", () => {
  for (const mode of THEMED_MODES) {
    test(`${SHARED_MODES[mode].name} restores the default theme when the carried-over theme is unknown`, () => {
      const stale = { ...CHANGED[mode], theme: "halloween" };
      const lobby = new Lobby(store.get(quizId), { mode, settings: { [mode]: stale } });
      expect(lobby.settings[mode]).toEqual({ ...CHANGED[mode], theme: "christmas" });
      expect(() => lobby.setModeSettings(mode, stale)).toThrow(/^Unknown .* theme$/);
    });
  }
});

describe("Phone message dispatch", () => {
  test("unknown phone messages report an error even before a phone attaches", () => {
    const phone = new HubSocket(hub);
    hub.onMessage(phone, JSON.stringify({ type: "toString" }));
    expect(errors(phone)).toEqual([{ type: "error", message: "Unknown message toString" }]);
  });

  test("a current-mode message is ignored until the phone attaches", () => {
    openLobby("tower", ["Noel"]);
    send(host, { type: "host.start", pacing: "manual" });
    const phone = new HubSocket(hub);
    phone.raw = [];
    send(phone, PHONE_MSG.tower);
    expect(phone.raw).toEqual([]);
  });

  test("a current-mode handler can force delivery of an unchanged phone view", async () => {
    const [{ phone }] = openLobby("tower", ["Noel"]);
    send(host, { type: "host.start", pacing: "manual" });
    await phone.playerState((view) => view.kind === "tower" && view.phase === "countdown");
    const before = phone.view;
    phone.raw = [];
    send(phone, PHONE_MSG.tower);
    expect(phone.raw).toEqual([{ type: "player.patch", ops: [] }]);
    expect(phone.view).toEqual(before);
  });
});

describe("Paced question round", () => {
  const questionOf = (view: object) => ("question" in view ? view.question : undefined);

  for (const mode of ["classic", "racer", "duel", "memory"] as const) {
    test(`${SHARED_MODES[mode].name} shows the question on the host and phone views without options before it opens, then with them and its deadline`, () => {
      const [noel] = openLobby(mode, ["Noel", "Holly"]);
      send(host, { type: "host.start", pacing: "manual" });
      const views = () => [questionOf(hub.hostView()), questionOf(hub.game!.playerView(noel!.playerId)!)];
      expect(["intro", "confidence"]).toContain(hub.hostView().phase);
      for (const question of views()) expect(question).toMatchObject({ index: 0, text: "One", options: [] });
      send(host, { type: "host.skip" });
      expect(hub.hostView().phase).toBe("open");
      for (const question of views()) expect(question).toMatchObject({ index: 0, text: "One", options: ["True", "False"], remainingMs: 20_000 });
      clock.advance(20_000 + GRACE_MS);
      expect(hub.hostView().phase).toBe("reveal");
      for (const question of views()) expect(question).toMatchObject({ options: ["True", "False"], remainingMs: 0 });
    });
  }
});

describe("Game modes", () => {
  for (const mode of GAME_MODES) {
    describe(SHARED_MODES[mode].name, () => {
      test("mode settings round-trip and carry over to the next lobby", async () => {
        openLobby(mode, ["Noel"]);
        send(host, { type: "host.setModeSettings", mode, settings: CHANGED[mode] } as ClientMsg);
        const chosen = lobbyView().settings[mode];
        expect(chosen).toMatchObject(CHANGED[mode]);

        send(host, { type: "host.start", pacing: "manual" });
        send(host, { type: "host.end" });
        await flush();
        send(host, { type: "host.open", quizId });
        expect(errors(host)).toEqual([]);
        expect(lobbyView().mode).toBe(mode);
        expect(lobbyView().settings[mode]).toEqual(chosen);
      });

      test("the lobby shows the mode's teams", () => {
        const [noel] = openLobby(mode, ["Noel"]);
        send(host, { type: "host.setModeSettings", mode, settings: CHANGED[mode] } as ClientMsg);
        expect(lobbyView().teams?.length ?? null).toBe(TEAM_COUNTS_WITH_CHANGED_SETTINGS[mode]);
        expect(phoneLobbyView(noel!.playerId).team !== null).toBe(TEAM_COUNTS_WITH_CHANGED_SETTINGS[mode] !== null);
      });

      test(`is declared ${PACED.has(mode) ? "paced" : "not paced"}, ${MODES_WITH_PROTECT_FROM_ABUSE.has(mode) ? "protected" : "not protected"}, ${MODES_WITH_LOBBY_BANNER.has(mode) ? "with" : "without"} a lobby banner`, () => {
        expect(SHARED_MODES[mode].flags.paced).toBe(PACED.has(mode));
        expect(SHARED_MODES[mode].flags.protect).toBe(MODES_WITH_PROTECT_FROM_ABUSE.has(mode));
        expect(MODES[mode].lobbyBanner).toBe(MODES_WITH_LOBBY_BANNER.has(mode));
        expect(PLAYER_MODES[mode].banner !== null).toBe(MODES_WITH_LOBBY_BANNER.has(mode));
      });

      test("the phone lobby view carries the selected mode", () => {
        const [noel] = openLobby(mode, ["Noel"]);
        expect(phoneLobbyView(noel!.playerId).mode).toBe(mode);
      });

      test(`pacing ${PACED.has(mode) ? "is set during the game and carries over" : "is not available and doesn't carry over"}`, async () => {
        openLobby(mode, ["Noel"]);
        send(host, { type: "host.start", pacing: "auto" });
        send(host, { type: "host.setPacing", pacing: "auto" });
        expect(errors(host).map((e) => e.type === "error" && e.message)).toEqual(PACED.has(mode) ? [] : [`Not available in ${MODES[mode].name}`]);
        send(host, { type: "host.end" });
        await flush();
        send(host, { type: "host.open", quizId });
        expect(lobbyView().pacing).toBe(PACED.has(mode) ? "auto" : "manual");
      });

      test("the results sheet is saved as a CSV with a BOM, a header, and one row per player as wide as the header", async () => {
        const nicknames = ["Noel", "Holly", "Ivy"];
        openLobby(mode, nicknames);
        send(host, { type: "host.start", pacing: "manual" });
        send(host, { type: "host.end" });
        await flush();
        const csv = hub.lastResults?.csv ?? "";
        expect(csv).toStartWith(BOM);
        const lines = csv.slice(1).split("\r\n");
        const resultsRowsBeforeAppendix = lines.slice(1, lines.indexOf(""));
        expect(lines[0]).toContain("Nickname");
        expect(resultsRowsBeforeAppendix).toHaveLength(nicknames.length);
        for (const nickname of nicknames) expect(resultsRowsBeforeAppendix.some((row) => row.includes(nickname))).toBe(true);
        const game = hub.game;
        if (!game || game instanceof Lobby) throw new Error("expected the finished game");
        const sheet = entryOf(game).results(game);
        for (const row of sheet.rows) expect(row).toHaveLength(sheet.header.length);
      });

      test("sends the podium to the projector and phone when the results sheet fails", async () => {
        const [noel] = openLobby(mode, ["Noel"]);
        send(host, { type: "host.start", pacing: "manual" });
        await host.hostState((view) => view.kind === mode);
        const results = spyOn(MODES[mode], "results").mockImplementation(() => {
          throw new Error("Results sheet failed");
        });

        send(host, { type: "host.end" });

        expect(errors(host)).toEqual([]);
        await host.hostState((view) => view.kind === mode && view.phase === "podium");
        await noel!.phone.playerState((view) => view.kind === mode && view.phase === "podium");
        expect(results).toHaveBeenCalledTimes(1);
      });

      test("a phone message for a game mode that isn't running is ignored", async () => {
        const [noel] = openLobby(mode, ["Noel"]);
        send(host, { type: "host.start", pacing: "manual" });
        await flush();
        for (const other of GAME_MODES.filter((m) => m !== mode)) {
          noel!.phone.raw = [];
          send(noel!.phone, PHONE_MSG[other]);
          await flush();
          expect({ other, sent: noel!.phone.raw }).toEqual({ other, sent: [] });
        }
      });
    });
  }

  test("Kingdom Siege sends the podium and keeps the results sheet when its finish hook fails", async () => {
    const [noel] = openLobby("siege", ["Noel"]);
    send(host, { type: "host.start", pacing: "manual" });
    await host.hostState((view) => view.kind === "siege");
    const finished = spyOn(MODES.siege, "finished").mockImplementation(() => {
      throw new Error("Finish hook failed");
    });

    send(host, { type: "host.end" });

    expect(errors(host)).toEqual([]);
    await host.hostState((view) => view.kind === "siege" && view.phase === "podium");
    await noel!.phone.playerState((view) => view.kind === "siege" && view.phase === "podium");
    expect(hub.lastResults?.csv).toContain("Noel");
    expect(finished).toHaveBeenCalledTimes(1);
  });

  test("closing a lobby that never started keeps its mode for the next lobby", () => {
    openLobby("robot", ["Noel"]);
    send(host, { type: "host.close" });
    send(host, { type: "host.open", quizId });
    expect(lobbyView().mode).toBe("robot");
  });

  test("closing a game after its start keeps its mode for the next lobby", () => {
    openLobby("cup", ["Noel"]);
    send(host, { type: "host.start", pacing: "manual" });
    send(host, { type: "host.close" });
    send(host, { type: "host.open", quizId });
    expect(lobbyView().mode).toBe("cup");
  });
});

const STREAMED_MODES = ["tower", "gift", "submarine", "fight", "robot", "land", "cup", "siege"] as const satisfies readonly GameMode[];
type StreamedMode = (typeof STREAMED_MODES)[number];

const VISIBLE_COUNTDOWN_DURATION_MS: { [M in StreamedMode]: number | null } = {
  tower: null,
  gift: null,
  submarine: null,
  fight: null,
  robot: 3_000,
  land: null,
  cup: 3_000,
  siege: 3_000,
};

const REMAINING_FIELD: { [M in StreamedMode]: "remainingMs" | "phaseRemainingMs" } = {
  tower: "remainingMs",
  gift: "remainingMs",
  submarine: "phaseRemainingMs",
  fight: "phaseRemainingMs",
  robot: "phaseRemainingMs",
  land: "remainingMs",
  cup: "phaseRemainingMs",
  siege: "phaseRemainingMs",
};

const PODIUM_JOIN_ERROR: { [M in StreamedMode]: string } = {
  tower: "This game has finished",
  gift: "This game has finished accepting players",
  submarine: "This game has finished",
  fight: "This game has finished",
  robot: "This game has finished",
  land: "This game has finished",
  cup: "This game has finished",
  siege: "This game has finished",
};

describe("Streamed modes' visible output", () => {
  // why: building the game without the hub lets the suite count every broadcast it asks for, and see it before Start.
  function streamedGame<M extends StreamedMode>(mode: M) {
    const lobby = new Lobby(store.get(quizId), { mode });
    lobby.join("Noel");
    lobby.join("Holly");
    const broadcasts = { count: 0 };
    const { game } = MODES[mode].start(lobby.handoffFacts(mode), {
      clock,
      dataDir: data.dir,
      onChange: () => broadcasts.count++,
      onActivity: () => broadcasts.count++,
      onTick: () => {},
      onFinish: () => {},
    });
    return { game, broadcasts };
  }

  for (const mode of STREAMED_MODES) {
    describe(SHARED_MODES[mode].name, () => {
      test("a late join broadcasts exactly once, and so does a host kick", () => {
        const { game, broadcasts } = streamedGame(mode);
        game.start();
        clock.advance(10_000);
        broadcasts.count = 0;
        const late = game.join("Ivy");
        expect(broadcasts.count).toBe(1);
        broadcasts.count = 0;
        game.kick(late.id);
        expect(broadcasts.count).toBe(1);
        game.dispose();
      });

      test("before Start the host sees the real countdown, then counts it down", () => {
        const { game } = streamedGame(mode);
        const before = game.hostView();
        expect(before.phase).toBe("countdown");
        expect("phaseDurationMs" in before ? before.phaseDurationMs : null).toBe(VISIBLE_COUNTDOWN_DURATION_MS[mode]);
        game.start();
        const started = game.hostView();
        expect(new Map(Object.entries(started)).get(REMAINING_FIELD[mode])).toBe(3_000);
        game.dispose();
      });

      test("a join during the podium is refused with the mode's message", () => {
        const { game } = streamedGame(mode);
        game.start();
        game.end();
        expect(game.phase).toBe("podium");
        expect(() => game.join("Ivy")).toThrow(PODIUM_JOIN_ERROR[mode]);
        game.dispose();
      });

      test("a kick outside active play still broadcasts once, before Start and in the countdown", () => {
        const { game, broadcasts } = streamedGame(mode);
        const early = game.join("Ivy");
        broadcasts.count = 0;
        game.kick(early.id);
        expect(broadcasts.count).toBe(1);
        game.start();
        expect(game.phase).toBe("countdown");
        const late = game.join("Rudy");
        broadcasts.count = 0;
        game.kick(late.id);
        expect(broadcasts.count).toBe(1);
        game.dispose();
      });
    });
  }
});
