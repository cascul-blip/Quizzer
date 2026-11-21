import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ModeMsg } from "../src/server/game/mode-entry.ts";
import { Game } from "../src/server/game/game.ts";
import { MODES } from "../src/server/game/modes.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import { GameHub, type SocketData } from "../src/server/ws.ts";
import { MODE_FLAGS } from "../src/shared/mode-flags.ts";
import { MODE_NAMES } from "../src/shared/mode-names.ts";
import type { ClientMsg, GameMode, ModeSettingsInput, ServerMsg } from "../src/shared/protocol.ts";
import type { SeasonTheme } from "../src/shared/season-theme.ts";
import { FakeClock, tempDir } from "./helpers.ts";

const GAME_MODES = Object.keys(MODES) as GameMode[];

/** The theme a mode doesn't start with, so a change is visible whatever the season. */
function otherTheme(mode: GameMode): SeasonTheme {
  const settings = MODES[mode].defaultSettings;
  return "theme" in settings && settings.theme === "christmas" ? "classic" : "christmas";
}

/** A valid change to every setting of each game mode, away from its defaults. */
const CHANGED: { [M in GameMode]: ModeSettingsInput[M] } = {
  classic: {},
  tower: { teams: 3, minutes: 7, monster: false, theme: otherTheme("tower") },
  submarine: {},
  fight: { hill: "high", theme: otherTheme("fight") },
  robot: {},
  land: { teams: 3, minutes: 7, theme: otherTheme("land") },
  racer: { theme: otherTheme("racer") },
  cup: { cups: 5, theme: otherTheme("cup") },
  siege: { waves: 10, theme: otherTheme("siege") },
  duel: { rounds: 20, theme: otherTheme("duel") },
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

/** Just enough of a Bun socket for the hub. */
function fakeSocket(data: Partial<SocketData>) {
  const sock = {
    data: { admin: false, ip: "127.0.0.1", role: "player", playerId: null, lastSent: null, lastView: null, behind: false, ...data } as SocketData,
    sent: [] as ServerMsg[],
    send(m: string) {
      sock.sent.push(JSON.parse(m));
      return m.length;
    },
    getBufferedAmount: () => 0,
  };
  return sock;
}
type Socket = ReturnType<typeof fakeSocket>;

const flush = () => new Promise((r) => setTimeout(r, 0));

let data: ReturnType<typeof tempDir>;
let hub: GameHub;
let host: Socket;
let quizId: string;
let store: QuizStore;

const send = (ws: Socket, msg: ClientMsg) => hub.onMessage(ws as never, JSON.stringify(msg));
const errors = (ws: Socket) => ws.sent.filter((m) => m.type === "error");

/** A phone's view in the lobby. */
function phoneLobbyView(playerId: string) {
  const view = hub.game?.playerView(playerId);
  if (view?.kind !== "player") throw new Error(`expected the lobby, got ${view?.kind}`);
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
    const phone = fakeSocket({});
    hub.onOpen(phone as never);
    send(phone, { type: "join", nickname });
    const joined = phone.sent.find((m) => m.type === "joined");
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
  hub = new GameHub(store, { clock: new FakeClock() });
  host = fakeSocket({ admin: true, role: "host" });
  hub.onOpen(host as never);
  send(host, { type: "host.hello" });
});

afterEach(() => {
  send(host, { type: "host.close" });
  data.cleanup();
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

      test(`phones in the lobby ${MODES[mode].lobbyBanner ? "show" : "don't show"} a mode banner`, () => {
        const [noel] = openLobby(mode, ["Noel"]);
        expect(phoneLobbyView(noel!.playerId).banner).toBe(MODES[mode].lobbyBanner ? mode : undefined);
      });

      test(`pacing ${MODE_FLAGS[mode].paced ? "is set during the game and carries over" : "is not available and doesn't carry over"}`, async () => {
        openLobby(mode, ["Noel"]);
        send(host, { type: "host.start", pacing: "auto" });
        send(host, { type: "host.setPacing", pacing: "auto" });
        expect(errors(host).map((e) => e.type === "error" && e.message)).toEqual(MODE_FLAGS[mode].paced ? [] : [`Not available in ${MODES[mode].name}`]);
        send(host, { type: "host.end" });
        await flush();
        send(host, { type: "host.open", quizId });
        expect(lobbyView().pacing).toBe(MODE_FLAGS[mode].paced ? "auto" : "manual");
      });

      test.if("theme" in MODES[mode].defaultSettings)("an unknown carried-over theme becomes the default, but the host can't choose it", () => {
        const defaults = MODES[mode].defaultSettings;
        const stale = { ...CHANGED[mode], theme: "halloween" };
        const lobby = new Game(store.get(quizId), { mode, settings: { [mode]: stale } as never });
        const expected: unknown = { ...defaults, ...CHANGED[mode], theme: "theme" in defaults ? defaults.theme : undefined };
        expect<unknown>(lobby.settings[mode]).toEqual(expected);
        expect(() => lobby.setModeSettings(mode, stale)).toThrow(/^Unknown .* theme$/);
      });

      test("the lobby handoff keeps each player's id and token", () => {
        const players = openLobby(mode, ["Noel", "Holly"]);
        send(host, { type: "host.start", pacing: "manual" });
        expect(errors(host)).toEqual([]);
        expect(hub.game!.phase).not.toBe("lobby");
        for (const { playerId, token } of players) {
          expect(hub.game!.players.has(playerId)).toBe(true);
          expect(hub.game!.byToken(token)?.id).toBe(playerId);
        }
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
          noel!.phone.sent = [];
          send(noel!.phone, PHONE_MSG[other]);
          await flush();
          expect({ other, sent: noel!.phone.sent }).toEqual({ other, sent: [] });
        }
      });
    });
  }
});
