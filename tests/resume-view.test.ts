import { expect, test } from "bun:test";
import { initialPhoneScreen, PhoneSession } from "../src/client/player/session.ts";
import type { ClientMsg, PlayerView } from "../src/shared/protocol.ts";

const notJoined: PlayerView = { kind: "none", game: { title: "Sample", phase: "lobby" } };
const previous: Extract<PlayerView, { kind: "lobby" }> = {
  kind: "lobby",
  phase: "lobby",
  title: "Sample",
  mode: "classic",
  me: { id: "player-1", nickname: "Sam", avatar: { avatar: "snowman", accessory: "none" } },
  playerCount: 1,
  team: null,
};

function phone() {
  const sent: ClientMsg[] = [];
  const tokens: (string | null)[] = [];
  const images: string[][] = [];
  let screen = initialPhoneScreen;
  const session = new PhoneSession({
    send: (message) => sent.push(message),
    saveToken: (token) => tokens.push(token),
    preloadImages: (refs) => images.push(refs),
    show: (state) => {
      screen = state;
    },
  });
  return { session, sent, tokens, images, screen: () => screen };
}

test("a reconnecting phone retains its game while using the new socket's snapshot for patches", () => {
  const { session, sent, tokens, images, screen } = phone();
  session.receive({ type: "player.state", view: previous });

  session.open("resume-token");
  expect(sent).toEqual([{ type: "resume", token: "resume-token" }]);
  session.receive({ type: "player.patch", ops: [[["title"], "No baseline yet"]] });
  expect(screen().view).toBe(previous);
  session.receive({ type: "player.state", view: notJoined });
  expect(screen().view).toBe(previous);
  session.receive({ type: "joined", token: "resume-token", playerId: "player-1", images: ["media/map.png"] });
  expect(tokens).toEqual(["resume-token"]);
  expect(images).toEqual([["media/map.png"]]);
  expect(screen().view).toBe(previous);

  const resumed = { ...previous, playerCount: 2 };
  session.receive({ type: "player.state", view: resumed });
  expect(screen().view).toBe(resumed);

  session.receive({ type: "player.patch", ops: [[["playerCount"], 3]] });
  expect(screen().view).toEqual({ ...resumed, playerCount: 3 });

  session.receive({ type: "player.state", view: notJoined });
  expect(screen().view).toEqual(notJoined);
});

test("a reloaded phone waits for resume before showing the join screen", () => {
  const { session, tokens, screen } = phone();
  session.open("expired");
  session.receive({ type: "player.state", view: notJoined });
  expect(screen().view).toBeNull();

  session.receive({ type: "resumeFailed" });
  expect(tokens).toEqual([null]);
  expect(screen().view).toEqual(notJoined);
});

test("a kick ends resume and the phone can join again after dismissing it", () => {
  const { session, sent, tokens, screen } = phone();
  session.open("kicked");
  session.receive({ type: "player.state", view: notJoined });
  session.receive({ type: "kicked" });
  session.receive({ type: "player.patch", ops: [] });
  expect(tokens).toEqual([null]);
  expect(screen()).toMatchObject({ view: notJoined, kicked: true });
  session.dismissKick();

  session.join({ type: "join", nickname: "Sam" });
  expect(screen()).toMatchObject({ joining: true, kicked: false });
  expect(sent.at(-1)).toEqual({ type: "join", nickname: "Sam" });
  session.receive({ type: "error", message: "Try another name" });
  expect(screen()).toMatchObject({ joining: false, error: "Try another name" });
  session.dismissError();
  expect(screen().error).toBeNull();
});
