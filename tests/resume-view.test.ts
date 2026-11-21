import { expect, test } from "bun:test";
import { initialPhoneScreen, PhoneSession } from "../src/client/player/session.ts";
import { Game } from "../src/server/game/game.ts";
import type { ClientMsg, PlayerView } from "../src/shared/protocol.ts";
import { diffView } from "../src/shared/view-patch.ts";
import { sampleQuiz } from "./helpers.ts";

const quiz = sampleQuiz();
const notJoined: PlayerView = { kind: "none", game: { title: quiz.title, phase: "lobby" } };

function phone() {
  const sent: ClientMsg[] = [];
  const tokens: (string | null)[] = [];
  const images: string[][] = [];
  let screen = initialPhoneScreen;
  const session = new PhoneSession({
    send: (message) => sent.push(message),
    saveToken: (token) => tokens.push(token),
    preloadImages: (refs) => images.push(refs),
    show: (state) => { screen = state; },
  });
  return { session, sent, tokens, images, screen: () => screen };
}

test("a reconnecting phone retains its game while using the new socket's snapshot for patches", () => {
  const game = new Game(quiz);
  const player = game.join("Sam");
  const previous = game.playerView(player.id);
  const { session, sent, tokens, images, screen } = phone();
  session.receive({ type: "player.state", view: previous });

  session.open(player.token);
  expect(sent).toEqual([{ type: "resume", token: player.token }]);
  session.receive({ type: "player.patch", ops: [[["title"], "No baseline yet"]] });
  expect(screen().view).toBe(previous);
  session.receive({ type: "player.state", view: notJoined });
  expect(screen().view).toBe(previous);
  session.receive({ type: "joined", token: player.token, playerId: player.id, images: ["media/map.png"] });
  expect(tokens).toEqual([player.token]);
  expect(images).toEqual([["media/map.png"]]);
  expect(screen().view).toBe(previous);

  game.join("Lee");
  const resumed = game.playerView(player.id);
  session.receive({ type: "player.patch", ops: diffView(notJoined, resumed) });
  expect(screen().view).toEqual(resumed);

  session.receive({ type: "player.patch", ops: diffView(resumed, notJoined) });
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
