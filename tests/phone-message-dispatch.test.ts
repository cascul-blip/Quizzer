import { describe, expect, test } from "bun:test";
import { Lobby } from "../src/server/game/lobby.ts";
import { dispatchPhoneMessage } from "../src/server/game/phone-message-dispatch.ts";
import { TowerGame } from "../src/server/game/tower.ts";
import { OFFERED_ACCESSORIES, OFFERED_AVATARS } from "../src/shared/avatars.ts";
import { classicGame, FakeClock, sampleQuiz } from "./helpers.ts";

const drop = { type: "tower.drop", zone: 2 } as const;
const look = { avatar: OFFERED_AVATARS[0]!.id, accessory: OFFERED_ACCESSORIES[1]!.id };
const setAvatar = { type: "setAvatar", ...look } as const;

describe("Phone message dispatch", () => {
  test("rejects a message with no owning game mode before checking attachment", () => {
    expect(() => dispatchPhoneMessage(null, null, { type: "host.hello" })).toThrow("Unknown message host.hello");
  });

  test("ignores a mode message when there is no game", () => {
    expect(dispatchPhoneMessage(null, "player", setAvatar)).toBeUndefined();
  });

  test("ignores a current-mode message from an unattached phone", () => {
    const lobby = new Lobby(sampleQuiz(), { mode: "tower" });
    lobby.join("Noel");
    const game = TowerGame.fromLobby(lobby.handoffFacts("tower"), { clock: new FakeClock() });
    game.start();
    expect(dispatchPhoneMessage(game, null, drop)).toBeUndefined();
  });

  test("updates the player's avatar in the lobby and ignores other mode messages", () => {
    const lobby = new Lobby(sampleQuiz(), { mode: "tower" });
    const player = lobby.join("Noel", { avatar: OFFERED_AVATARS[1]!.id, accessory: look.accessory });
    expect(dispatchPhoneMessage(lobby, player.id, drop)).toBeUndefined();
    expect(dispatchPhoneMessage(lobby, player.id, setAvatar)).toBeUndefined();
    expect(lobby.players.get(player.id)?.avatar).toEqual(look);
  });

  test("ignores another mode's message and forwards Classic's post-Start avatar error", () => {
    const game = classicGame(sampleQuiz(), { clock: new FakeClock() });
    const player = game.join("Noel");
    game.start();
    expect(dispatchPhoneMessage(game, player.id, drop)).toBeUndefined();
    expect(() => dispatchPhoneMessage(game, player.id, setAvatar)).toThrow("The game has already started");
  });

  test("returns the current mode handler's resend request", () => {
    const lobby = new Lobby(sampleQuiz(), { mode: "tower" });
    const player = lobby.join("Noel");
    const game = TowerGame.fromLobby(lobby.handoffFacts("tower"), { clock: new FakeClock() });
    game.start();
    expect(dispatchPhoneMessage(game, player.id, drop)).toBe("resend");
    expect(dispatchPhoneMessage(game, player.id, setAvatar)).toBeUndefined();
  });
});
