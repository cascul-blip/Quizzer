import { expect, test } from "bun:test";
import { catapultAngle } from "../src/client/shared/fight-skin.tsx";

test("the throwing arm snaps forward, settles, and does not replay expired shots", () => {
  expect(catapultAngle(-1)).toBe(24);
  expect(catapultAngle(0)).toBe(24);
  expect(catapultAngle(100)).toBeGreaterThan(120);
  expect(catapultAngle(130)).toBe(130);
  expect(catapultAngle(240)).toBe(118);
  expect(catapultAngle(500)).toBeLessThan(80);
  expect(catapultAngle(700)).toBe(24);
  expect(catapultAngle(5000)).toBe(24);
});
