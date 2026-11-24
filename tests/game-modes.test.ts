import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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

/** A valid change to every setting of each game mode, away from its defaults. */
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

/** How many teams the lobby shows with CHANGED settings; null in solo modes. */
const TEAMS: { [M in GameMode]: number | null } = {
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

/** Modes played question by question, whose pacing the host sets and the next lobby keeps. */
const PACED = new Set<GameMode>(["classic", "racer", "duel", "memory"]);

/** Modes whose phones show a banner in the lobby. */
const BANNER = new Set<GameMode>(["siege"]);

/** Modes where Protect from abuse applies and the lobby offers it. */
const PROTECT = new Set<GameMode>(["tower", "submarine", "fight", "robot", "cup", "siege", "gift"]);

/** One phone message of each game mode. */
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

/** Open the quiz in a lobby set to the mode and join the players; returns each phone with the id and token it was given. */
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
  /** The question a host or phone view carries; undefined for a view without one. */
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
        expect(lobbyView().teams?.length ?? null).toBe(TEAMS[mode]);
        expect(phoneLobbyView(noel!.playerId).team !== null).toBe(TEAMS[mode] !== null);
      });

      test(`is declared ${PACED.has(mode) ? "paced" : "not paced"}, ${PROTECT.has(mode) ? "protected" : "not protected"}, ${BANNER.has(mode) ? "with" : "without"} a lobby banner`, () => {
        expect(SHARED_MODES[mode].flags.paced).toBe(PACED.has(mode));
        expect(SHARED_MODES[mode].flags.protect).toBe(PROTECT.has(mode));
        expect(MODES[mode].lobbyBanner).toBe(BANNER.has(mode));
        expect(PLAYER_MODES[mode].banner !== null).toBe(BANNER.has(mode));
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
        // Kingdom Siege adds a wave log after a blank line; the player rows come first in every mode.
        const rows = lines.slice(1, lines.indexOf(""));
        expect(lines[0]).toContain("Nickname");
        expect(rows).toHaveLength(nicknames.length);
        for (const nickname of nicknames) expect(rows.some((row) => row.includes(nickname))).toBe(true);
        const game = hub.game;
        if (!game || game instanceof Lobby) throw new Error("expected the finished game");
        const sheet = entryOf(game).results(game);
        for (const row of sheet.rows) expect(row).toHaveLength(sheet.header.length);
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
