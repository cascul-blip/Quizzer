import { describe, expect, test } from "bun:test";
import { modeOfMsg } from "../src/server/game/mode-entry.ts";
import { keysOf } from "../src/shared/keys-of.ts";
import { SHARED_MODES } from "../src/shared/mode-entries.ts";

describe("Shared mode entries", () => {
  test("no two modes list the same phone message type", () => {
    const listed = keysOf(SHARED_MODES).flatMap((mode) => SHARED_MODES[mode].msgTypes.map((type) => `${type} (${mode})`));
    const types = listed.map((entry) => entry.split(" ")[0]);
    expect(listed.filter((_, i) => types.indexOf(types[i]) !== i)).toEqual([]);
  });

  test("routes each phone message to the mode that lists it", () => {
    expect(modeOfMsg("answer")).toBe("classic");
    expect(modeOfMsg("setAvatar")).toBe("classic");
    expect(modeOfMsg("tower.drop")).toBe("tower");
    expect(modeOfMsg("sub.tap")).toBe("submarine");
    expect(modeOfMsg("racer.lever")).toBe("racer");
    expect(modeOfMsg("siege.map")).toBe("siege");
    expect(modeOfMsg("duel.answer")).toBe("duel");
  });

  test("join, resume and unknown types belong to no mode", () => {
    expect(modeOfMsg("join")).toBeUndefined();
    expect(modeOfMsg("resume")).toBeUndefined();
    expect(modeOfMsg("nope")).toBeUndefined();
    expect(modeOfMsg("toString")).toBeUndefined();
  });
});
