import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { CupGame } from "../src/server/game/cup.ts";
import type { GiftGame } from "../src/server/game/gift.ts";
import type { LandGame } from "../src/server/game/land.ts";
import { COUNTDOWN_MS as LAND_COUNTDOWN_MS } from "../src/server/game/land.ts";
import { Lobby } from "../src/server/game/lobby.ts";
import { entryOf } from "../src/server/game/modes.ts";
import { INTRO_MS } from "../src/server/game/paced-round.ts";
import { records } from "../src/server/game/results.ts";
import type { RobotGame } from "../src/server/game/robot.ts";
import { FEEDBACK_MS } from "../src/server/game/stream.ts";
import { DROP_COOLDOWN_MS, COUNTDOWN_MS as TOWER_COUNTDOWN_MS } from "../src/server/game/tower.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
import { GIFT_GOODS, GIFT_READY_MS } from "../src/shared/gift-rules.ts";
import { hexDistance } from "../src/shared/land-board.ts";
import type { GameMode } from "../src/shared/mode-entries.ts";
import { SHARED_MODES } from "../src/shared/mode-entries.ts";
import type { ClientMsg, HostView, PlayerView } from "../src/shared/protocol.ts";
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
const GIFT_COUNTDOWN_MS = 3_000;

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

  test("in Showdown, points place players first and correct answers split equal points", async () => {
    // One three-way arena: Noel is right first and wins it, Holly is right but slower, Ivy doesn't answer.
    const places = await finish("duel", (phones, ids) => {
      clock.advance(INTRO_MS);
      for (const n of ["Noel", "Holly"]) {
        const q = question(ids.get(n)!);
        phones.get(n)!.sendMsg({ type: "duel.answer", index: q.index, option: q.right });
        clock.advance(1000);
      }
    });
    expect(places).toEqual({
      Noel: { podium: 1, phone: 1, sheet: 1 },
      Holly: { podium: 2, phone: 2, sheet: 2 },
      Ivy: { podium: 3, phone: 3, sheet: 3 },
    });
  });

  test("in Tallest Tower, the team that builds is first and the teams that don't share second", async () => {
    const places = await finish(
      "tower",
      (phones, ids) => {
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
    expect(places).toEqual({
      Noel: { podium: 1, phone: 1, sheet: 1 },
      Holly: { podium: 2, phone: 2, sheet: 2 },
      Ivy: { podium: 2, phone: 2, sheet: 2 },
    });
  });

  test("in Land Grab, the team with more tiles is first and equal teams share second", async () => {
    const places = await finish(
      "land",
      (phones, ids) => {
        clock.advance(LAND_COUNTDOWN_MS);
        const noel = phones.get("Noel")!;
        answerRight("land", noel, ids.get("Noel")!, 3);
        noel.sendMsg({ type: "land.place", tile: 0 });
      },
      { teams: 3, minutes: 5 },
    );
    expect(places).toEqual({
      Noel: { podium: 1, phone: 1, sheet: 1 },
      Holly: { podium: 2, phone: 2, sheet: 2 },
      Ivy: { podium: 2, phone: 2, sheet: 2 },
    });
  });

  test("in Land Grab, knocked-out teams come last, the first one out at the bottom, and their players keep their starting team's place on every screen", async () => {
    const places = await finish(
      "land",
      (phones, ids) => {
        clock.advance(LAND_COUNTDOWN_MS);
        const game = running() as LandGame;
        // Claims are earned three questions at a time; skip to a purse that can wall in two starts.
        const noel = game.players.get(ids.get("Noel")!)!;
        noel.claims = 99;
        noel.state = "claim";
        const ring = (team: number) => game.owners.map((_, t) => t).filter((t) => hexDistance(game.size, game.teams[team]!.start, t) === 2);
        for (const [team, nickname] of [
          [2, "Ivy"],
          [1, "Holly"],
        ] as const) {
          expect(game.hostView().teams[team]!.members.map((m) => m.nickname)).toEqual([nickname]);
          for (const tile of ring(team)) phones.get("Noel")!.sendMsg({ type: "land.place", tile });
          expect(game.teams[team]!.out).toBe(true);
        }
      },
      { teams: 3, minutes: 5 },
    );
    const view = hub.hostView();
    expect(view.kind === "land" && view.teams.map((t) => [t.name, t.rank, t.out, t.members.map((m) => m.nickname)])).toEqual([
      ["Red", 1, false, ["Noel"]],
      ["Blue", 2, true, ["Holly"]],
      ["Yellow", 3, true, ["Ivy"]],
    ]);
    // A conquered player plays on with the conquerors, but finishes in the place of the team they started on.
    expect(places).toEqual({
      Noel: { podium: 1, phone: 1, sheet: 1 },
      Holly: { podium: 2, phone: 2, sheet: 2 },
      Ivy: { podium: 3, phone: 3, sheet: 3 },
    });
  });

  test("in Robot Attack, a player who lost a life comes after those who didn't, who share first", async () => {
    // Which players the lasers hit depends on the random board, so set the lives the attacks would leave.
    const places = await finish("robot", (_phones, ids) => {
      (running() as RobotGame).players.get(ids.get("Holly")!)!.lives--;
    });
    expect(places).toEqual({
      Noel: { podium: 1, phone: 1, sheet: 1 },
      Holly: { podium: 3, phone: 3, sheet: 3 },
      Ivy: { podium: 1, phone: 1, sheet: 1 },
    });
  });

  test("in Cup of Death, a player knocked out comes after the survivors, who share first", async () => {
    // Which cup is the bad one is random, so set the round the drink would knock Ivy out in.
    const places = await finish("cup", (_phones, ids) => {
      (running() as CupGame).players.get(ids.get("Ivy")!)!.outRound = 1;
    });
    expect(places).toEqual({
      Noel: { podium: 1, phone: 1, sheet: 1 },
      Holly: { podium: 1, phone: 1, sheet: 1 },
      Ivy: { podium: 3, phone: 3, sheet: 3 },
    });
  });

  test("in Gift Grab, the player who grabs a gift is first and the others share second", async () => {
    const places = await finish("gift", (phones, ids) => {
      clock.advance(GIFT_COUNTDOWN_MS);
      const id = ids.get("Noel")!;
      const noel = phones.get("Noel")!;
      answerRight("gift", noel, id, 5);
      const bonus = (running() as GiftGame).playerView(id)!.bonus!;
      const item = bonus.items.find((i) => (GIFT_GOODS as readonly string[]).includes(i.kind))!;
      clock.advance(GIFT_READY_MS + item.from);
      noel.sendMsg({ type: "gift.tap", round: bonus.round, item: item.id });
    });
    expect(places).toEqual({
      Noel: { podium: 1, phone: 1, sheet: 1 },
      Holly: { podium: 2, phone: 2, sheet: 2 },
      Ivy: { podium: 2, phone: 2, sheet: 2 },
    });
  });
});
