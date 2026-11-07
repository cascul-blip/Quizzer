import { expect, test } from "bun:test";
import { SPACE_MPH, santaFlybyProgress, starTrailSeconds } from "../src/client/shared/racer-art.tsx";

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

test("Santa passes after takeoff and every 30 seconds, with quiet gaps between passes", () => {
  expect(santaFlybyProgress(0)).toBeNull();
  expect(santaFlybyProgress(2.99)).toBeNull();
  for (const start of [3, 33, 63]) {
    expect(santaFlybyProgress(start)).toBe(0);
    expect(santaFlybyProgress(start + 4)).toBe(0.5);
    expect(santaFlybyProgress(start + 7.99)).toBeLessThan(1);
    expect(santaFlybyProgress(start + 8)).toBeNull();
    expect(santaFlybyProgress(start + 29.99)).toBeNull();
  }
});
