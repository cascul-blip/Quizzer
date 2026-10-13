import { expect, test } from "bun:test";
import { SPACE_MPH, starTrailSeconds } from "../src/client/shared/racer-art.tsx";

test("star trails last longer the faster the car goes, up to a cap", () => {
  const short = starTrailSeconds(SPACE_MPH);
  expect(short).toBeGreaterThan(0);
  expect(short).toBeLessThan(0.3);
  expect(starTrailSeconds(SPACE_MPH - 50)).toBe(short);
  expect(starTrailSeconds(240)).toBeGreaterThan(starTrailSeconds(220));
  expect(starTrailSeconds(300)).toBeGreaterThan(starTrailSeconds(240));
  expect(starTrailSeconds(400)).toBe(starTrailSeconds(1000));
  expect(starTrailSeconds(400)).toBeLessThanOrEqual(1);
});
