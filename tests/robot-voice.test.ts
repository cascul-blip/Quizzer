import { expect, test } from "bun:test";
import { attackVoiceLine, attackerVoiceLines, warningVoiceLine } from "../src/client/shared/robot-voice.ts";
import type { RobotAttack } from "../src/shared/protocol.ts";

const attack = (hit: string[], eliminated: string[]): RobotAttack => ({ seq: 1, round: 1, hit, eliminated });

test("snowman taunts surviving hits once per attack", () => {
  expect(attackVoiceLine(attack(["a"], []), "snowman")).toBe("coldispatient");
  expect(attackVoiceLine(attack(["a", "b"], []), "snowman")).toBe("coldispatient");
});

test("eliminations retain priority, including mixed surviving and eliminated hits", () => {
  expect(attackVoiceLine(attack(["a"], ["a"]), "snowman")).toBe("thawout");
  expect(attackVoiceLine(attack(["a", "b"], ["b"]), "snowman")).toBe("thawout");
});

test("dodges, missing attacks, and original robot dialogue stay unchanged", () => {
  for (const skin of ["robot", "snowman"] as const) {
    expect(attackVoiceLine(null, skin)).toBeNull();
    expect(attackVoiceLine(attack([], []), skin)).toBe(skin === "snowman" ? "frostyaim" : "cannot-evade");
  }
  expect(attackVoiceLine(attack(["a"], []), "robot")).toBe("flesh-is-weak");
});

test("warning and preloads follow the skin, excluding the retired trial line", () => {
  expect(warningVoiceLine("snowman")).toBe("lookwarm");
  expect(warningVoiceLine("robot")).toBe("targets-acquired");
  expect(attackerVoiceLines("snowman")).toEqual(["lookwarm", "frostyaim", "coldispatient", "thawout"]);
  expect(attackerVoiceLines("robot")).toEqual(["targets-acquired", "cannot-evade", "flesh-is-weak", "only-metal-endures"]);
  expect(attackVoiceLine(attack(["a"], ["a"]), "robot")).toBe("only-metal-endures");
});
