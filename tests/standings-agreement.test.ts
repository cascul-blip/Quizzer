import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Lobby } from "../src/server/game/lobby.ts";
import { entryOf } from "../src/server/game/modes.ts";
import { INTRO_MS } from "../src/server/game/paced-round.ts";
import { records } from "../src/server/game/results.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
import type { GameMode } from "../src/shared/mode-entries.ts";
import { SHARED_MODES } from "../src/shared/mode-entries.ts";
import type { HostView, PlayerView } from "../src/shared/protocol.ts";
import { FakeClock, tempDir } from "./helpers.ts";
import { fakeHub, HubSocket } from "./hub-harness.ts";

/** Where each ranked game mode shows a player's place: on the podium (by nickname), on the phone, and in the results sheet. */
interface RankReaders {
  podium: (view: HostView, nickname: string) => number | undefined;
  phone: (view: PlayerView | null) => number | undefined;
  sheetColumn: string;
}

type Team = { rank: number; members: { nickname: string }[] };
const byStanding = (rows: { nickname: string; rank: number }[] | null | undefined, nickname: string) => rows?.find((r) => r.nickname === nickname)?.rank;
const byTeam = (teams: Team[], nickname: string) => teams.find((t) => t.members.some((m) => m.nickname === nickname))?.rank;

const READERS: Partial<Record<GameMode, RankReaders>> = {
  classic: {
    podium: (v, n) => (v.kind === "classic" ? byStanding(v.leaderboard, n) : undefined),
    phone: (v) => (v?.kind === "classic" ? v.me.rank : undefined),
    sheetColumn: "Rank",
  },
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
  robot: {
    podium: (v, n) => (v.kind === "robot" ? byStanding(v.standings, n) : undefined),
    phone: (v) => (v?.kind === "robot" ? v.result?.rank : undefined),
    sheetColumn: "Rank",
  },
  cup: {
    podium: (v, n) => (v.kind === "cup" ? byStanding(v.standings, n) : undefined),
    phone: (v) => (v?.kind === "cup" ? v.result?.rank : undefined),
    sheetColumn: "Rank",
  },
  gift: {
    podium: (v, n) => (v.kind === "gift" ? byStanding(v.standings, n) : undefined),
    phone: (v) => (v?.kind === "gift" ? (v.rank ?? undefined) : undefined),
    sheetColumn: "Rank",
  },
  duel: {
    podium: (v, n) => (v.kind === "duel" ? byStanding(v.players, n) : undefined),
    phone: (v) => (v?.kind === "duel" ? v.result?.rank : undefined),
    sheetColumn: "Rank",
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

/** Start the mode with three players, let `play` act, end the game, and read each player's place on the podium, phone and results sheet. */
async function finish(mode: GameMode, play: (phones: Map<string, HubSocket>) => void = () => {}) {
  host.sendMsg({ type: "host.open", quizId });
  host.sendMsg({ type: "host.setMode", mode });
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
  play(phones);
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

describe("Standings", () => {
  for (const mode of ["tower", "land", "robot", "cup", "gift"] as const) {
    test(`in ${SHARED_MODES[mode].name}, tied players share first place on the podium, the phone and the results sheet`, async () => {
      const places = await finish(mode);
      for (const n of NICKNAMES) expect({ n, ...places[n] }).toEqual({ n, podium: 1, phone: 1, sheet: 1 });
    });
  }

  test("in Classic, the podium, the phone and the results sheet agree, and tied players share a place", async () => {
    const places = await finish("classic", (phones) => {
      clock.advance(INTRO_MS + 1000);
      phones.get("Noel")!.sendMsg({ type: "answer", qIndex: 0, option: 0 });
    });
    expect(places).toEqual({
      Noel: { podium: 1, phone: 1, sheet: 1 },
      Holly: { podium: 2, phone: 2, sheet: 2 },
      Ivy: { podium: 2, phone: 2, sheet: 2 },
    });
  });

  test("in Showdown, equal points share a place on the podium, the phone and the results sheet", async () => {
    const places = await finish("duel");
    const ranks = NICKNAMES.map((n) => places[n]!);
    for (const r of ranks) expect([r.phone, r.sheet]).toEqual([r.podium, r.podium]);
    expect(ranks.map((r) => r.podium)).toEqual([1, 1, 1]);
  });
});
