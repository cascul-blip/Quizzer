import { expect, mock, test } from "bun:test";
import { render } from "preact";
import { act } from "preact/test-utils";
import { MemoryStage } from "../src/client/host/memory.tsx";
import type { MemoryCardView } from "../src/shared/modes/memory.ts";
import type { HostMsg, HostView, JoinInfo } from "../src/shared/protocol.ts";
import { usePhoneDom } from "./phone-dom.ts";

type MemoryView = Extract<HostView, { kind: "memory" }>;
const dom = usePhoneDom();
const join: JoinInfo = { url: "http://localhost:4321", qrSvg: "", address: "localhost", addresses: [], port: 4321 };

function board(ups: Record<number, number> = {}): MemoryCardView[] {
  return Array.from({ length: 36 }, (_, p) => (p in ups ? { state: "up", face: ups[p]! } : { state: "down" }));
}

const turnView: MemoryView = {
  kind: "memory",
  phase: "turn",
  quiz: { id: "q", title: "Christmas Quiz", questionCount: 6 },
  pacing: "manual",
  question: null,
  correct: null,
  answeredCount: 0,
  revealTurnsNext: false,
  answerCounts: null,
  players: [],
  boardSize: 6,
  board: board(),
  turn: { id: 4, playerId: "noel", nickname: "Noel" },
  feedback: null,
  phaseRemainingMs: 20_000,
  join,
};

function show(view: MemoryView) {
  const send = mock((_m: HostMsg) => {});
  act(() => render(<MemoryStage view={view} send={send} />, dom.root));
}

function card(position: number) {
  return dom.root.querySelector<HTMLElement>(`[aria-label^="Card ${position + 1},"]`)!;
}

test("Memory board on the projector flips each newly confirmed card face up", () => {
  show(turnView);
  expect(dom.root.querySelector(".memory-flip-up")).toBeNull();
  show({ ...turnView, board: board({ 3: 7 }) });
  expect(card(3).classList.contains("memory-flip-up")).toBe(true);
  expect(card(3).getAttribute("aria-label")).toBe("Card 4, Gingerbread person");
  show({ ...turnView, phase: "feedback", feedback: { matched: false }, board: board({ 3: 7, 9: 2 }), phaseRemainingMs: 2_000 });
  expect(card(9).classList.contains("memory-flip-up")).toBe(true);
  expect(card(3).classList.contains("memory-flip-up")).toBe(true);
  expect(dom.root.querySelectorAll(".memory-flip-up")).toHaveLength(2);
});

test("Memory board on the projector flips a missed pair back face down at the end of the 2 s result", () => {
  show({ ...turnView, phase: "feedback", feedback: { matched: false }, board: board({ 3: 7, 9: 2 }), phaseRemainingMs: 2_000 });
  dom.advance(1_500);
  expect(dom.root.querySelector(".memory-flip-down")).toBeNull();
  expect(dom.root.textContent).toContain("Missed");
  dom.advance(200);
  expect(dom.root.querySelectorAll(".memory-flip-down")).toHaveLength(2);
  expect(card(3).getAttribute("aria-label")).toBe("Card 4, face down");
  expect(card(9).getAttribute("aria-label")).toBe("Card 10, face down");
});

test("Memory board on the projector shows a matched pair face up, then slides it right under the scoreboard", () => {
  show({ ...turnView, phase: "feedback", feedback: { matched: true }, board: board({ 3: 7, 9: 7 }), phaseRemainingMs: 1_400 });
  dom.advance(850);
  expect(dom.root.querySelector(".memory-slide-off")).toBeNull();
  expect(card(9).getAttribute("aria-label")).toBe("Card 10, Gingerbread person");
  dom.advance(100);
  expect(card(3).classList.contains("memory-slide-off")).toBe(true);
  expect(card(9).classList.contains("memory-slide-off")).toBe(true);
  expect(dom.root.querySelectorAll(".memory-slide-off")).toHaveLength(2);
  expect(dom.root.querySelector(".memory-flip-down")).toBeNull();
});

test("Memory board on the projector does not slide a missed pair", () => {
  show({ ...turnView, phase: "feedback", feedback: { matched: false }, board: board({ 3: 7, 9: 2 }), phaseRemainingMs: 2_000 });
  dom.advance(1_900);
  expect(dom.root.querySelector(".memory-slide-off")).toBeNull();
});

test("Memory board on the projector flips a lone confirmed card back face down when the turn runs out", () => {
  show({ ...turnView, board: board({ 3: 7 }), phaseRemainingMs: 5_000 });
  dom.advance(4_500);
  expect(dom.root.querySelector(".memory-flip-down")).toBeNull();
  dom.advance(200);
  expect(card(3).classList.contains("memory-flip-down")).toBe(true);
  expect(card(3).getAttribute("aria-label")).toBe("Card 4, face down");
});
