import { afterAll, afterEach, beforeAll, beforeEach, expect, jest, mock, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import { render } from "preact";
import { act } from "preact/test-utils";
import { TowerPlayer } from "../src/client/player/tower.tsx";
import type { PlayerTowerView } from "../src/shared/modes/tower.ts";
import type { ClientMsg } from "../src/shared/protocol.ts";

const window = new Window();
const vibrate = mock((_ms: number) => true);
const globals = {
  window,
  document: window.document,
  Event: window.Event,
  navigator: window.navigator,
  ResizeObserver: window.ResizeObserver,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
};
const previous = Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
let root: HTMLDivElement;

beforeAll(() => {
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  Object.defineProperty(window.navigator, "vibrate", { value: vibrate });
  // Happy DOM doesn't lay out the build area. Give the scene a measurable viewport.
  Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 300 });
});
beforeEach(() => {
  jest.useFakeTimers();
  const start = Date.now();
  spyOn(performance, "now").mockImplementation(() => Date.now() - start);
  vibrate.mockClear();
  root = document.createElement("div");
  document.body.appendChild(root);
});
afterEach(() => {
  act(() => render(null, root));
  root.remove();
  jest.restoreAllMocks();
  jest.useRealTimers();
});
afterAll(() => {
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  window.close();
});

const buildView: PlayerTowerView = {
  kind: "tower",
  theme: "classic",
  phase: "playing",
  title: "Tallest Tower",
  remainingMs: 100_000,
  me: { id: "builder", nickname: "Builder", avatar: { avatar: "fox", accessory: "none" }, correct: 4, placed: 0 },
  team: { index: 0, name: "Red", color: "#d81e3a" },
  state: "build",
  blocksHeld: 4,
  question: null,
  feedback: null,
  egg: null,
  monsterEvent: null,
  build: { columns: [1, 0, 0], floors: 0, sweepMs: 2500, remainingMs: 1000 },
  result: null,
};

function phone() {
  const send = mock((_message: ClientMsg) => {});
  return { send, show: (view: PlayerTowerView) => act(() => render(<TowerPlayer view={view} send={send} />, root)) };
}

function tapTower() {
  act(() => {
    root.querySelector(".build-area")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

test("Tallest Tower renders the build during the after-answer wait and drops only on a fresh tap at expiry", () => {
  const { show, send } = phone();
  show(buildView);
  expect(root.querySelector(".build-svg")).not.toBeNull();
  expect(root.textContent).toContain("Drop available in 1s");
  expect(root.querySelector("button")).toBeNull();
  expect(root.querySelector('[role="status"]')).toBeNull();

  advance(999);
  tapTower();
  expect(send).not.toHaveBeenCalled();
  expect(vibrate).not.toHaveBeenCalled();
  expect(root.querySelector(".piece:not(.slider)")).toBeNull();
  expect(root.querySelector('[aria-label="4 of 4 blocks"]')).not.toBeNull();

  advance(1);
  expect(root.textContent).toContain("Tap anywhere to drop");
  expect(send).not.toHaveBeenCalled();
  expect(vibrate).not.toHaveBeenCalled();
  expect(root.querySelector(".piece:not(.slider)")).toBeNull();
  tapTower();
  expect(send.mock.calls).toEqual([[{ type: "tower.drop", zone: 2 }]]);
  expect(vibrate.mock.calls).toEqual([[25]]);
  expect(root.querySelector(".piece:not(.slider)")).not.toBeNull();
});

test("Tallest Tower uses the remaining wait on resume; an unrelated tower update does not restart it", () => {
  const { show, send } = phone();
  const resumedBuild = { ...buildView.build!, remainingMs: 400 };
  show({ ...buildView, build: resumedBuild });
  advance(300);
  // A patch can change the tower while carrying forward an old duration.
  show({ ...buildView, build: { ...resumedBuild, columns: [1, 1, 1], floors: 1 } });
  advance(99);
  tapTower();
  expect(send).not.toHaveBeenCalled();
  advance(1);
  expect(root.textContent).toContain("Tap anywhere to drop");
  tapTower();
  expect(send).toHaveBeenCalledTimes(1);
});

test("Tallest Tower follows a ready resume view and starts a new wait for a later build", () => {
  const { show, send } = phone();
  show(buildView);
  advance(200);
  show({ ...buildView, build: { ...buildView.build!, remainingMs: 0 } });
  expect(root.textContent).toContain("Tap anywhere to drop");

  // A reconnect can skip the intermediate question views.
  show({ ...buildView, me: { ...buildView.me, correct: 8 } });
  expect(root.textContent).toContain("Drop available in 1s");
  tapTower();
  expect(send).not.toHaveBeenCalled();
  advance(1000);
  tapTower();
  expect(send).toHaveBeenCalledTimes(1);
});

test("Tallest Tower still holds the last block's fall before returning to the next question", () => {
  const { show, send } = phone();
  show({ ...buildView, build: { ...buildView.build!, remainingMs: 0 }, blocksHeld: 1 });
  tapTower();
  expect(send).toHaveBeenCalledTimes(1);
  show({
    ...buildView,
    build: null,
    state: "question",
    blocksHeld: 0,
    question: { seq: 5, type: "multiple_choice", text: "Next question", options: ["One", "Two"] },
  });
  advance(949);
  expect(root.querySelector(".piece:not(.slider)")).not.toBeNull();
  expect(root.textContent).not.toContain("Next question");
  advance(1);
  expect(root.querySelector(".build-area")).toBeNull();
  expect(root.textContent).toContain("Next question");
});
