import { beforeAll, expect, mock, test } from "bun:test";
import { render } from "preact";
import { act } from "preact/test-utils";
import { TowerPlayer } from "../src/client/player/tower.tsx";
import type { PlayerTowerView } from "../src/shared/modes/tower.ts";
import type { ClientMsg } from "../src/shared/protocol.ts";
import { usePhoneDom } from "./phone-dom.ts";

const dom = usePhoneDom();
beforeAll(() => {
  // Happy DOM doesn't lay out the build area. Give the scene a measurable viewport.
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 300 });
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
  build: { columns: [1, 0, 0], floors: 0, sweepDurationMs: 2500, wait: { activityKey: 4, remainingMs: 1000 } },
  result: null,
};

function phone() {
  const send = mock((_message: ClientMsg) => {});
  return { send, show: (view: PlayerTowerView) => act(() => render(<TowerPlayer view={view} send={send} />, dom.root)) };
}

function tapTower() {
  act(() => {
    dom.root.querySelector(".build-area")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
}

test("Tallest Tower renders the build during the after-answer wait and drops only on a fresh tap at expiry", () => {
  const { show, send } = phone();
  show(buildView);
  expect(dom.root.querySelector(".build-svg")).not.toBeNull();
  expect(dom.root.textContent).toContain("Drop available in 1s");
  expect(dom.root.querySelector("button")).toBeNull();
  expect(dom.root.querySelector('[role="status"]')).toBeNull();

  dom.advance(999);
  tapTower();
  expect(send).not.toHaveBeenCalled();
  expect(dom.vibrate).not.toHaveBeenCalled();
  expect(dom.root.querySelector(".piece:not(.slider)")).toBeNull();
  expect(dom.root.querySelector('[aria-label="4 of 4 blocks"]')).not.toBeNull();

  dom.advance(1);
  expect(dom.root.textContent).toContain("Tap anywhere to drop");
  expect(send).not.toHaveBeenCalled();
  expect(dom.vibrate).not.toHaveBeenCalled();
  expect(dom.root.querySelector(".piece:not(.slider)")).toBeNull();
  tapTower();
  expect(send.mock.calls).toEqual([[{ type: "tower.drop", zone: 2 }]]);
  expect(dom.vibrate.mock.calls).toEqual([[25]]);
  expect(dom.root.querySelector(".piece:not(.slider)")).not.toBeNull();
});

test("Tallest Tower still holds the last block's fall before returning to the next question", () => {
  const { show, send } = phone();
  show({ ...buildView, build: { ...buildView.build!, wait: { activityKey: 4, remainingMs: 0 } }, blocksHeld: 1 });
  tapTower();
  expect(send).toHaveBeenCalledTimes(1);
  show({
    ...buildView,
    build: null,
    state: "question",
    blocksHeld: 0,
    question: { seq: 5, type: "multiple_choice", text: "Next question", options: ["One", "Two"] },
  });
  dom.advance(949);
  expect(dom.root.querySelector(".piece:not(.slider)")).not.toBeNull();
  expect(dom.root.textContent).not.toContain("Next question");
  dom.advance(1);
  expect(dom.root.querySelector(".build-area")).toBeNull();
  expect(dom.root.textContent).toContain("Next question");
});
