import { afterAll, afterEach, beforeAll, beforeEach, expect, jest, mock, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import { render } from "preact";
import { act } from "preact/test-utils";
import { LandPlayer } from "../src/client/player/land.tsx";
import type { PlayerLandView } from "../src/shared/modes/land.ts";
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

const claimView: PlayerLandView = {
  kind: "land",
  theme: "classic",
  phase: "playing",
  title: "Land Grab",
  remainingMs: 100_000,
  me: { id: "settler", nickname: "Settler", avatar: { avatar: "fox", accessory: "none" }, correct: 2, placed: 0, stolen: 0 },
  team: { index: 0, name: "Red", color: "#d81e3a" },
  teamTiles: 1,
  state: "claim",
  claims: 2,
  answered: 0,
  emptyMs: 0,
  question: null,
  feedback: null,
  board: {
    size: 10,
    owners: Array.from({ length: 100 }, (_, i) => (i === 1 || i === 47 ? 1 : i === 42 ? 0 : -1)),
    starts: [
      { tile: 42, team: 0, out: false },
      { tile: 47, team: 1, out: false },
    ],
  },
  claimWait: { id: 3, remainingMs: 1000 },
  conquered: null,
  result: null,
};

const questionView: PlayerLandView = {
  ...claimView,
  state: "question",
  board: null,
  claimWait: null,
  question: { seq: 4, type: "multiple_choice", text: "Next question", options: ["One", "Two"] },
};

function phone() {
  const send = mock((_message: ClientMsg) => {});
  return { send, show: (view: PlayerLandView) => act(() => render(<LandPlayer view={view} send={send} />, root)) };
}

function tapTile(tile: number) {
  act(() => {
    const hex = root.querySelector(`[data-tile="${tile}"]`)!;
    for (const type of ["pointerdown", "pointerup"]) hex.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerId: 1 }));
  });
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

function placement() {
  return root.querySelector<HTMLButtonElement>(".land-actions button.primary")!;
}

function tapPlacement() {
  act(() => {
    placement().dispatchEvent(new Event("click", { bubbles: true }));
  });
}

for (const { name, tile, claims, otherTile } of [
  { name: "Claim", tile: 0, claims: 1, otherTile: 2 },
  { name: "Steal", tile: 1, claims: 2, otherTile: 0 },
]) {
  test(`Land Grab ignores ${name} until expiry, without spending claims or clearing the selected tile`, () => {
    const { show, send } = phone();
    show({ ...claimView, claims });
    expect(root.textContent).toContain("Claim or Steal available in 1s");
    expect(root.querySelector(".land-claim svg [data-tile]")).not.toBeNull();
    expect(root.querySelector(".answering")).toBeNull();
    expect(root.querySelector(".flash")).toBeNull();
    tapTile(otherTile);
    const firstSelection = root.querySelector(".hex-selected")!.outerHTML;
    tapTile(tile);
    const selection = root.querySelector(".hex-selected")!.outerHTML;
    expect(selection).not.toBe(firstSelection);
    expect(placement().textContent).toContain(name);

    advance(999);
    const map = root.querySelector(".land-area")!.innerHTML;
    expect(placement().disabled).toBe(true);
    tapPlacement();
    expect(send).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
    expect(root.querySelector(".land-area")!.innerHTML).toBe(map);
    expect(root.querySelector(".hex-selected")!.outerHTML).toBe(selection);

    advance(1);
    expect(placement().disabled).toBe(false);
    expect(root.textContent).not.toContain("available in");
    expect(send).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
    tapPlacement();
    expect(send.mock.calls).toEqual([[{ type: "land.place", tile }]]);
    expect(vibrate.mock.calls).toEqual([[25]]);
    expect(root.querySelector(".hex-selected")).toBeNull();
    show({ ...questionView, claims: 0 });
    expect(root.textContent).toContain("Tile placed!");
    expect(root.querySelector(`[data-tile="${tile}"].owned`)?.getAttribute("data-tile")).toBe(String(tile));
    advance(900);
    expect(root.textContent).toContain("Next question");
  });
}

test("Land Grab can bank claims with Done during the wait without holding the land on screen", () => {
  const { show, send } = phone();
  show({ ...claimView, claims: 1 });
  tapTile(0);
  advance(999);
  tapPlacement();
  const done = root.querySelector<HTMLButtonElement>(".land-actions button.ghost")!;
  expect(done.textContent).toBe("Done (keep 1)");
  expect(done.disabled).toBe(false);
  act(() => done.click());
  expect(send.mock.calls).toEqual([[{ type: "land.done" }]]);
  show({ ...questionView, claims: 1 });
  expect(root.querySelector(".land-claim")).toBeNull();
  expect(root.textContent).toContain("Next question");
  advance(1);
  expect(send).toHaveBeenCalledTimes(1);
  expect(vibrate).not.toHaveBeenCalled();
});

test("Land Grab uses the resumed wait without restarting on an unrelated update or carrying it into another activity", () => {
  const { show, send } = phone();
  const resumed = { ...claimView, claimWait: { id: 3, remainingMs: 400 }, claims: 1 };
  show(resumed);
  tapTile(0);
  advance(300);
  show({ ...resumed, teamTiles: 2 });
  advance(99);
  expect(placement().disabled).toBe(true);
  advance(1);
  expect(placement().disabled).toBe(false);

  // A reconnect may skip the questions between these two activities; the later round was all wrong.
  show({ ...resumed, claimWait: { id: 6, remainingMs: 200 } });
  expect(root.textContent).toContain("Claim or Steal available in 1s");
  tapPlacement();
  expect(send).not.toHaveBeenCalled();
  show({ ...resumed, claimWait: { id: 6, remainingMs: 0 } });
  expect(root.textContent).not.toContain("available in");
  tapTile(1);
  expect(root.textContent).toContain("Stealing a tile takes 2 tiles; you have 1");
  expect(placement().disabled).toBe(true);
  tapPlacement();
  tapTile(47);
  expect(root.textContent).toContain("Too close to another team's starting point");
  expect(placement().disabled).toBe(true);
  tapPlacement();
  expect(send).not.toHaveBeenCalled();
  tapTile(0);
  expect(placement().disabled).toBe(false);
});

test("Land Grab shows the land and countdown instead of lingering answer feedback", () => {
  const { show } = phone();
  show({ ...questionView, feedback: { seq: 3, correct: true, remainingMs: 1000, answers: [], penaltyMs: 0 } });
  expect(root.querySelector('.flash[role="status"]')).not.toBeNull();
  show(claimView);
  expect(root.querySelector(".land-claim")).not.toBeNull();
  expect(root.querySelector(".answering")).toBeNull();
  expect(root.querySelector('.flash[role="status"]')?.textContent).toBeUndefined();
});
