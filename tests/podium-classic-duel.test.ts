import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ClassicGame } from "../src/server/game/classic.ts";
import type { DuelGame } from "../src/server/game/duel.ts";
import { Lobby } from "../src/server/game/lobby.ts";
import { entryOf } from "../src/server/game/modes.ts";
import { INTRO_MS } from "../src/server/game/paced-round.ts";
import { records } from "../src/server/game/results.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
import type { GameMode } from "../src/shared/mode-entries.ts";
import { duelShared } from "../src/shared/modes/duel.ts";
import type { ClientMsg } from "../src/shared/protocol.ts";
import { FakeClock, tempDir } from "./helpers.ts";
import { fakeHub, HubSocket } from "./hub-harness.ts";

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
    title: "Podium",
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

function running() {
  const game = hub.game;
  if (!game || game instanceof Lobby) throw new Error("expected a running game");
  return game;
}

type QuestionShown = { seq: number; index: number; text: string; options: string[] };

function question(id: string) {
  const view = running().playerView(id) as { question?: QuestionShown | null } | null;
  const q = view?.question;
  if (!q) throw new Error("expected an open question");
  return { ...q, right: q.options.indexOf(q.text === "One" ? "True" : "False") };
}

async function finish(mode: GameMode, play: (phones: Map<string, HubSocket>, ids: Map<string, string>) => void) {
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
  host.sendMsg({ type: "host.start", pacing: "manual" } as ClientMsg);
  play(phones, ids);
  host.sendMsg({ type: "host.end" });
  await new Promise((r) => setTimeout(r, 0));
  return ids;
}

describe("Podium", () => {
  test("in Classic, the podium screen, the phone and the results sheet agree on each place, and stay unchanged after the game finishes", async () => {
    let game!: ClassicGame;
    const ids = await finish("classic", (phones) => {
      game = running() as ClassicGame;
      clock.advance(INTRO_MS + 1000);
      phones.get("Noel")!.sendMsg({ type: "answer", qIndex: 0, option: 0 });
    });
    // why: changes after the finish must not reach the Podium.
    game.players.get(ids.get("Ivy")!)!.score = 99_999;
    const view = hub.hostView();
    expect(view.kind === "classic" && view.leaderboard.map((e) => [e.nickname, e.rank])).toEqual([
      ["Noel", 1],
      ["Holly", 2],
      ["Ivy", 2],
    ]);
    const phone = (n: string) => {
      const v = game.playerView(ids.get(n)!);
      return v.kind === "classic" ? { rank: v.me.rank, podium: v.podium?.map((e) => [e.nickname, e.rank]) } : null;
    };
    for (const [n, rank] of [
      ["Noel", 1],
      ["Holly", 2],
      ["Ivy", 2],
    ] as const) {
      expect(phone(n)).toEqual({
        rank,
        podium: [
          ["Noel", 1],
          ["Holly", 2],
          ["Ivy", 2],
        ],
      });
    }
    const sheet = records(entryOf(game).results(game));
    expect(sheet.map((r) => [r.Nickname, r.Rank, r.Score === 0 ? 0 : "scored"])).toEqual([
      ["Noel", 1, "scored"],
      ["Holly", 2, 0],
      ["Ivy", 2, 0],
    ]);
  });

  test("in Showdown, the podium screen, the phone and the results sheet agree on each place and award; equal points and correct answers share a place, higher on the ladder first", async () => {
    let game!: DuelGame;
    const ids = await finish("duel", (phones, ids) => {
      game = running() as DuelGame;
      clock.advance(INTRO_MS);
      // why: one three-way arena; Noel is right first and wins, Holly and Ivy answer wrong.
      const q = question(ids.get("Noel")!);
      phones.get("Noel")!.sendMsg({ type: "duel.answer", index: q.index, option: q.right });
      for (const n of ["Holly", "Ivy"]) phones.get(n)!.sendMsg({ type: "duel.answer", index: q.index, option: 1 - q.right });
      clock.advance(1000);
    });
    const ladder = game.ladder.map((id) => game.players.get(id)!.nickname).filter((n) => n !== "Noel");
    // why: changes after the finish must not reach the Podium.
    const ivy = game.players.get(ids.get("Ivy")!)!;
    ivy.points = 50;
    ivy.wins = 9;
    const view = hub.hostView();
    if (view.kind !== "duel") throw new Error("expected Showdown");
    expect(view.players.map((p) => [p.nickname, p.rank])).toEqual([
      ["Noel", 1],
      [ladder[0], 2],
      [ladder[1], 2],
    ]);
    expect(view.awards?.mostWins).toEqual({ value: 1, nicknames: ["Noel"] });
    expect(view.awards?.mostArenaOneWins).toEqual({ value: 1, nicknames: ["Noel"] });
    const result = (n: string) => {
      const v = game.playerView(ids.get(n)!);
      return v?.result;
    };
    expect(result("Noel")).toEqual({ rank: 1, playerCount: 3, awards: [duelShared.awards.mostArenaOneWins, duelShared.awards.mostWins] });
    expect(result("Ivy")).toMatchObject({ rank: 2, playerCount: 3 });
    expect(result("Holly")).toMatchObject({ rank: 2, playerCount: 3 });
    const sheet = records(entryOf(game).results(game));
    expect(sheet.map((r) => [r.Nickname, r.Rank, r.Wins])).toEqual([
      ["Noel", 1, 1],
      [ladder[0], 2, 0],
      [ladder[1], 2, 0],
    ]);
  });
});
