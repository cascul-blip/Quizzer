import { describe, expect, test } from "bun:test";
import { ACCESSORY_ART, AVATAR_ART } from "../src/client/shared/avatar-art.tsx";
import { Game, GameError } from "../src/server/game/game.ts";
import { SubGame } from "../src/server/game/submarine.ts";
import { TowerGame } from "../src/server/game/tower.ts";
import { ACCESSORIES, AVATARS, cleanAvatar, randomAvatar } from "../src/shared/avatars.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

describe("catalog", () => {
  test("a wide choice of unique ids, each with art", () => {
    expect(AVATARS.length).toBeGreaterThanOrEqual(24);
    expect(ACCESSORIES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(AVATARS.length);
    expect(new Set(ACCESSORIES.map((a) => a.id)).size).toBe(ACCESSORIES.length);
    expect(Object.keys(AVATAR_ART).sort()).toEqual(AVATARS.map((a) => a.id).sort());
    expect(Object.keys(ACCESSORY_ART).sort()).toEqual(ACCESSORIES.map((a) => a.id).sort());
  });

  test("cleanAvatar only accepts known ids", () => {
    for (const a of AVATARS) for (const x of ACCESSORIES) expect(cleanAvatar(a.id, x.id)).toEqual({ avatar: a.id, accessory: x.id });
    expect(cleanAvatar("cat", "jetpack")).toBeNull();
    expect(cleanAvatar("dragonfly", "none")).toBeNull();
    expect(cleanAvatar(undefined, undefined)).toBeNull();
    expect(cleanAvatar(1, "none")).toBeNull();
  });

  test("randomAvatar is always valid", () => {
    for (const r of [0, 0.3, 0.5, 0.999999]) {
      const c = randomAvatar(() => r);
      expect(cleanAvatar(c.avatar, c.accessory)).toEqual(c);
    }
  });
});

describe("in the lobby", () => {
  test("joining assigns a random avatar, or keeps the one the phone remembered", () => {
    const game = new Game(sampleQuiz(), { clock: new FakeClock(), rng: () => 0 });
    const a = game.join("A");
    expect(a.avatar).toEqual({ avatar: AVATARS[0].id, accessory: "none" });
    const b = game.join("B", { avatar: "robot", accessory: "crown" });
    expect(b.avatar).toEqual({ avatar: "robot", accessory: "crown" });
  });

  test("players can change their look until the game starts", () => {
    let changes = 0;
    const game = new Game(sampleQuiz(), { clock: new FakeClock(), onChange: () => changes++ });
    const p = game.join("A");
    const before = changes;
    game.setAvatar(p.id, "owl", "sunglasses");
    expect(changes).toBe(before + 1);
    expect(game.hostView().players[0]!.avatar).toEqual({ avatar: "owl", accessory: "sunglasses" });
    const view = game.playerView(p.id);
    expect(view.kind === "player" && view.me.avatar).toEqual({ avatar: "owl", accessory: "sunglasses" });

    expect(() => game.setAvatar(p.id, "owl", "jetpack")).toThrow(GameError);
    expect(p.avatar.accessory).toBe("sunglasses");

    game.start();
    expect(() => game.setAvatar(p.id, "cat", "none")).toThrow(/already started/);
  });

  test("the avatar carries over into Tallest Tower and Submarine Squad", () => {
    for (const make of [(g: Game) => TowerGame.fromLobby(g, { clock: new FakeClock() }), (g: Game) => SubGame.fromLobby(g, { clock: new FakeClock() })]) {
      const lobby = new Game(sampleQuiz(), { clock: new FakeClock() });
      const p = lobby.join("A");
      lobby.setAvatar(p.id, "unicorn", "wizard");
      const game = make(lobby);
      expect(game.players.get(p.id)!.avatar).toEqual({ avatar: "unicorn", accessory: "wizard" });
      const view = game.playerView(p.id);
      expect(view && "me" in view && view.me.avatar).toEqual({ avatar: "unicorn", accessory: "wizard" });
      lobby.dispose();
      game.dispose();
    }
  });
});
