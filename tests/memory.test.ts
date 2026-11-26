import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Lobby } from "../src/server/game/lobby.ts";
import { MemoryGame } from "../src/server/game/memory.ts";
import { memoryMode } from "../src/server/game/memory-entry.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
import type { Pacing } from "../src/shared/mode-views.ts";
import type { MemoryBoardSize, MemoryCardView } from "../src/shared/modes/memory.ts";
import type { ShuffleOptions } from "../src/shared/protocol.ts";
import { FakeClock, sampleQuiz, tempDir } from "./helpers.ts";
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

function confirm(phone: HubSocket, step: 1 | 2, position: number, turnId = projector().turn!.id) {
  phone.sendMsg({ type: "memory.confirm", turnId, step, position });
}

function confirmPair(phone: HubSocket, [first, second]: [number, number]) {
  confirm(phone, 1, first);
  confirm(phone, 2, second);
}

function facesUp() {
  return projector().board.flatMap((card, position) => (card.state === "up" ? [[position, card.face]] : []));
}

describe("Memory Game", () => {
  test("End during an open question settles and reveals it before the podium", () => {
    const clock = new FakeClock();
    const lobby = new Lobby(sampleQuiz());
    const noel = lobby.join("Noel");
    const holly = lobby.join("Holly");
    lobby.join("Ivy");
    const seen: { phase: string; reveal: unknown }[] = [];
    let finished = 0;
    const game = new MemoryGame(lobby.handoffFacts("memory"), {
      clock,
      rng: () => 0.5,
      onChange: () => seen.push({ phase: game.phase, reveal: game.playerView(holly.id)?.reveal ?? null }),
      onFinish: () => finished++,
    });
    game.start("manual");
    game.skip();
    expect(game.phase).toBe("open");
    clock.advance(120);
    expect(game.answer(noel.id, 0, 0)).toBe(true);
    expect(game.answer(holly.id, 0, 1)).toBe(true);
    seen.length = 0;

    game.end();

    expect(seen.map((s) => s.phase)).toEqual(["reveal", "podium"]);
    expect(seen[0]!.reveal).toMatchObject({ choice: 1, wasCorrect: true });
    expect(finished).toBe(1);
    expect(game.hostView().phase).toBe("podium");
  });

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
    expect(projector()).toMatchObject({ phase: "turn", turn: { nickname: "Noel" }, phaseRemainingMs: 20_000 });
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
    expect(player(noel!)).toMatchObject({ me: { chips: 1 }, phaseRemainingMs: 20_000 });
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
      clock.advance(20_000);
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
      clock.advance(40_000);
      expect(projector().phase).toBe("intro");
    }

    expect(firstTurns).toEqual(["Noel", "Holly", "Holly", "Noel", "Noel"]);
  });

  test("breaks equal averages and equal prior first turns by lobby join order", async () => {
    const {
      host,
      phones: [holly, noel],
    } = await launch(["Holly", "Noel"]);

    const index = openQuestion(host);
    clock.advance(100);
    submit(noel!, index);
    submit(holly!, index);
    host.sendMsg({ type: "host.next" });
    playQuestion(host);
    playQuestion(host);

    expect(projector().turn?.nickname).toBe("Holly");
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

    confirm(holly!, 1, 0);
    confirm(noel!, 2, 1);
    confirm(noel!, 1, -1);
    confirm(noel!, 1, 100);
    confirm(noel!, 1, 1.5);
    expect(player(noel!).me.chips).toBe(2);
    expect(projector().board).toEqual(initialBoard);

    const firstTurnId = projector().turn!.id;
    confirm(noel!, 1, 0);
    confirm(noel!, 1, 1);
    confirm(noel!, 2, 0);
    confirm(holly!, 2, 1);
    expect(projector()).toMatchObject({ phase: "turn", feedback: null });
    expect(player(noel!).me).toMatchObject({ pairs: 0, chips: 2 });
    expect(facesUp()).toEqual([[0, 0]]);
    confirm(noel!, 2, 2);
    expect(projector()).toMatchObject({ phase: "feedback", feedback: { matched: false } });
    expect(facesUp()).toEqual([
      [0, 0],
      [2, 1],
    ]);
    expect(player(noel!).me).toMatchObject({ pairs: 0, chips: 1 });
    await Promise.resolve();
    expect(noel!.view).toMatchObject({
      phase: "feedback",
      turn: { id: firstTurnId, stage: "feedback", board: projector().board },
      phaseRemainingMs: 2_000,
    });
    const mismatchBoard = projector().board;
    confirm(noel!, 2, 1, firstTurnId);
    expect(player(noel!).me.chips).toBe(1);
    clock.advance(1_999);
    expect(facesUp()).toEqual([
      [0, 0],
      [2, 1],
    ]);
    expect(noel!.view).toMatchObject({ turn: { board: mismatchBoard } });
    clock.advance(1);
    await Promise.resolve();
    expect(noel!.view).toMatchObject({ turn: null });
    expect(projector()).toMatchObject({ phase: "turn", turn: { nickname: "Holly" }, phaseRemainingMs: 20_000 });
    expect(projector().board).toEqual(initialBoard);

    confirmPair(holly!, [0, 1]);
    expect(projector()).toMatchObject({ phase: "feedback", feedback: { matched: true } });
    expect(player(holly!).me).toMatchObject({ pairs: 1, chips: 0 });
    expect(facesUp()).toEqual([
      [0, 0],
      [1, 0],
    ]);
    await Promise.resolve();
    const matchBoard = projector().board;
    expect(holly!.view).toMatchObject({ phase: "feedback", turn: { stage: "feedback", matched: true, board: matchBoard }, phaseRemainingMs: 1_400 });
    clock.advance(1_399);
    expect(facesUp()).toHaveLength(2);
    expect(holly!.view).toMatchObject({ turn: { board: matchBoard } });
    clock.advance(1);
    await Promise.resolve();
    expect(holly!.view).toMatchObject({ turn: null });
    expect(projector()).toMatchObject({ phase: "turn", turn: { nickname: "Noel" }, phaseRemainingMs: 20_000 });
    expect(projector().board).toEqual([{ state: "empty" }, { state: "empty" }, ...initialBoard.slice(2)]);
    expect(player(noel!).turn?.board.slice(0, 4)).toEqual([{ state: "empty" }, { state: "empty" }, { state: "down" }, { state: "down" }]);
    expect(player(ivy!).turn).toBeNull();

    confirm(noel!, 1, 2, firstTurnId);
    confirm(noel!, 1, 0);
    expect(player(noel!).me.chips).toBe(1);
    expect(facesUp()).toEqual([]);
    confirmPair(noel!, [2, 3]);
    clock.advance(1_399);
    expect(projector()).toMatchObject({ phase: "feedback" });
    clock.advance(1);
    expect(projector()).toMatchObject({ phase: "intro", question: { index: 3 } });
    expect(projector().board).toEqual([...Array.from<unknown, MemoryCardView>({ length: 4 }, () => ({ state: "empty" })), ...initialBoard.slice(4)]);
  });

  test.each([
    ["zero confirmations from a connected player", 0, true],
    ["zero confirmations from a disconnected player", 0, false],
    ["one confirmation from a connected player", 1, true],
    ["one confirmation from a disconnected player", 1, false],
  ] as const)("expires after %s", async (_, confirmations, connected) => {
    const {
      host,
      phones: [noel, holly],
    } = await launch(["Noel", "Holly"]);
    playQuestion(host, [noel!, holly!]);
    playQuestion(host);
    playQuestion(host);
    const initialBoard = projector().board;

    if (confirmations) confirm(noel!, 1, 0);
    if (!connected) noel!.close();
    clock.advance(19_999);
    expect(projector()).toMatchObject({
      phase: "turn",
      turn: { nickname: "Noel" },
      phaseRemainingMs: 1,
      board: confirmations ? [{ state: "up", face: 0 }, ...initialBoard.slice(1)] : initialBoard,
      players: [
        { nickname: "Noel", chips: 1, pairs: 0 },
        { nickname: "Holly", chips: 1, pairs: 0 },
      ],
    });
    clock.advance(1);
    expect(projector()).toMatchObject({
      phase: "turn",
      turn: { nickname: "Holly" },
      phaseRemainingMs: 20_000,
      board: initialBoard,
      feedback: null,
      players: [
        { nickname: "Noel", chips: 0, pairs: 0 },
        { nickname: "Holly", chips: 1, pairs: 0 },
      ],
    });
    expect(player(holly!).turn?.board).toEqual(initialBoard);
  });

  test("restores the first confirmed card and original deadline on reconnect and accepts the second card", async () => {
    const {
      host,
      phones: [noel],
    } = await launch(["Noel"]);
    playQuestion(host, [noel!]);
    playQuestion(host);
    playQuestion(host);
    const turnId = projector().turn!.id;
    clock.advance(2_000);
    confirm(noel!, 1, 0);
    const token = noel!.token;
    noel!.close();
    clock.advance(6_000);

    const reconnected = new HubSocket(hub);
    reconnected.sendMsg({ type: "resume", token: token! });
    expect(reconnected.view).toMatchObject({
      turn: { id: turnId, stage: "picking", step: 2, board: projector().board },
      phaseRemainingMs: 12_000,
    });
    expect(facesUp()).toEqual([[0, 0]]);
    confirm(reconnected, 2, 1, turnId);
    expect(projector()).toMatchObject({ phase: "feedback", players: [{ chips: 0, pairs: 1 }] });
  });

  test.each([
    ["match", 1, 0, 1_400],
    ["mismatch", 2, 1, 2_000],
  ] as const)("restores both confirmed faces on reconnect for the remainder of the %s delay", async (_outcome, position, face, delay) => {
    const {
      host,
      phones: [noel, spectator],
    } = await launch(["Noel", "Holly"], { boardSize: 6 });
    playQuestion(host, [noel!]);
    playQuestion(host, [noel!]);
    playQuestion(host);

    const expectedBoard = Array.from<unknown, MemoryCardView>({ length: 36 }, () => ({ state: "down" }));
    const turnId = projector().turn!.id;
    confirmPair(noel!, [0, position]);
    expectedBoard[0] = { state: "up", face: 0 };
    expectedBoard[position] = { state: "up", face };
    const token = noel!.token;
    noel!.close();
    clock.advance(delay - 100);

    const reconnected = new HubSocket(hub);
    reconnected.sendMsg({ type: "resume", token: token! });
    expect(reconnected.view).toMatchObject({
      phase: "feedback",
      turn: { id: turnId, stage: "feedback" },
      phaseRemainingMs: 100,
    });
    expect(reconnected.view?.kind === "memory" && reconnected.view.turn?.board).toEqual(expectedBoard);
    expect(projector().board).toEqual(expectedBoard);

    const resumedSpectator = new HubSocket(hub);
    resumedSpectator.sendMsg({ type: "resume", token: spectator!.token! });
    const snapshots = resumedSpectator.raw.filter(({ type }) => type === "player.state");
    expect(snapshots.at(-1)).toMatchObject({ view: { phase: "feedback", turn: null } });
    expect(JSON.stringify(snapshots)).not.toMatch(/"(?:face|board)"/);

    clock.advance(99);
    expect(projector().phase).toBe("feedback");
    clock.advance(1);
    await Promise.resolve();
    expect(reconnected.view).toMatchObject({ phase: "turn", turn: { id: turnId + 1, stage: "picking", step: 1 }, phaseRemainingMs: 20_000 });
    expect(facesUp()).toEqual([]);
  });

  test("reveals the first confirmed card on the projector and active phone without extending the turn", async () => {
    const {
      host,
      phones: [noel, spectator],
    } = await launch(["Noel", "Holly"]);
    playQuestion(host, [noel!]);
    playQuestion(host);
    playQuestion(host);

    await Promise.resolve();
    const turnId = projector().turn!.id;
    const hiddenBoard = Array.from({ length: 100 }, () => ({ state: "down" }));
    expect(noel!.view).toMatchObject({ turn: { id: turnId, stage: "picking", step: 1, board: hiddenBoard }, phaseRemainingMs: 20_000 });
    expect(spectator!.view).toMatchObject({ turn: null });
    expect(facesUp()).toEqual([]);

    clock.advance(4_000);
    noel!.sendMsg({ type: "memory.confirm", turnId, step: 1, position: 0 });
    await Promise.resolve();
    expect(facesUp()).toEqual([[0, 0]]);
    expect(projector()).toMatchObject({ phase: "turn", phaseRemainingMs: 16_000 });
    expect(noel!.view).toMatchObject({
      phase: "turn",
      me: { chips: 1, pairs: 0 },
      turn: { id: turnId, stage: "picking", step: 2, board: [{ state: "up", face: 0 }, ...hiddenBoard.slice(1)] },
    });
    const spectatorToken = spectator!.token;
    const resumedSpectator = new HubSocket(hub);
    resumedSpectator.sendMsg({ type: "resume", token: spectatorToken! });
    expect(resumedSpectator.view).toMatchObject({ turn: null });
    expect(JSON.stringify(resumedSpectator.view)).not.toMatch(/"(?:face|board)"/);

    const framesBeforeFeedback = resumedSpectator.raw.length;
    confirm(noel!, 2, 2);
    await Promise.resolve();
    expect(facesUp()).toEqual([
      [0, 0],
      [2, 1],
    ]);
    expect(resumedSpectator.view).toMatchObject({ phase: "feedback", turn: null });
    const feedbackFrames = resumedSpectator.raw.slice(framesBeforeFeedback).filter(({ type }) => type === "player.patch");
    expect(feedbackFrames.length).toBeGreaterThan(0);
    expect(JSON.stringify(feedbackFrames)).not.toMatch(/"(?:face|board)"/);
    const frames = spectator!.raw.filter(({ type }) => type === "player.state" || type === "player.patch");
    expect(JSON.stringify(frames)).not.toMatch(/"(?:face|board)"/);
  });

  test("refuses confirmation at the turn deadline even before expiry runs and accepts it one millisecond before", async () => {
    const {
      host,
      phones: [noel],
    } = await launch(["Noel"]);
    playQuestion(host, [noel!]);
    playQuestion(host, [noel!]);
    playQuestion(host);

    clock.advance(19_999);
    confirm(noel!, 1, 0);
    expect(projector()).toMatchObject({ phase: "turn", phaseRemainingMs: 1 });
    expect(facesUp()).toEqual([[0, 0]]);

    clock.t += 1;
    confirm(noel!, 2, 1);
    clock.t += 1;
    confirm(noel!, 2, 1);
    expect(projector()).toMatchObject({ phase: "turn", players: [{ chips: 2, pairs: 0 }] });
    expect(facesUp()).toEqual([[0, 0]]);

    clock.advance(0);
    expect(projector()).toMatchObject({ phase: "turn", players: [{ chips: 1, pairs: 0 }], phaseRemainingMs: 19_999 });
    expect(facesUp()).toEqual([]);
    confirm(noel!, 1, 0);
    clock.advance(19_998);
    expect(projector().phaseRemainingMs).toBe(1);
    confirm(noel!, 2, 1);
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
      expect(player(noel!)).toMatchObject({ boardSize, turn: { board: expectedBoard } });
      const positions: [number, number] = pair === 0 ? [0, expectedBoard.length - 1] : [pair * 2 - 1, pair * 2];
      confirmPair(noel!, positions);
      const exposed = facesUp();
      const face = exposed[0]?.[1];
      expect(face).toBeDefined();
      expect(exposed).toEqual(positions.map((position) => [position, face]));
      revealedFaces.add(face!);
      expect(projector().players[0]?.pairs).toBe(pair + 1);
      clock.advance(1_399);
      expect(projector().phase).toBe("feedback");
      clock.advance(1);
      for (const position of positions) expectedBoard[position] = { state: "empty" };
    }
    expect([...revealedFaces].sort((a, b) => a - b)).toEqual(Array.from({ length: pairCount }, (_, index) => index + (boardSize === 10 ? 0 : 1)));
    expect(projector()).toMatchObject({
      phase: "podium",
      board: expectedBoard,
      players: [{ pairs: pairCount, chips: chipsLeft }],
      podium: [{ place: 1, player: { pairs: pairCount } }],
    });
    expect(player(noel!).result).toEqual({ place: 1, playerCount: 1, awards: ["Fastest answers", "Most correct"] });
    clock.advance(60_000);
    expect(projector().phase).toBe("podium");
  });

  test.each(["questions", "turn", "first confirmed card", "match feedback"])("host End during %s reaches and stays at the podium", async (when) => {
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
      if (when === "first confirmed card") confirm(noel!, 1, 0);
      if (when === "match feedback") {
        confirmPair(noel!, [0, 1]);
        expect(projector().phase).toBe("feedback");
      }
    }

    host.sendMsg({ type: "host.end" });
    expect(facesUp()).toEqual([]);
    const matched = when === "match feedback" ? 1 : 0;
    const sharedPlace = matched ? 2 : 1;
    expect(projector().phase).toBe("podium");
    expect(projector().podium!.map(({ place, player: { nickname, pairs } }) => ({ place, nickname, pairs }))).toEqual([
      { nickname: "Noel", pairs: matched, place: 1 },
      { nickname: "Holly", pairs: 0, place: sharedPlace },
      { nickname: "Ivy", pairs: 0, place: sharedPlace },
    ]);
    expect(player(holly!).result).toEqual({ place: sharedPlace, playerCount: 3, awards: [] });
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
  test("a kick during the podium leaves the places, the other phones' results and the results sheet unchanged", async () => {
    const {
      host,
      phones: [noel, holly],
    } = await launch(["Noel", "Holly", "Ivy"]);
    for (let i = 0; i < 3; i++) playQuestion(host, [noel!]);
    confirmPair(noel!, [0, 1]);
    host.sendMsg({ type: "host.end" });
    const places = () => projector().podium!.map((r) => [r.place, r.player.nickname]);
    expect(places()).toEqual([
      [1, "Noel"],
      [2, "Holly"],
      [2, "Ivy"],
    ]);
    const sheet = memoryMode.results(hub.game as MemoryGame);

    host.sendMsg({ type: "host.kick", playerId: projector().players.find((p) => p.nickname === "Noel")!.id });

    expect(projector().players.map((p) => p.nickname)).toEqual(["Holly", "Ivy"]);
    expect(places()).toEqual([
      [1, "Noel"],
      [2, "Holly"],
      [2, "Ivy"],
    ]);
    expect(player(holly!).result).toEqual({ place: 2, playerCount: 3, awards: [] });
    expect(memoryMode.results(hub.game as MemoryGame)).toEqual(sheet);
  });

  test("players with the same matched pairs share a place and are listed by correct answers, in the podium and the results sheet", async () => {
    const {
      host,
      phones: [, holly, ivy],
    } = await launch(["Noel", "Holly", "Ivy"], { count: 2 });
    playQuestion(host, [ivy!, holly!]);
    playQuestion(host, [ivy!]);
    host.sendMsg({ type: "host.end" });

    expect(projector().podium!.map((r) => [r.place, r.player.nickname])).toEqual([
      [1, "Ivy"],
      [1, "Holly"],
      [1, "Noel"],
    ]);
    expect(projector().players.every((p) => !("rank" in p))).toBe(true);
    expect(memoryMode.results(hub.game as MemoryGame).rows.map((row) => row.slice(0, 2))).toEqual([
      [1, "Ivy"],
      [1, "Holly"],
      [1, "Noel"],
    ]);
  });

  test("the live scoreboard is sorted by matched pairs without a rank", async () => {
    const {
      host,
      phones: [, holly],
    } = await launch(["Noel", "Holly"]);
    for (let i = 0; i < 3; i++) playQuestion(host, [holly!]);
    confirmPair(holly!, [0, 1]);
    expect(projector().players).toMatchObject([
      { nickname: "Holly", pairs: 1 },
      { nickname: "Noel", pairs: 0 },
    ]);
    expect(projector().players.every((p) => !("rank" in p))).toBe(true);
    expect(projector().podium).toBeNull();
  });
  test("Most correct goes to everyone tied on the most correct answers, and the phones list it", async () => {
    const {
      host,
      phones: [noel, holly, ivy],
    } = await launch(["Noel", "Holly", "Ivy"], { count: 2 });
    playQuestion(host, [holly!, ivy!]);
    playQuestion(host, [holly!, ivy!, noel!]);
    host.sendMsg({ type: "host.end" });

    expect(projector().awards?.mostCorrect).toEqual({ value: 2, nicknames: ["Holly", "Ivy"] });
    expect(player(holly!).result?.awards).toContain("Most correct");
    expect(player(noel!).result?.awards).not.toContain("Most correct");
  });

  test("nobody gets Most correct or Fastest answers when nobody answered correctly", async () => {
    const {
      host,
      phones: [noel],
    } = await launch(["Noel", "Holly"]);
    const index = openQuestion(host);
    clock.advance(100);
    submit(noel!, index, 1);
    host.sendMsg({ type: "host.end" });

    expect(projector().awards).toEqual({ fastestAnswers: null, mostCorrect: null });
    expect(player(noel!).result?.awards).toEqual([]);
  });

  test("Fastest answers goes to the lowest average correct-answer time and ignores wrong answers", async () => {
    const {
      host,
      phones: [noel, holly, ivy],
    } = await launch(["Noel", "Holly", "Ivy"], { count: 2 });
    let index = openQuestion(host);
    clock.advance(10);
    submit(ivy!, index, 1);
    clock.advance(90);
    submit(holly!, index, 1);
    clock.advance(100);
    submit(noel!, index);
    host.sendMsg({ type: "host.skip" });
    host.sendMsg({ type: "host.next" });
    index = openQuestion(host);
    clock.advance(400);
    submit(holly!, index);
    clock.advance(300);
    submit(noel!, index);
    host.sendMsg({ type: "host.end" });

    const fastest = projector().awards?.fastestAnswers;
    expect(fastest?.nicknames).toEqual(["Holly"]);
    expect(1 / fastest!.value).toBeCloseTo(0.4);
    expect(player(holly!).result?.awards).toEqual(["Fastest answers"]);
    expect(player(ivy!).result?.awards).toEqual([]);
  });

  test("equal average correct-answer times share Fastest answers", async () => {
    const {
      host,
      phones: [noel, holly],
    } = await launch(["Noel", "Holly", "Ivy"], { count: 2 });
    let index = openQuestion(host);
    clock.advance(100);
    submit(noel!, index);
    clock.advance(200);
    submit(holly!, index);
    host.sendMsg({ type: "host.skip" });
    host.sendMsg({ type: "host.next" });
    index = openQuestion(host);
    clock.advance(100);
    submit(holly!, index);
    clock.advance(200);
    submit(noel!, index);
    host.sendMsg({ type: "host.end" });

    expect(projector().awards?.fastestAnswers?.nicknames).toEqual(["Noel", "Holly"]);
    expect(player(noel!).result?.awards).toContain("Fastest answers");
  });
});
