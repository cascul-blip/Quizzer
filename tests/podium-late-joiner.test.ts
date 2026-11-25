import { describe, expect, test } from "bun:test";
import { keysOf } from "../src/shared/keys-of.ts";
import { SHARED_MODES } from "../src/shared/mode-entries.ts";
import { podiumHub } from "./podium-hub.ts";

const { running, finish } = podiumHub();

describe("Podium", () => {
  for (const mode of keysOf(SHARED_MODES).filter((m) => m !== "memory")) {
    test(`in ${SHARED_MODES[mode].name}, a player missing from the finished Podium still gets a phone view`, async () => {
      await finish(
        mode,
        () => {},
        (id) => {
          // A player added after the Podium was worked out, as a late joiner would be.
          const players = running().players as Map<string, { id: string; nickname: string }>;
          players.set("late", { ...players.get(id("Noel"))!, id: "late", nickname: "Late" });
        },
      );
      expect(() => running().playerView("late")).not.toThrow();
    });
  }
});
