import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { LandGame } from "../src/server/game/land.ts";
import { COUNTDOWN_MS as LAND_COUNTDOWN_MS } from "../src/server/game/land.ts";
import { Lobby } from "../src/server/game/lobby.ts";
import { entryOf } from "../src/server/game/modes.ts";
import { records } from "../src/server/game/results.ts";
import { FEEDBACK_MS } from "../src/server/game/stream.ts";
import type { TowerGame } from "../src/server/game/tower.ts";
import { DROP_COOLDOWN_MS, COUNTDOWN_MS as TOWER_COUNTDOWN_MS } from "../src/server/game/tower.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
import { hexDistance } from "../src/shared/land-board.ts";
import type { GameMode } from "../src/shared/mode-entries.ts";
import type { ClientMsg, HostView, PlayerView } from "../src/shared/protocol.ts";
import { FakeClock, tempDir } from "./helpers.ts";
import { fakeHub, HubSocket } from "./hub-harness.ts";

/** Where the team modes show a player's team place: on the podium screen (by nickname), on the phone, and in the results sheet. */
interface RankReaders {
  podium: (view: HostView, nickname: string) => number | undefined;
  phone: (view: PlayerView | null) => number | undefined;
  sheetColumn: string;
}

type Team = { rank: number; members: { nickname: string }[] };
const byTeam = (teams: Team[], nickname: string) => teams.find((t) => t.members.some((m) => m.nickname === nickname))?.rank;

const READERS: Partial<Record<GameMode, RankReaders>> = {
  tower: {
    podium: (v, n) => (v.kind === "tower" ? byTeam(v.teams, n) : undefined),
    phone: (v) => (v?.kind === "tower" ? v.result?.teamRank : undefined),
    sheetColumn: "Team rank",
  },
  land: {
    podium: (v, n) => (v.kind === "land" ? byTeam(v.teams, n) : undefined),
    phone: (v) => (v?.kind === "land" ? v.result?.teamRank : undefined),
    sheetColumn: "Team rank",
  },
};

const NICKNAMES = ["Noel", "Holly", "Ivy"];

let data: ReturnType<typeof tempDir>;
let clock: FakeClock;
let hub: GameHub;
let host: HubSocket;
let quizId: string;

beforeEach(async () => {
  data = tempDir();
  const store = new QuizStore(data.dir);
  const quiz = await store.create({
    title: "Standings",
    questions: [
      { type: "true_false", text: "One", correct: [0] },
      { type: "true_false", text: "Two", correct: [1] },
    ],
  });
  quizId = quiz.id;
  clock = new FakeClock();
  hub = fakeHub(store, clock);
  host = new HubSocket(hub, { admin: true, role: "host" });
  host.sendMsg({ type: "host.hello" });
});

afterEach(() => {
  host.sendMsg({ type: "host.close" });
  data.cleanup();
});

/** The running game, for reading a player's question and for setting up an outcome that play leaves to chance. */
function running() {
  const game = hub.game;
  if (!game || game instanceof Lobby) throw new Error("expected a running game");
  return game;
}

type QuestionShown = { seq: number; index: number; text: string; options: string[] };

/** The player's open question, and the option that answers it correctly ("One" is True, "Two" is False). */
function question(id: string) {
  const view = running().playerView(id) as { question?: QuestionShown | null } | null;
  const q = view?.question;
  if (!q) throw new Error("expected an open question");
  return { ...q, right: q.options.indexOf(q.text === "One" ? "True" : "False") };
}

/** Answer `count` streamed questions correctly, waiting out each answer's feedback. */
function answerRight(mode: GameMode, phone: HubSocket, id: string, count: number) {
  for (let i = 0; i < count; i++) {
    const q = question(id);
    phone.sendMsg({ type: `${mode}.answer`, seq: q.seq, option: q.right } as ClientMsg);
    clock.advance(FEEDBACK_MS);
  }
}

/**
 * Start the mode with three players (and the given mode settings), let `play` act, end the game,
 * and read each player's place on the podium, phone and results sheet.
 */
async function finish(mode: GameMode, play: (phones: Map<string, HubSocket>, ids: Map<string, string>) => void = () => {}, settings?: Record<string, unknown>) {
  host.sendMsg({ type: "host.open", quizId });
  host.sendMsg({ type: "host.setMode", mode });
  if (settings) host.sendMsg({ type: "host.setModeSettings", mode, settings } as ClientMsg);
  const phones = new Map<string, HubSocket>();
  const ids = new Map<string, string>();
  for (const nickname of NICKNAMES) {
    const phone = new HubSocket(hub);
    phone.sendMsg({ type: "join", nickname });
    const joined = phone.raw.find((m) => m.type === "joined");
    if (joined?.type !== "joined") throw new Error(`${nickname} did not join`);
    phones.set(nickname, phone);
    ids.set(nickname, joined.playerId);
  }
  host.sendMsg({ type: "host.start", pacing: "manual" });
  play(phones, ids);
  host.sendMsg({ type: "host.end" });
  await new Promise((r) => setTimeout(r, 0));
  const readers = READERS[mode]!;
  const view = hub.hostView();
  const game = hub.game;
  if (!game || game instanceof Lobby) throw new Error("expected the finished game");
  const sheet = records(entryOf(game).results(game));
  return Object.fromEntries(
    NICKNAMES.map((n) => [
      n,
      {
        podium: readers.podium(view, n),
        phone: readers.phone(game.playerView(ids.get(n)!)),
        sheet: sheet.find((row) => row.Nickname === n)?.[readers.sheetColumn],
      },
    ]),
  );
}

function phoneAwards(nickname: string): string[] | undefined {
  const game = running();
  const p = [...game.players.values()].find((q) => q.nickname === nickname)!;
  const v = game.playerView(p.id);
  return v && (v.kind === "tower" || v.kind === "land") ? v.result?.awards : undefined;
}

describe("Podium in team modes", () => {
  test("in Tallest Tower, the podium screen, the phone and the results sheet agree on each team place and award, and stay unchanged after the game finishes", async () => {
    let game!: TowerGame;
    const places = await finish(
      "tower",
      (phones, ids) => {
        game = running() as TowerGame;
        clock.advance(TOWER_COUNTDOWN_MS);
        const noel = phones.get("Noel")!;
        answerRight("tower", noel, ids.get("Noel")!, 4);
        for (const zone of [1, 2, 3]) {
          noel.sendMsg({ type: "tower.drop", zone });
          clock.advance(DROP_COOLDOWN_MS);
        }
      },
      { teams: 3, minutes: 2, theme: "classic" },
    );
    // Changes after the finish do not reach the Podium.
    const holly = [...game.players.values()].find((p) => p.nickname === "Holly")!;
    holly.placed = 9;
    game.teams[holly.team]!.columns = [5, 5, 5];
    expect(places).toEqual({
      Noel: { podium: 1, phone: 1, sheet: 1 },
      Holly: { podium: 2, phone: 2, sheet: 2 },
      Ivy: { podium: 2, phone: 2, sheet: 2 },
    });
    const view = hub.hostView();
    expect(view.kind === "tower" && view.awards).toEqual({
      mostCorrect: { value: 4, nicknames: ["Noel"] },
      masterBuilder: { value: 3, nicknames: ["Noel"] },
    });
    expect(view.kind === "tower" && view.teams.map((t) => [t.rank, t.members.map((m) => m.nickname)])).toEqual([
      [1, ["Noel"]],
      [2, ["Holly"]],
      [2, ["Ivy"]],
    ]);
    expect(phoneAwards("Noel")).toEqual(["Most correct answers", "Master builder"]);
    expect(phoneAwards("Holly")).toEqual([]);
    const sheet = records(entryOf(game).results(game));
    expect(sheet.map((r) => [r.Nickname, r["Team rank"], r["Team blocks"]])).toEqual([
      ["Noel", 1, 3],
      ["Holly", 2, 0],
      ["Ivy", 2, 0],
    ]);
  });

  test("in Land Grab, a conquered player is ranked with the team they started on, and every screen agrees on places and awards", async () => {
    let game!: LandGame;
    const places = await finish(
      "land",
      (phones, ids) => {
        clock.advance(LAND_COUNTDOWN_MS);
        game = running() as LandGame;
        const noel = game.players.get(ids.get("Noel")!)!;
        noel.claims = 99;
        noel.state = "claim";
        const ring = (team: number) => game.owners.map((_, t) => t).filter((t) => hexDistance(game.size, game.teams[team]!.start, t) === 2);
        for (const team of [2, 1]) for (const tile of ring(team)) phones.get("Noel")!.sendMsg({ type: "land.place", tile });
      },
      { teams: 3, minutes: 5 },
    );
    const holly = [...game.players.values()].find((p) => p.nickname === "Holly")!;
    expect(holly.team).toBe(0); // conquered: plays on with Noel's team
    holly.captured = 99;
    expect(places).toEqual({
      Noel: { podium: 1, phone: 1, sheet: 1 },
      Holly: { podium: 2, phone: 2, sheet: 2 },
      Ivy: { podium: 3, phone: 3, sheet: 3 },
    });
    const view = hub.hostView();
    expect(view.kind === "land" && view.awards?.mostCorrect).toBeNull();
    expect(view.kind === "land" && view.awards?.topSettler?.nicknames).toEqual(["Noel"]);
    expect(view.kind === "land" && view.awards?.topSurrounder?.nicknames).toEqual(["Noel"]);
    expect(phoneAwards("Noel")).toEqual(["Top settler", "Master surrounder"]);
    expect(phoneAwards("Holly")).toEqual([]);
    const sheet = records(entryOf(game).results(game));
    expect(sheet.map((r) => [r.Nickname, r.Team, r["Team rank"]])).toEqual([
      ["Noel", "Red", 1],
      ["Holly", "Blue", 2],
      ["Ivy", "Yellow", 3],
    ]);
  });
});
