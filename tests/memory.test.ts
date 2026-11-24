import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
import type { Pacing } from "../src/shared/mode-views.ts";
import type { MemoryBoardSize, MemoryCardView } from "../src/shared/modes/memory.ts";
import type { ShuffleOptions } from "../src/shared/protocol.ts";
import { FakeClock, tempDir } from "./helpers.ts";
import { fakeHub, HubSocket } from "./hub-harness.ts";

let data: ReturnType<typeof tempDir>;
let store: QuizStore;
let hub: GameHub;
let clock: FakeClock;
let random: () => number;

beforeEach(() => {
  data = tempDir();
  store = new QuizStore(data.dir);
  clock = new FakeClock();
  random = () => 0.999_999;
  hub = fakeHub(store, clock, 4321, () => random());
});

afterEach(() => {
  hub.closeGame();
  data.cleanup();
});

function projector() {
  const view = hub.hostView();
  if (view.kind !== "memory") throw new Error(`Expected Memory Game, got ${view.kind}`);
  return view;
}

async function launch(
  nicknames: string[],
  {
    count = 1,
    pacing = "manual",
    shuffle = { questions: false, answers: false },
    multipleChoice = false,
    boardSize,
  }: { count?: number; pacing?: Pacing; shuffle?: ShuffleOptions; multipleChoice?: boolean; boardSize?: MemoryBoardSize } = {},
) {
  const quiz = await store.create({
    title: "Memory",
    questions: Array.from({ length: count }, (_, i) =>
      multipleChoice
        ? { type: "multiple_choice", text: `Question ${i + 1}`, options: ["A", "B", "C"], correct: [0] }
        : { type: "true_false", text: `Question ${i + 1}`, correct: [0] },
    ),
  });
  const host = new HubSocket(hub, { admin: true });
  host.sendMsg({ type: "host.hello" });
  host.sendMsg({ type: "host.open", quizId: quiz.id });
  host.sendMsg({ type: "host.setMode", mode: "memory" });
  if (boardSize) host.sendMsg({ type: "host.setModeSettings", mode: "memory", settings: { boardSize } });
  host.sendMsg({ type: "host.setShuffle", ...shuffle });
  const phones = nicknames.map((nickname) => {
    const phone = new HubSocket(hub);
    phone.sendMsg({ type: "join", nickname });
    return phone;
  });
  host.sendMsg({ type: "host.start", pacing });
  return { host, phones };
}

function player(phone: HubSocket) {
  const view = hub.playerView(phone);
  if (view.kind !== "memory") throw new Error(`Expected Memory Game, got ${view.kind}`);
  return view;
}

function openQuestion(host: HubSocket) {
  expect(projector().phase).toBe("intro");
  host.sendMsg({ type: "host.skip" });
  expect(projector().phase).toBe("open");
  return projector().question!.index;
}

function submit(phone: HubSocket, index: number, option = 0) {
  phone.sendMsg({ type: "memory.answer", index, option });
}

function playQuestion(host: HubSocket, correct: HubSocket[] = []) {
  const index = openQuestion(host);
  correct.forEach((phone) => submit(phone, index));
  if (projector().phase === "open") host.sendMsg({ type: "host.skip" });
  expect(projector().phase).toBe("reveal");
  host.sendMsg({ type: "host.next" });
}

function confirm(phone: HubSocket, positions: [number, number], turnId = projector().turn!.id) {
  phone.sendMsg({ type: "memory.confirm", turnId, positions });
}

function facesUp() {
  return projector().board.flatMap((card, position) => (card.state === "up" ? [[position, card.face]] : []));
}

describe("Memory Game", () => {
  test("starts individual play from the lobby with a hidden 10×10 board and the current players", async () => {
    const {
      host,
      phones: [phone],
    } = await launch(["Noel"]);
    expect(host.raw.filter((m) => m.type === "error")).toEqual([]);
    const joined = phone!.raw.find((m) => m.type === "joined");
    expect(joined?.type).toBe("joined");
    const phoneView = await phone!.playerState((v) => v.kind === "memory");
    expect(phoneView.view).toMatchObject({ kind: "memory", phase: "intro", me: { id: joined?.playerId, nickname: "Noel" } });
    const view = projector();
    expect(view).toMatchObject({ phase: "intro", pacing: "manual", boardSize: 10, players: [{ nickname: "Noel" }] });
    expect(view.board).toEqual(Array.from({ length: 100 }, () => ({ state: "down" })));
  });

  test("a short quiz repeats at new indexes, rejects duplicate and stale answers, and awards only correct submissions", async () => {
    const {
      host,
      phones: [noel, holly],
    } = await launch(["Noel", "Holly"]);

    expect(openQuestion(host)).toBe(0);
    submit(noel!, 0);
    submit(noel!, 0);
    expect(projector()).toMatchObject({ phase: "open", answeredCount: 1 });
    expect(player(noel!).me.chips).toBe(1);
    submit(holly!, 0, 1);
    expect(projector()).toMatchObject({ phase: "reveal", answeredCount: 2, revealTurnsNext: false });
    host.sendMsg({ type: "host.next" });

    expect(openQuestion(host)).toBe(1);
    expect(projector().question?.text).toBe("Question 1");
    submit(noel!, 0);
    expect(projector().answeredCount).toBe(0);
    submit(noel!, 1);
    host.sendMsg({ type: "host.next" });
    expect(projector().phase).toBe("reveal");
    host.sendMsg({ type: "host.next" });

    expect(openQuestion(host)).toBe(2);
    submit(holly!, 1);
    expect(projector().answeredCount).toBe(0);
    host.sendMsg({ type: "host.skip" });
    expect(projector()).toMatchObject({ phase: "reveal", answeredCount: 0, revealTurnsNext: true });
    host.sendMsg({ type: "host.next" });

    expect(projector()).toMatchObject({ phase: "turn", turn: { nickname: "Noel" } });
    expect(player(noel!).me.chips).toBe(2);
    expect(player(holly!)).toMatchObject({ me: { chips: 0 }, turn: null });
  });

  test("fills a three-question phase across an eight-question quiz pass boundary", async () => {
    const {
      host,
      phones: [noel],
    } = await launch(["Noel"], { count: 8 });
    for (const [index, question] of ["1", "2", "3", "4", "5", "6", "7", "8", "1"].entries()) {
      expect(projector().question).toMatchObject({ index, text: `Question ${question}` });
      playQuestion(host, index === 8 ? [noel!] : []);
    }
    expect(projector()).toMatchObject({ phase: "turn", turn: { nickname: "Noel" }, phaseRemainingMs: 15_000 });
  });

  test("applies the lobby's question shuffle again on each quiz pass", async () => {
    let draws = 0;
    random = () => {
      const draw = draws++;
      return draw >= 99 && draw <= 105 ? 0 : 0.999_999;
    };
    const { host } = await launch(["Noel"], { count: 8, shuffle: { questions: true, answers: false } });
    for (const [index, question] of ["2", "3", "4", "5", "6", "7", "8", "1", "1", "2", "3"].entries()) {
      expect(projector().question).toMatchObject({ index, text: `Question ${question}` });
      playQuestion(host);
    }
  });

  test("shuffles the options and remaps the answer key on a repeated pass", async () => {
    const {
      host,
      phones: [noel],
    } = await launch(["Noel"], {
      multipleChoice: true,
      shuffle: { questions: false, answers: true },
    });
    expect(openQuestion(host)).toBe(0);
    expect(projector().question?.options).toEqual(["A", "B", "C"]);
    submit(noel!, 0, 0);
    expect(player(noel!).me.chips).toBe(1);

    random = () => 0;
    host.sendMsg({ type: "host.next" });
    expect(openQuestion(host)).toBe(1);
    expect(projector().question?.options).toEqual(["B", "C", "A"]);
    submit(noel!, 1, 2);
    expect(player(noel!).me.chips).toBe(2);
  });

  test("auto-advance skips a reveal phase with no chips and starts turns after the next three questions", async () => {
    const {
      host,
      phones: [noel],
    } = await launch(["Noel"], { pacing: "auto" });
    for (let index = 0; index < 6; index++) {
      expect(openQuestion(host)).toBe(index);
      submit(noel!, index, index === 3 ? 0 : 1);
      expect(projector()).toMatchObject({ phase: "reveal", revealTurnsNext: index === 5 });
      clock.advance(4_999);
      expect(projector().phase).toBe("reveal");
      clock.advance(1);
      expect(projector().phase).toBe(index === 5 ? "turn" : "intro");
    }
    expect(player(noel!)).toMatchObject({ me: { chips: 1 }, phaseRemainingMs: 15_000 });
  });

  test("starts reveal turns by average correct answer time even when the faster player spent more time answering", async () => {
    const {
      host,
      phones: [noel, holly, ivy],
    } = await launch(["Noel", "Holly", "Ivy"]);

    const first = openQuestion(host);
    submit(noel!, first, 1);
    clock.advance(100);
    submit(holly!, first);
    clock.advance(110);
    submit(ivy!, first);
    host.sendMsg({ type: "host.next" });

    const second = openQuestion(host);
    clock.advance(210);
    submit(ivy!, second);
    clock.advance(40);
    submit(noel!, second);
    clock.advance(10);
    submit(holly!, second);
    host.sendMsg({ type: "host.next" });

    const third = openQuestion(host);
    clock.advance(210);
    submit(ivy!, third);
    clock.advance(790);
    submit(holly!, third, 1);
    host.sendMsg({ type: "host.skip" });
    host.sendMsg({ type: "host.next" });

    expect(player(holly!).me.chips).toBe(2);
    expect(player(noel!).me.chips).toBe(1);
    expect(player(ivy!).me.chips).toBe(3);
    for (const nickname of ["Holly", "Ivy", "Noel", "Holly", "Ivy", "Ivy"]) {
      expect(projector().phase).toBe("turn");
      expect(projector().turn?.nickname).toBe(nickname);
      clock.advance(15_000);
    }
    expect(projector().phase).toBe("intro");
  });

  test("breaks equal averages by prior first turns, then lobby join order", async () => {
    const {
      host,
      phones: [noel, holly],
    } = await launch(["Noel", "Holly"]);
    const firstTurns: (string | undefined)[] = [];

    for (const [hollyMs, noelMs] of [
      [100, 100],
      [200, 200],
      [100, 300],
      [100, 100],
      [100, 100],
    ] as const) {
      const index = openQuestion(host);
      clock.advance(hollyMs);
      submit(holly!, index);
      clock.advance(noelMs - hollyMs);
      submit(noel!, index);
      host.sendMsg({ type: "host.next" });
      playQuestion(host);
      playQuestion(host);

      firstTurns.push(projector().turn?.nickname);
      clock.advance(30_000);
      expect(projector().phase).toBe("intro");
    }

    expect(firstTurns).toEqual(["Noel", "Holly", "Holly", "Noel", "Noel"]);
  });

  test("spends one chip for each pair, shows feedback at each deadline and gives everyone with chips one turn per pass", async () => {
    const {
      host,
      phones: [noel, holly, ivy],
    } = await launch(["Noel", "Holly", "Ivy"]);
    const initialBoard = projector().board;
    playQuestion(host, [noel!, holly!]);
    playQuestion(host, [noel!]);
    playQuestion(host);
    expect(projector()).toMatchObject({ phase: "turn", turn: { nickname: "Noel" } });
    expect(projector().board).toEqual(initialBoard);

    confirm(holly!, [0, 1]);
    confirm(noel!, [0, 0]);
    confirm(noel!, [-1, 1]);
    confirm(noel!, [0, 100]);
    expect(player(noel!).me.chips).toBe(2);
    expect(projector().board).toEqual(initialBoard);

    const firstTurnId = projector().turn!.id;
    confirm(noel!, [0, 2]);
    expect(projector()).toMatchObject({ phase: "feedback", feedback: { matched: false } });
    expect(facesUp()).toEqual([
      [0, 0],
      [2, 1],
    ]);
    expect(player(noel!).me).toMatchObject({ pairs: 0, chips: 1 });
    confirm(noel!, [0, 1], firstTurnId);
    expect(player(noel!).me.chips).toBe(1);
    clock.advance(1_999);
    expect(facesUp()).toEqual([
      [0, 0],
      [2, 1],
    ]);
    clock.advance(1);
    expect(projector()).toMatchObject({ phase: "turn", turn: { nickname: "Holly" }, phaseRemainingMs: 15_000 });
    expect(projector().board).toEqual(initialBoard);

    confirm(holly!, [0, 1]);
    expect(projector()).toMatchObject({ phase: "feedback", feedback: { matched: true } });
    expect(player(holly!).me).toMatchObject({ pairs: 1, chips: 0 });
    expect(facesUp()).toEqual([
      [0, 0],
      [1, 0],
    ]);
    clock.advance(999);
    expect(facesUp()).toHaveLength(2);
    clock.advance(1);
    expect(projector()).toMatchObject({ phase: "turn", turn: { nickname: "Noel" }, phaseRemainingMs: 15_000 });
    expect(projector().board).toEqual([{ state: "empty" }, { state: "empty" }, ...initialBoard.slice(2)]);
    expect(player(noel!).turn?.available.slice(0, 4)).toEqual([false, false, true, true]);
    expect(player(ivy!).turn).toBeNull();

    confirm(noel!, [2, 3], firstTurnId);
    confirm(noel!, [0, 3]);
    expect(player(noel!).me.chips).toBe(1);
    expect(facesUp()).toEqual([]);
    confirm(noel!, [2, 3]);
    clock.advance(1_000);
    expect(projector()).toMatchObject({ phase: "intro", question: { index: 3 } });
    expect(projector().board).toEqual([...Array.from<unknown, MemoryCardView>({ length: 4 }, () => ({ state: "empty" })), ...initialBoard.slice(4)]);
  });

  test("keeps the original turn through reconnect and spends one chip per expiry without revealing cards", async () => {
    const {
      host,
      phones: [noel],
    } = await launch(["Noel"]);
    for (let i = 0; i < 3; i++) playQuestion(host, [noel!]);
    const firstTurnId = projector().turn!.id;
    const initialBoard = projector().board;
    clock.advance(14_999);
    expect(projector()).toMatchObject({ turn: { id: firstTurnId }, phaseRemainingMs: 1 });
    expect(player(noel!).me.chips).toBe(3);
    clock.advance(1);
    const secondTurnId = projector().turn!.id;
    expect(secondTurnId).not.toBe(firstTurnId);
    expect(player(noel!).me.chips).toBe(2);
    confirm(noel!, [0, 1], firstTurnId);
    expect(projector().board).toEqual(initialBoard);

    const token = noel!.token;
    noel!.close();
    clock.advance(6_000);
    const reconnected = new HubSocket(hub);
    reconnected.sendMsg({ type: "resume", token: token! });
    expect(player(reconnected)).toMatchObject({ turn: { id: secondTurnId }, phaseRemainingMs: 9_000 });
    confirm(reconnected, [0, 1], secondTurnId);
    expect(projector().phase).toBe("feedback");
    expect(player(reconnected).me).toMatchObject({ pairs: 1, chips: 1 });
    clock.advance(1_000);
    const afterMatch = projector().board;
    reconnected.close();
    clock.advance(15_000);
    expect(projector()).toMatchObject({ phase: "intro", players: [{ nickname: "Noel", chips: 0, pairs: 1 }] });
    expect(projector().board).toEqual(afterMatch);
  });

  test("reveals faces only to the projector, keeping them out of phone snapshots and patches", async () => {
    const {
      host,
      phones: [noel, spectator],
    } = await launch(["Noel", "Holly"]);
    playQuestion(host, [noel!]);
    playQuestion(host);
    playQuestion(host);

    const active = await noel!.playerState((view) => view.kind === "memory" && view.phase === "turn");
    const watching = await spectator!.playerState((view) => view.kind === "memory" && view.phase === "turn");
    expect(active.view).toMatchObject({ turn: { available: Array.from({ length: 100 }, () => true) } });
    expect(watching.view).toMatchObject({ turn: null });
    expect(facesUp()).toEqual([]);

    confirm(noel!, [0, 2]);
    expect(facesUp()).toEqual([
      [0, 0],
      [2, 1],
    ]);
    for (const phone of [noel!, spectator!]) {
      const feedback = await phone.playerState((view) => view.kind === "memory" && view.phase === "feedback");
      expect(feedback.view).toMatchObject({ turn: null });
      const frames = phone.raw.filter(({ type }) => type === "player.state" || type === "player.patch");
      expect(frames.some(({ type }) => type === "player.patch")).toBe(true);
      expect(JSON.stringify(frames)).not.toMatch(/"(?:face|board)"/);
    }
  });

  test("refuses confirmation at the turn deadline even before expiry runs and accepts it one millisecond before", async () => {
    const {
      host,
      phones: [noel],
    } = await launch(["Noel"]);
    playQuestion(host, [noel!]);
    playQuestion(host, [noel!]);
    playQuestion(host);

    clock.advance(14_999);
    clock.t += 1;
    confirm(noel!, [0, 1]);
    expect(projector()).toMatchObject({ phase: "turn", players: [{ chips: 2, pairs: 0 }] });
    expect(facesUp()).toEqual([]);

    clock.advance(0);
    expect(projector()).toMatchObject({ phase: "turn", players: [{ chips: 1, pairs: 0 }], phaseRemainingMs: 15_000 });
    expect(facesUp()).toEqual([]);
    clock.advance(14_999);
    confirm(noel!, [0, 1]);
    expect(projector()).toMatchObject({ phase: "feedback", players: [{ chips: 0, pairs: 1 }] });
    expect(facesUp()).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  test.each([
    [6, 18, 0],
    [8, 32, 1],
    [10, 50, 1],
  ] as const)("clears all %i-wide board pairs at fixed positions and finishes after the last match", async (boardSize, pairCount, chipsLeft) => {
    random = () => 0;
    const {
      host,
      phones: [noel],
    } = await launch(["Noel"], { boardSize });
    const expectedBoard: MemoryCardView[] = Array.from({ length: pairCount * 2 }, () => ({ state: "down" }));
    const revealedFaces = new Set<number>();
    for (let pair = 0; pair < pairCount; pair++) {
      if (pair % 3 === 0) for (let i = 0; i < 3; i++) playQuestion(host, [noel!]);
      expect(projector().board).toEqual(expectedBoard);
      expect(player(noel!)).toMatchObject({ boardSize, turn: { available: expectedBoard.map((card) => card.state === "down") } });
      // The deterministic shuffle shifts the original first card to the end of the board.
      const positions: [number, number] = pair === 0 ? [0, expectedBoard.length - 1] : [pair * 2 - 1, pair * 2];
      confirm(noel!, positions);
      const exposed = facesUp();
      const face = exposed[0]?.[1];
      expect(face).toBeDefined();
      expect(exposed).toEqual(positions.map((position) => [position, face]));
      revealedFaces.add(face!);
      expect(projector().players[0]?.pairs).toBe(pair + 1);
      clock.advance(999);
      expect(projector().phase).toBe("feedback");
      clock.advance(1);
      for (const position of positions) expectedBoard[position] = { state: "empty" };
    }
    // Smaller boards draw from the full pool: for this RNG, the draw moves the original first face out of the chosen subset.
    expect([...revealedFaces].sort((a, b) => a - b)).toEqual(Array.from({ length: pairCount }, (_, index) => index + (boardSize === 10 ? 0 : 1)));
    expect(projector()).toMatchObject({ phase: "podium", board: expectedBoard, players: [{ rank: 1, pairs: pairCount, chips: chipsLeft }] });
    expect(player(noel!).result).toEqual({ rank: 1, playerCount: 1 });
    clock.advance(60_000);
    expect(projector().phase).toBe("podium");
  });

  test.each(["questions", "turn", "match feedback"])("host End during %s reaches and stays at the podium", async (when) => {
    const {
      host,
      phones: [noel, holly],
    } = await launch(["Noel", "Holly", "Ivy"], { pacing: "auto" });
    const index = openQuestion(host);
    clock.advance(120);
    submit(noel!, index);
    clock.advance(80);
    submit(holly!, index, 1);
    if (when !== "questions") {
      host.sendMsg({ type: "host.skip" });
      host.sendMsg({ type: "host.next" });
      const next = openQuestion(host);
      clock.advance(61);
      submit(noel!, next);
      host.sendMsg({ type: "host.skip" });
      host.sendMsg({ type: "host.next" });
      playQuestion(host);
      expect(projector().phase).toBe("turn");
      if (when === "match feedback") {
        confirm(noel!, [0, 1]);
        expect(projector().phase).toBe("feedback");
      }
    }

    host.sendMsg({ type: "host.end" });
    const matched = when === "match feedback" ? 1 : 0;
    const sharedPlace = matched ? 2 : 1;
    expect(projector()).toMatchObject({
      phase: "podium",
      players: [
        { nickname: "Noel", pairs: matched, rank: 1 },
        { nickname: "Holly", pairs: 0, rank: sharedPlace },
        { nickname: "Ivy", pairs: 0, rank: sharedPlace },
      ],
    });
    expect(player(holly!).result).toEqual({ rank: sharedPlace, playerCount: 3 });
    expect(hub.lastResults?.csv.split("\r\n").slice(0, 4)).toEqual([
      "\ufeffRank,Nickname,Matched pairs,Correct answers,Total time (s)",
      `1,Noel,${matched},${when === "questions" ? "1,0.120" : "2,0.181"}`,
      `${sharedPlace},Holly,0,0,0.200`,
      `${sharedPlace},Ivy,0,0,0.000`,
    ]);
    const result = hub.lastResults;
    clock.advance(60_000);
    expect(projector().phase).toBe("podium");
    expect(hub.lastResults).toBe(result);
  });
});
