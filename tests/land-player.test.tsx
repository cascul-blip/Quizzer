import { expect, mock, test } from "bun:test";
import { render } from "preact";
import { act } from "preact/test-utils";
import { LandPlayer } from "../src/client/player/land.tsx";
import type { PlayerLandView } from "../src/shared/modes/land.ts";
import type { ClientMsg } from "../src/shared/protocol.ts";
import { claimView } from "./land-claim-fixture.ts";
import { usePhoneDom } from "./phone-dom.ts";

const dom = usePhoneDom();

const questionView: PlayerLandView = {
  ...claimView,
  state: "question",
  board: null,
  claimWait: null,
  question: { seq: 4, type: "multiple_choice", text: "Next question", options: ["One", "Two"] },
};

function phone() {
  const send = mock((_message: ClientMsg) => {});
  return { send, show: (view: PlayerLandView) => act(() => render(<LandPlayer view={view} send={send} />, dom.root)) };
}

function tapTile(tile: number) {
  act(() => {
    const hex = dom.root.querySelector(`[data-tile="${tile}"]`)!;
    for (const type of ["pointerdown", "pointerup"]) hex.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerId: 1 }));
  });
}

function placement() {
  return dom.root.querySelector<HTMLButtonElement>(".land-actions button.primary")!;
}

function tapPlacement() {
  act(() => placement().click());
}

for (const { name, tile, claims, otherTile } of [
  { name: "Claim", tile: 0, claims: 1, otherTile: 2 },
  { name: "Steal", tile: 1, claims: 2, otherTile: 0 },
]) {
  test(`Land Grab ignores ${name} during the after-answer wait, without spending claims or clearing the selected tile`, () => {
    const { show, send } = phone();
    show({ ...claimView, claims });
    expect(dom.root.textContent).toContain("Claim or Steal available in 1s");
    expect(dom.root.querySelector(".land-claim svg [data-tile]")).not.toBeNull();
    expect(dom.root.querySelector(".answering")).toBeNull();
    expect(dom.root.querySelector(".flash")).toBeNull();
    tapTile(otherTile);
    const firstSelection = dom.root.querySelector(".hex-selected")!.outerHTML;
    tapTile(tile);
    const selection = dom.root.querySelector(".hex-selected")!.outerHTML;
    expect(selection).not.toBe(firstSelection);
    expect(placement().textContent).toContain(name);

    dom.advance(999);
    const map = dom.root.querySelector(".land-area")!.innerHTML;
    expect(placement().getAttribute("aria-disabled")).toBe("true");
    tapPlacement();
    expect(send).not.toHaveBeenCalled();
    expect(dom.vibrate).not.toHaveBeenCalled();
    expect(dom.root.querySelector(".land-area")!.innerHTML).toBe(map);
    expect(dom.root.querySelector(".hex-selected")!.outerHTML).toBe(selection);

    dom.advance(1);
    expect(placement().disabled).toBe(false);
    expect(placement().hasAttribute("aria-disabled")).toBe(false);
    expect(dom.root.textContent).not.toContain("available in");
    expect(send).not.toHaveBeenCalled();
    expect(dom.vibrate).not.toHaveBeenCalled();
    tapPlacement();
    expect(send.mock.calls).toEqual([[{ type: "land.place", tile }]]);
    expect(dom.vibrate.mock.calls).toEqual([[25]]);
    expect(dom.root.querySelector(".hex-selected")).toBeNull();
    show({ ...questionView, claims: 0 });
    expect(dom.root.textContent).toContain("Tile placed!");
    expect(dom.root.querySelector(`[data-tile="${tile}"].owned`)?.getAttribute("data-tile")).toBe(String(tile));
    dom.advance(900);
    expect(dom.root.textContent).toContain("Next question");
  });
}

test("Land Grab accepts a fresh Claim at the end of the after-answer wait even before the countdown redraws", () => {
  const { show, send } = phone();
  show({ ...claimView, claims: 1 });
  tapTile(0);
  dom.advance(999);
  tapPlacement();
  expect(send).not.toHaveBeenCalled();
  expect(dom.vibrate).not.toHaveBeenCalled();

  dom.elapseWithoutTimers(1);
  expect(dom.root.textContent).toContain("Claim or Steal available in 1s");
  tapPlacement();
  expect(send.mock.calls).toEqual([[{ type: "land.place", tile: 0 }]]);
  dom.advance(1);
  expect(send).toHaveBeenCalledTimes(1);
});

test("Land Grab can bank claims with Done during the after-answer wait without holding the land on screen", () => {
  const { show, send } = phone();
  show({ ...claimView, claims: 1 });
  tapTile(0);
  dom.advance(999);
  tapPlacement();
  const done = dom.root.querySelector<HTMLButtonElement>(".land-actions button.ghost")!;
  expect(done.textContent).toBe("Done (keep 1)");
  expect(done.disabled).toBe(false);
  act(() => done.click());
  expect(send.mock.calls).toEqual([[{ type: "land.done" }]]);
  show({ ...questionView, claims: 1 });
  expect(dom.root.querySelector(".land-claim")).toBeNull();
  expect(dom.root.textContent).toContain("Next question");
  dom.advance(1);
  expect(send).toHaveBeenCalledTimes(1);
  expect(dom.vibrate).not.toHaveBeenCalled();
});

test("Land Grab keeps unaffordable or illegal placements unavailable after the after-answer wait", () => {
  const { show, send } = phone();
  show({ ...claimView, claims: 1 });
  dom.advance(1000);
  tapTile(1);
  expect(dom.root.textContent).toContain("Stealing a tile takes 2 tiles; you have 1");
  expect(placement().disabled).toBe(true);
  tapPlacement();
  tapTile(47);
  expect(dom.root.textContent).toContain("Too close to another team's starting point");
  expect(placement().disabled).toBe(true);
  tapPlacement();
  expect(send).not.toHaveBeenCalled();
  tapTile(0);
  expect(placement().disabled).toBe(false);
});

test("Land Grab shows the land and after-answer wait instead of lingering answer feedback", () => {
  const { show } = phone();
  show({ ...questionView, feedback: { seq: 3, correct: true, remainingMs: 1000, answers: [], penaltyMs: 0 } });
  expect(dom.root.querySelector('.flash[role="status"]')).not.toBeNull();
  show(claimView);
  expect(dom.root.querySelector(".land-claim")).not.toBeNull();
  expect(dom.root.querySelector(".answering")).toBeNull();
  expect(dom.root.querySelector('.flash[role="status"]')?.textContent).toBeUndefined();
});
