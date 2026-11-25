import { expect, mock, test } from "bun:test";
import { render } from "preact";
import { act } from "preact/test-utils";
import { PhoneModeScreen } from "../src/client/player/modes.tsx";
import type { MemoryCardView, PlayerMemoryView } from "../src/shared/modes/memory.ts";
import type { ClientMsg } from "../src/shared/protocol.ts";
import { usePhoneDom } from "./phone-dom.ts";

const dom = usePhoneDom();
function board(size: number): MemoryCardView[] {
  return Array.from({ length: size ** 2 }, (_, position) => ({ state: position === 6 ? "empty" : "down" }));
}

const turnView: PlayerMemoryView = {
  kind: "memory",
  title: "Christmas Quiz",
  phase: "turn",
  me: { id: "noel", avatar: { avatar: "santaclaus", accessory: "none" }, nickname: "Noel", chips: 2, pairs: 0 },
  question: null,
  myChoice: null,
  myText: null,
  reveal: null,
  boardSize: 6,
  turn: { id: 4, step: 1, board: board(6) },
  phaseRemainingMs: 20_000,
  result: null,
};

function phone() {
  const send = mock((_message: ClientMsg) => {});
  const show = (view: PlayerMemoryView, resumeVersion = 0) =>
    act(() => render(<PhoneModeScreen view={view} send={send} resumeVersion={resumeVersion} />, dom.root));
  return { show, send };
}

function card(position: number) {
  return dom.root.querySelector<HTMLButtonElement>(`button[aria-label="Card ${position + 1}"]`);
}

for (const boardSize of [6, 8, 10] as const) {
  test(`Memory Game starts the ${boardSize}×${boardSize} turn with all card backs and empty spaces in view`, () => {
    const { show } = phone();
    const cardCount = boardSize ** 2;
    show({ ...turnView, boardSize, turn: { id: 4, step: 1, board: board(boardSize) } });
    const cells = dom.root.querySelector<HTMLDivElement>(".memory-board-pan")!;
    expect(cells.children.length).toBe(cardCount);
    expect(cells.style.gridTemplateColumns).toBe(`repeat(${boardSize}, minmax(0, 1fr))`);
    expect(cells.querySelectorAll(".memory-card-back")).toHaveLength(cardCount - 1);
    expect(cells.children[6]?.getAttribute("aria-hidden")).toBe("true");
    expect(card(6)).toBeNull();
    expect(card(cardCount - 1)?.getAttribute("aria-pressed")).toBe("false");
    expect(cells.style.transform).toBe("");
  });
}

function confirmCard() {
  return dom.root.querySelector<HTMLButtonElement>(".memory-confirm")!;
}

function pointer(target: Element, type: string, pointerId: number, clientX: number, clientY: number) {
  target.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerId, clientX, clientY }));
}

function pinchZoom() {
  const viewport = dom.root.querySelector(".memory-board-viewport")!;
  act(() => {
    pointer(viewport, "pointerdown", 91, 30, 30);
    pointer(viewport, "pointerdown", 92, 90, 30);
    pointer(viewport, "pointermove", 92, 120, 30);
    pointer(viewport, "pointerup", 92, 120, 30);
    pointer(viewport, "pointerup", 91, 30, 30);
  });
}

function clickCard(position: number) {
  const button = card(position)!;
  button.dispatchEvent(Object.assign(new Event("click", { bubbles: true }), { detail: 1 }));
}

test("Memory Game zooms and pans without choosing cards during a pinch or drag, then resets the next turn", () => {
  const { show, send } = phone();
  show(turnView);
  const viewport = dom.root.querySelector(".memory-board-viewport")!;
  const pan = dom.root.querySelector<HTMLDivElement>(".memory-board-pan")!;
  Object.defineProperties(viewport, { clientWidth: { value: 300 }, clientHeight: { value: 300 } });

  act(() => {
    pointer(card(0)!, "pointerdown", 1, 30, 30);
    pointer(card(2)!, "pointerdown", 2, 90, 30);
    pointer(card(2)!, "pointermove", 2, 150, 30);
    pointer(card(2)!, "pointerup", 2, 150, 30);
    pointer(card(0)!, "pointerup", 1, 30, 30);
    clickCard(0);
  });
  expect(pan.style.transform).toContain("scale(2)");
  expect(pan.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);

  const afterPinch = pan.style.transform;
  act(() => {
    pointer(card(2)!, "pointerdown", 3, 110, 100);
    pointer(card(2)!, "pointermove", 3, 90, 80);
    pointer(card(2)!, "pointerup", 3, 90, 80);
    clickCard(2);
  });
  expect(pan.style.transform).not.toBe(afterPinch);
  expect(pan.style.transform).toContain("scale(2)");
  expect(pan.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  expect(send).not.toHaveBeenCalled();

  act(() => {
    pointer(card(2)!, "pointerdown", 4, 110, 100);
    pointer(card(2)!, "pointerup", 4, 110, 100);
    clickCard(2);
  });
  expect(card(2)?.getAttribute("aria-pressed")).toBe("true");

  show({ ...turnView, turn: { ...turnView.turn!, id: 5 } });
  expect(dom.root.querySelector<HTMLDivElement>(".memory-board-pan")!.style.transform).toBe("");
  expect(card(2)?.getAttribute("aria-pressed")).toBe("false");
  expect(confirmCard().disabled).toBe(true);
});

test("Memory Game replaces or clears a selection and confirms one card at a time", () => {
  const { show, send } = phone();
  show(turnView);
  expect(confirmCard().disabled).toBe(true);

  act(() => card(3)?.click());
  expect(card(3)?.getAttribute("aria-pressed")).toBe("true");
  expect(confirmCard().disabled).toBe(false);
  act(() => card(8)?.click());
  expect(card(3)?.getAttribute("aria-pressed")).toBe("false");
  expect(card(8)?.getAttribute("aria-pressed")).toBe("true");
  act(() => card(8)?.click());
  expect(card(8)?.getAttribute("aria-pressed")).toBe("false");
  expect(confirmCard().disabled).toBe(true);
  expect(send).not.toHaveBeenCalled();

  pinchZoom();
  act(() => card(0)?.click());
  act(() => confirmCard().click());
  expect(send.mock.calls).toEqual([[{ type: "memory.confirm", turnId: 4, step: 1, position: 0 }]]);

  dom.advance(4_000);
  show({
    ...turnView,
    turn: { id: 4, step: 2, board: [{ state: "up", face: 0 }, ...turnView.turn!.board.slice(1)] },
    phaseRemainingMs: 16_000,
  });
  expect(dom.root.querySelector('[role="timer"]')?.textContent).toBe("16");
  expect(dom.root.querySelector<HTMLDivElement>(".memory-board-pan")?.style.transform).toContain("scale(1.5)");
  const revealed = dom.root.querySelector('[aria-label="Card 1, Santa Claus"]');
  expect(revealed).not.toBeNull();
  expect(card(0)).toBeNull();
  expect(confirmCard().disabled).toBe(true);
  act(() => card(1)?.click());
  act(() => confirmCard().click());
  expect(send.mock.calls).toEqual([
    [{ type: "memory.confirm", turnId: 4, step: 1, position: 0 }],
    [{ type: "memory.confirm", turnId: 4, step: 2, position: 1 }],
  ]);
});

test("Memory Game restores the authoritative countdown on reconnect without resetting the current reveal turn", () => {
  const { show, send } = phone();
  const secondPick: PlayerMemoryView = {
    ...turnView,
    turn: { id: 4, step: 2, board: [{ state: "up", face: 0 }, ...board(6).slice(1)] },
  };
  show(secondPick);
  const pan = dom.root.querySelector<HTMLDivElement>(".memory-board-pan")!;
  pinchZoom();
  const transform = pan.style.transform;
  expect(transform).toContain("scale(1.5)");
  act(() => card(3)?.click());
  dom.advance(4_000);
  expect(dom.root.querySelector('[role="timer"]')?.textContent).toBe("16");

  show({ ...secondPick, phaseRemainingMs: 6_000 }, 1);
  expect(dom.root.querySelector('[role="timer"]')?.textContent).toBe("6");
  expect(dom.root.querySelector('[aria-label="Card 1, Santa Claus"]')).not.toBeNull();
  expect(pan.style.transform).toBe(transform);
  expect(card(3)?.getAttribute("aria-pressed")).toBe("true");
  act(() => confirmCard().click());
  expect(send.mock.calls).toEqual([[{ type: "memory.confirm", turnId: 4, step: 2, position: 3 }]]);
});

test.each([
  ["match", 0, "Santa Claus", 1_000],
  ["mismatch", 1, "Christmas tree", 2_000],
] as const)("Memory Game keeps the %s faces visible and locks selection until the next reveal turn", (outcome, secondFace, secondName, delay) => {
  const { show, send } = phone();
  const firstCard: MemoryCardView = { state: "up", face: 0 };
  show({ ...turnView, turn: { id: 4, step: 2, board: [firstCard, ...board(6).slice(1)] } });
  act(() => card(2)?.click());
  expect(confirmCard().disabled).toBe(false);
  pinchZoom();
  expect(dom.root.querySelector<HTMLDivElement>(".memory-board-pan")?.style.transform).toContain("scale(1.5)");

  show({
    ...turnView,
    phase: "feedback",
    turn: { id: 4, step: null, board: [firstCard, { state: "up", face: secondFace }, ...board(6).slice(2)] },
    phaseRemainingMs: delay,
  });
  const faces = () => Array.from(dom.root.querySelectorAll('[role="img"]'), (face) => face.getAttribute("aria-label"));
  expect(faces()).toEqual(["Card 1, Santa Claus", `Card 2, ${secondName}`]);
  expect(dom.root.querySelectorAll('[role="timer"]')).toHaveLength(0);
  expect(dom.root.querySelector('button[aria-label="Zoom in"]')).toBeNull();
  expect(dom.root.querySelector('button[aria-label="Zoom out"]')).toBeNull();
  const viewport = dom.root.querySelector(".memory-board-viewport")!;
  const pan = dom.root.querySelector<HTMLDivElement>(".memory-board-pan")!;
  expect(pan.style.transform).toBe("");
  act(() => {
    viewport.dispatchEvent(Object.assign(new Event("wheel", { bubbles: true, cancelable: true }), { deltaY: -1 }));
    pointer(viewport, "pointerdown", 1, 30, 30);
    pointer(viewport, "pointerdown", 2, 90, 30);
    pointer(viewport, "pointermove", 2, 150, 30);
    pointer(viewport, "pointerup", 2, 150, 30);
    pointer(viewport, "pointerup", 1, 30, 30);
  });
  expect(pan.style.transform).toBe("");
  expect(card(2)?.getAttribute("aria-pressed")).toBe("false");
  expect(card(2)?.getAttribute("aria-disabled")).toBe("true");
  expect(confirmCard().disabled).toBe(true);
  act(() => {
    card(3)?.click();
    confirmCard().click();
  });
  expect(card(3)?.getAttribute("aria-pressed")).toBe("false");
  expect(send).not.toHaveBeenCalled();

  dom.advance(delay - 1);
  expect(faces()).toEqual(["Card 1, Santa Claus", `Card 2, ${secondName}`]);
  expect(confirmCard().disabled).toBe(true);

  dom.advance(1);
  const nextBoard = board(6);
  if (outcome === "match") nextBoard[0] = nextBoard[1] = { state: "empty" };
  show({ ...turnView, turn: { id: 5, step: 1, board: nextBoard } });
  expect(faces()).toEqual([]);
  expect(card(0) === null).toBe(outcome === "match");
  expect(card(1) === null).toBe(outcome === "match");
  expect(dom.root.querySelector('[role="timer"]')?.textContent).toBe("20");
  act(() => card(3)?.click());
  expect(confirmCard().disabled).toBe(false);
});

test("Memory Game does not submit local selections when the turn expires", () => {
  const { show, send } = phone();
  show(turnView);
  act(() => card(3)?.click());
  expect(confirmCard().disabled).toBe(false);
  dom.advance(20_005);
  expect(confirmCard().disabled).toBe(true);
  expect(send).not.toHaveBeenCalled();
});

test("Memory Game prompts spectators to watch the projector and uses the standard paced question controls", () => {
  const { show, send } = phone();
  show({ ...turnView, turn: null });
  expect(dom.root.textContent).toContain("Watch the projector");
  expect(card(0)).toBeNull();
  show({ ...turnView, phase: "feedback", turn: null });
  expect(dom.root.textContent).toContain("Watch the projector");
  expect(dom.root.querySelector(".memory-board-pan")).toBeNull();
  show({
    ...turnView,
    phase: "open",
    turn: null,
    question: { index: 3, total: 8, type: "true_false", text: "Reindeer can swim.", options: ["True", "False"], timeLimitSec: 12, remainingMs: 12_000 },
  });
  expect(dom.root.querySelector(".q-text")?.textContent).toBe("Reindeer can swim.");
  act(() => dom.root.querySelector<HTMLButtonElement>(".answer")?.click());
  expect(dom.root.textContent).toContain("Answer locked in");
  expect(send.mock.calls).toEqual([[{ type: "memory.answer", index: 3, option: 0, text: undefined }]]);
});

test("Memory Game zooms by touch alone and tells the player to pinch to zoom", () => {
  const { show } = phone();
  show(turnView);
  expect(dom.root.querySelector('button[aria-label="Zoom in"]')).toBeNull();
  expect(dom.root.querySelector('button[aria-label="Zoom out"]')).toBeNull();
  expect(dom.root.querySelector(".memory-board-controls")?.textContent?.toLowerCase()).toContain("pinch to zoom");
  pinchZoom();
  expect(dom.root.querySelector<HTMLDivElement>(".memory-board-pan")!.style.transform).toContain("scale(1.5)");
});

function upBoard(size: number, ups: Record<number, number>): MemoryCardView[] {
  return board(size).map((c, p) => (p in ups ? { state: "up", face: ups[p]! } : c));
}

function face(position: number) {
  return dom.root.querySelector<HTMLElement>(`[aria-label^="Card ${position + 1},"]`);
}

test("Memory Game flips a card face up on the phone when it is confirmed, not when it is selected", () => {
  const { show } = phone();
  show(turnView);
  act(() => clickCard(3));
  expect(card(3)?.classList.contains("memory-flip-up")).toBe(false);
  expect(dom.root.querySelector(".memory-flip-up")).toBeNull();
  show({ ...turnView, turn: { id: 4, step: 2, board: upBoard(6, { 3: 7 }) } });
  expect(face(3)?.classList.contains("memory-flip-up")).toBe(true);
  expect(face(3)?.getAttribute("aria-label")).toBe("Card 4, Gingerbread person");
  show({ ...turnView, phase: "feedback", turn: { id: 4, step: null, matched: false, board: upBoard(6, { 3: 7, 9: 2 }) }, phaseRemainingMs: 2_000 });
  expect(face(9)?.classList.contains("memory-flip-up")).toBe(true);
  expect(face(3)?.classList.contains("memory-flip-up")).toBe(true);
});

test("Memory Game flips a missed pair back face down on the phone at the end of the 2 s result", () => {
  const { show } = phone();
  show({ ...turnView, phase: "feedback", turn: { id: 4, step: null, matched: false, board: upBoard(6, { 3: 7, 9: 2 }) }, phaseRemainingMs: 2_000 });
  dom.advance(1_500);
  expect(face(3)?.getAttribute("aria-label")).toBe("Card 4, Gingerbread person");
  expect(dom.root.querySelector(".memory-flip-down")).toBeNull();
  dom.advance(200);
  expect(dom.root.querySelectorAll(".memory-flip-down")).toHaveLength(2);
  expect(face(3)?.getAttribute("aria-label")).toBe("Card 4, face down");
  expect(face(9)?.getAttribute("aria-label")).toBe("Card 10, face down");
});

test("Memory Game shows a matched pair face up on the phone, then slides it off the right edge", () => {
  const { show } = phone();
  show({ ...turnView, phase: "feedback", turn: { id: 4, step: null, matched: true, board: upBoard(6, { 3: 7, 9: 7 }) }, phaseRemainingMs: 1_400 });
  dom.advance(850);
  expect(dom.root.querySelector(".memory-flip-down")).toBeNull();
  expect(dom.root.querySelector(".memory-slide-off")).toBeNull();
  expect(face(3)?.getAttribute("aria-label")).toBe("Card 4, Gingerbread person");
  dom.advance(100);
  expect(face(3)?.classList.contains("memory-slide-off")).toBe(true);
  expect(face(9)?.classList.contains("memory-slide-off")).toBe(true);
  expect(dom.root.querySelectorAll(".memory-slide-off")).toHaveLength(2);
  expect(dom.root.querySelector(".memory-flip-down")).toBeNull();
});

test("Memory Game does not slide a missed pair off the phone board", () => {
  const { show } = phone();
  show({ ...turnView, phase: "feedback", turn: { id: 4, step: null, matched: false, board: upBoard(6, { 3: 7, 9: 2 }) }, phaseRemainingMs: 2_000 });
  dom.advance(1_900);
  expect(dom.root.querySelector(".memory-slide-off")).toBeNull();
});

test("Memory Game flips a lone confirmed card back face down on the phone when the turn runs out", () => {
  const { show } = phone();
  show({ ...turnView, turn: { id: 4, step: 2, board: upBoard(6, { 3: 7 }) }, phaseRemainingMs: 5_000 });
  dom.advance(4_500);
  expect(dom.root.querySelector(".memory-flip-down")).toBeNull();
  dom.advance(200);
  expect(face(3)?.classList.contains("memory-flip-down")).toBe(true);
  expect(face(3)?.getAttribute("aria-label")).toBe("Card 4, face down");
});
