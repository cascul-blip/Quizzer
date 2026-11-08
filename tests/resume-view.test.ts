import { expect, test } from "bun:test";
import { shownView } from "../src/client/player/resume.ts";
import type { PlayerView } from "../src/shared/protocol.ts";

const notJoined = { kind: "none", game: { title: "Quiz", phase: "open" } } as PlayerView;
const playing = { kind: "player", phase: "open" } as PlayerView;

test("a reconnecting phone keeps its game on screen until the resume is answered", () => {
  // Mid-game reconnect: the first snapshot is "not joined", but the game stays up.
  expect(shownView(notJoined, true, playing)).toBe(playing);
  // Page reload with a token: nothing to show yet, so a spinner rather than the join form.
  expect(shownView(notJoined, true, null)).toBeNull();
  // Resume answered.
  expect(shownView(playing, false, playing)).toBe(playing);
  // Resume failed (or no token): the join form shows as before.
  expect(shownView(notJoined, false, playing)).toBe(notJoined);
});
