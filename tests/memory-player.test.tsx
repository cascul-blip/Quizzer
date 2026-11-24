import { expect, mock, test } from "bun:test";
import { render } from "preact";
import { act } from "preact/test-utils";
import { MemoryPlayer } from "../src/client/player/memory.tsx";
import type { PlayerMemoryView } from "../src/shared/modes/memory.ts";
import type { ClientMsg } from "../src/shared/protocol.ts";
import { usePhoneDom } from "./phone-dom.ts";

const dom = usePhoneDom();
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
  turn: { id: 4, available: Array.from({ length: 36 }, (_, i) => i !== 6) },
  phaseRemainingMs: 15_000,
  result: null,
};

function phone() {
  const send = mock((_message: ClientMsg) => {});
  const show = (view: PlayerMemoryView) => act(() => render(<MemoryPlayer view={view} send={send} />, dom.root));
  return { show, send };
}

function card(position: number) {
  return dom.root.querySelector<HTMLButtonElement>(`button[aria-label="Card ${position + 1}"]`);
}

for (const boardSize of [6, 8, 10] as const) {
  test(`Memory Game starts the ${boardSize}×${boardSize} turn with all card backs and empty spaces in view`, () => {
    const { show } = phone();
    const cardCount = boardSize ** 2;
    show({ ...turnView, boardSize, turn: { id: 4, available: Array.from({ length: cardCount }, (_, i) => i !== 6) } });
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

function confirmPair() {
  return dom.root.querySelector<HTMLButtonElement>(".memory-confirm")!;
}

function pointer(target: Element, type: string, pointerId: number, clientX: number, clientY: number) {
  target.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerId, clientX, clientY }));
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
  expect(confirmPair().disabled).toBe(true);
});

test("Memory Game lets the player deselect either card and sends only the explicitly confirmed pair", () => {
  const { show, send } = phone();
  show(turnView);
  expect(confirmPair().disabled).toBe(true);

  act(() => card(3)?.click());
  expect(confirmPair().disabled).toBe(true);
  act(() => card(8)?.click());
  expect(confirmPair().disabled).toBe(false);
  expect(card(9)?.getAttribute("aria-disabled")).toBe("true");
  act(() => card(9)?.click());
  expect(card(9)?.getAttribute("aria-pressed")).toBe("false");
  expect(send).not.toHaveBeenCalled();

  act(() => card(3)?.click());
  expect(card(3)?.getAttribute("aria-pressed")).toBe("false");
  expect(confirmPair().disabled).toBe(true);
  act(() => card(9)?.click());
  expect(confirmPair().disabled).toBe(false);
  expect(send).not.toHaveBeenCalled();
  act(() => confirmPair().click());
  expect(send.mock.calls).toEqual([[{ type: "memory.confirm", turnId: 4, positions: [8, 9] }]]);
});

test("Memory Game does not submit local selections when the turn expires", () => {
  const { show, send } = phone();
  show(turnView);
  act(() => card(3)?.click());
  act(() => card(8)?.click());
  expect(confirmPair().disabled).toBe(false);
  dom.advance(15_005);
  expect(confirmPair().disabled).toBe(true);
  expect(send).not.toHaveBeenCalled();
});

test("Memory Game prompts spectators to watch the projector and uses the standard paced question controls", () => {
  const { show, send } = phone();
  show({ ...turnView, turn: null });
  expect(dom.root.textContent).toContain("Watch the projector");
  expect(card(0)).toBeNull();
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

test("Memory Game provides zoom buttons", () => {
  const { show } = phone();
  show(turnView);
  const zoomIn = dom.root.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!;
  const zoomOut = dom.root.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]')!;
  const pan = dom.root.querySelector<HTMLDivElement>(".memory-board-pan")!;
  act(() => zoomIn.click());
  expect(pan.style.transform).toContain("scale(1.5)");
  act(() => zoomOut.click());
  expect(pan.style.transform).toBe("");
});
