import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { render } from "preact";
import { act } from "preact/test-utils";
import { LobbyScreen } from "../src/client/player/lobby.tsx";
import type { PlayerLobbyView } from "../src/shared/protocol.ts";

const window = new Window();
let root: HTMLDivElement;
const globals = ["window", "document", "navigator"] as const;
const previous = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));

beforeAll(() => {
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, value: window[key] });
});
afterEach(() => {
  act(() => render(null, root));
  root.remove();
});
afterAll(() => {
  globals.forEach((key, i) => {
    const descriptor = previous[i];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  });
  window.close();
});

function mount() {
  root = document.createElement("div");
  document.body.appendChild(root);
}

test("the phone lobby displays the selected mode’s banner", () => {
  mount();
  const view: PlayerLobbyView = {
    kind: "lobby",
    phase: "lobby",
    title: "Sample",
    mode: "siege",
    me: { id: "player-1", nickname: "Sam", avatar: { avatar: "snowman", accessory: "none" } },
    playerCount: 1,
    team: null,
  };
  const onAvatarPick = () => {};
  act(() => render(<LobbyScreen view={view} onAvatarPick={onAvatarPick} />, root));
  expect(root.textContent).toContain("Defend the kingdom!");
  expect(root.querySelector(".me-avatar")?.classList.contains("siege-banner-avatar")).toBe(true);
  expect(root.querySelector(".bar .name")?.textContent).toBe("Sam");
  expect(root.querySelector(".bar .score")).toBeNull();

  act(() => render(<LobbyScreen view={{ ...view, mode: "classic" }} onAvatarPick={onAvatarPick} />, root));
  expect(root.textContent).not.toContain("Defend the kingdom!");
  expect(root.querySelector(".me-avatar")?.classList.contains("siege-banner-avatar")).toBe(false);
});
