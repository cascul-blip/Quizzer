import { afterEach, beforeEach, expect, test } from "bun:test";
import { Lobby } from "../src/server/game/lobby.ts";
import { entryOf } from "../src/server/game/modes.ts";
import { records } from "../src/server/game/results.ts";
import type { SiegeGame } from "../src/server/game/siege.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
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
  const quiz = await store.create({ title: "Siege", questions: [{ type: "true_false", text: "One", correct: [0] }] });
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

test("in Kingdom Siege, the podium screen, the phone and the results sheet read one Podium, unchanged after the game finishes", async () => {
  host.sendMsg({ type: "host.open", quizId });
  host.sendMsg({ type: "host.setMode", mode: "siege" });
  host.sendMsg({ type: "host.setModeSettings", mode: "siege", settings: { waves: 5, theme: "classic" } } as ClientMsg);
  for (const nickname of NICKNAMES) new HubSocket(hub).sendMsg({ type: "join", nickname });
  host.sendMsg({ type: "host.start", pacing: "manual" });
  const game = hub.game as SiegeGame;
  if (!game || game instanceof Lobby) throw new Error("expected a running game");
  const p = (n: string) => game.everyone.find((x) => x.nickname === n)!;
  p("Noel").archerKills = 4;
  p("Holly").archerKills = 4;
  p("Holly").archerUpgrades = 2;
  p("Ivy").placed.wall = 3;
  p("Ivy").goldEarned = 50;
  p("Noel").goldEarned = 20;
  host.sendMsg({ type: "host.end" });
  await new Promise((r) => setTimeout(r, 0));
  p("Ivy").archerKills = 9;
  p("Holly").goldEarned = 99;
  const view = hub.hostView();
  expect(view.kind === "siege" && view.awards).toEqual({
    topArcher: { value: 4, nicknames: ["Noel", "Holly"] },
    masterMason: { value: 3, nicknames: ["Ivy"] },
    mostCorrect: null,
  });
  const awardsOf = (n: string) => game.playerView(p(n).id)?.result?.awards;
  expect(awardsOf("Noel")).toEqual(["Top Archer Captain"]);
  expect(awardsOf("Holly")).toEqual(["Top Archer Captain"]);
  expect(awardsOf("Ivy")).toEqual(["Master Mason"]);
  const sheet = records(entryOf(game).results(game));
  expect(sheet.slice(0, 3).map((r) => [r.Nickname, r["Gold earned"]])).toEqual([
    ["Ivy", 50],
    ["Noel", 20],
    ["Holly", 0],
  ]);
});
