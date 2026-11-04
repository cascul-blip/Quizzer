import { describe, expect, test } from "bun:test";
import type { AccessoryId, AvatarId } from "../src/shared/avatars.ts";
import { ACCESSORY_ART, AVATAR_ART } from "../src/client/shared/avatar-art.tsx";
import { Game, GameError } from "../src/server/game/game.ts";
import { SubGame } from "../src/server/game/submarine.ts";
import { TowerGame } from "../src/server/game/tower.ts";
import { ACCESSORIES, AVATARS, cleanAvatar, OFFERED_ACCESSORIES, OFFERED_AVATARS, randomAvatar } from "../src/shared/avatars.ts";

// Ids from whichever set is offered, so these tests pass with either AVATAR_SET.
const [A1, A2, A3] = OFFERED_AVATARS.map((a) => a.id) as [AvatarId, AvatarId, AvatarId];
const [, X1, X2, X3] = OFFERED_ACCESSORIES.map((a) => a.id) as [AccessoryId, AccessoryId, AccessoryId, AccessoryId];
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

  test("only one set is offered, and every set has plenty", () => {
    expect(OFFERED_AVATARS.length).toBeGreaterThanOrEqual(12);
    expect(OFFERED_ACCESSORIES.length).toBeGreaterThanOrEqual(12);
    expect(OFFERED_AVATARS.length).toBeLessThan(AVATARS.length);
    expect(OFFERED_ACCESSORIES.length).toBeLessThan(ACCESSORIES.length);
    expect(OFFERED_ACCESSORIES[0]!.id).toBe("none");
  });

  test("cleanAvatar only accepts offered ids", () => {
    for (const a of OFFERED_AVATARS) for (const x of OFFERED_ACCESSORIES) expect(cleanAvatar(a.id, x.id)).toEqual({ avatar: a.id, accessory: x.id });
    const hidden = AVATARS.find((a) => !OFFERED_AVATARS.some((o) => o.id === a.id))!;
    expect(cleanAvatar(hidden.id, "none")).toBeNull();
    expect(cleanAvatar(A1, "jetpack")).toBeNull();
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
    expect(a.avatar).toEqual({ avatar: OFFERED_AVATARS[0]!.id, accessory: "none" });
    const b = game.join("B", { avatar: A1, accessory: X1 });
    expect(b.avatar).toEqual({ avatar: A1, accessory: X1 });
  });

  test("players can change their look until the game starts", () => {
    let changes = 0;
    const game = new Game(sampleQuiz(), { clock: new FakeClock(), onChange: () => changes++ });
    const p = game.join("A");
    const before = changes;
    game.setAvatar(p.id, A2, X2);
    expect(changes).toBe(before + 1);
    expect(game.hostView().players[0]!.avatar).toEqual({ avatar: A2, accessory: X2 });
    const view = game.playerView(p.id);
    expect(view.kind === "player" && view.me.avatar).toEqual({ avatar: A2, accessory: X2 });

    expect(() => game.setAvatar(p.id, A2, "jetpack")).toThrow(GameError);
    expect(p.avatar.accessory).toBe(X2);

    game.start();
    expect(() => game.setAvatar(p.id, A1, "none")).toThrow(/already started/);
  });

  test("the avatar carries over into Tallest Tower and Submarine Squad", () => {
    for (const make of [(g: Game) => TowerGame.fromLobby(g, { clock: new FakeClock() }), (g: Game) => SubGame.fromLobby(g, { clock: new FakeClock() })]) {
      const lobby = new Game(sampleQuiz(), { clock: new FakeClock() });
      const p = lobby.join("A");
      lobby.setAvatar(p.id, A3, X3);
      const game = make(lobby);
      expect(game.players.get(p.id)!.avatar).toEqual({ avatar: A3, accessory: X3 });
      const view = game.playerView(p.id);
      expect(view && "me" in view && view.me.avatar).toEqual({ avatar: A3, accessory: X3 });
      lobby.dispose();
      game.dispose();
    }
  });
});
