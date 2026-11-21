import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PLAYER_MODES } from "../src/client/player/modes.tsx";
import type { ModeMsg } from "../src/server/game/mode-entry.ts";
import { Lobby } from "../src/server/game/lobby.ts";
import { MODES } from "../src/server/game/modes.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
import { MODE_FLAGS } from "../src/shared/mode-flags.ts";
import { MODE_NAMES } from "../src/shared/mode-names.ts";
import type { ClientMsg, GameMode, ModeSettingsInput, ServerMsg } from "../src/shared/protocol.ts";
import { FakeClock, tempDir } from "./helpers.ts";
import { fakeHub, HubSocket } from "./hub-harness.ts";

const GAME_MODES = Object.keys(MODES) as GameMode[];

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
};

/** Modes played question by question, whose pacing the host sets and the next lobby keeps. */
const PACED = new Set<GameMode>(["classic", "racer", "duel"]);

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
};


const flush = () => new Promise((r) => setTimeout(r, 0));

let data: ReturnType<typeof tempDir>;
let hub: GameHub;
let host: HubSocket;
let quizId: string;
let store: QuizStore;

const send = (ws: HubSocket, msg: ClientMsg) => ws.sendMsg(msg);
const errors = (ws: HubSocket) => ws.raw.filter((m) => m.type === "error");

/** A phone's view in the lobby. */
function phoneLobbyView(playerId: string) {
  const view = hub.game?.playerView(playerId);
  if (view?.kind !== "classic") throw new Error(`expected the lobby, got ${view?.kind}`);
  return view;
}

function lobbyView() {
  const view = hub.hostView();
  if (view.kind !== "classic") throw new Error(`expected the lobby, got ${view.kind}`);
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
  hub = fakeHub(store, new FakeClock());
  host = new HubSocket(hub, { admin: true, role: "host" });
  send(host, { type: "host.hello" });
});

afterEach(() => {
  send(host, { type: "host.close" });
  data.cleanup();
});

describe("Lobby handoff", () => {
  for (const mode of GAME_MODES) {
    test(`each player can reconnect to ${MODE_NAMES[mode]} with the same id and token`, () => {
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

describe("Mode settings carryover", () => {
  for (const mode of THEMED_MODES) {
    test(`${MODE_NAMES[mode]} restores the default theme when the carried-over theme is unknown`, () => {
      const stale = { ...CHANGED[mode], theme: "halloween" };
      const lobby = new Lobby(store.get(quizId), { mode, settings: { [mode]: stale } });
      expect(lobby.settings[mode]).toEqual({ ...CHANGED[mode], theme: "christmas" });
      expect(() => lobby.setModeSettings(mode, stale)).toThrow(/^Unknown .* theme$/);
    });
  }
});

describe("Game modes", () => {
  for (const mode of GAME_MODES) {
    describe(MODE_NAMES[mode], () => {
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
        expect(MODE_FLAGS[mode].paced).toBe(PACED.has(mode));
        expect(MODE_FLAGS[mode].protect).toBe(PROTECT.has(mode));
        expect(MODES[mode].lobbyBanner).toBe(BANNER.has(mode));
        expect(PLAYER_MODES[mode].banner !== null).toBe(BANNER.has(mode));
      });

      test(`phones in the lobby ${BANNER.has(mode) ? "show" : "don't show"} a mode banner`, () => {
        const [noel] = openLobby(mode, ["Noel"]);
        expect(phoneLobbyView(noel!.playerId).banner).toBe(BANNER.has(mode) ? mode : undefined);
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

      test("the results CSV has a header and one row per player", async () => {
        const nicknames = ["Noel", "Holly", "Ivy"];
        openLobby(mode, nicknames);
        send(host, { type: "host.start", pacing: "manual" });
        send(host, { type: "host.end" });
        await flush();
        // The CSV starts with a byte order mark, which trimStart drops.
        const lines = (hub.lastResults?.csv ?? "").trimStart().split("\r\n");
        // Kingdom Siege adds a wave log after a blank line; the player rows come first in every mode.
        const rows = lines.slice(1, lines.indexOf(""));
        expect(lines[0]).toContain("Nickname");
        expect(rows).toHaveLength(nicknames.length);
        for (const nickname of nicknames) expect(rows.some((row) => row.includes(nickname))).toBe(true);
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
});
