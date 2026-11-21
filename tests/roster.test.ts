import { describe, expect, test } from "bun:test";
import type { BasePlayer } from "../src/server/game/roster.ts";
import { Roster } from "../src/server/game/roster.ts";

const base = (id: string): BasePlayer => ({
  id,
  nickname: "N" + id,
  token: "t" + id,
  connected: true,
  avatar: { avatar: "a", accessory: "b" } as unknown as BasePlayer["avatar"],
});

describe("Roster", () => {
  test("adoptFrom copies only the base fields and keeps id and token", () => {
    const roster = new Roster<BasePlayer & { team: number }>();
    const lobbyPlayer = { ...base("a"), score: 99 };
    roster.adoptFrom([lobbyPlayer], (b) => ({ ...b, team: 2 }));
    const p = roster.byToken("ta");
    expect(p).toEqual({ ...base("a"), team: 2 });
    expect(p).not.toHaveProperty("score");
    expect(roster.players.get("a")).toBe(p!);
  });

  test("setConnected returns the player only when the flag changed", () => {
    const roster = new Roster<BasePlayer>();
    roster.adopt(base("a"));
    expect(roster.setConnected("a", true)).toBeNull();
    expect(roster.setConnected("zz", false)).toBeNull();
    expect(roster.setConnected("a", false)?.connected).toBe(false);
    expect(roster.setConnected("a", false)).toBeNull();
  });
});
