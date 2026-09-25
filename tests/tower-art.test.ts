import { expect, test } from "bun:test";
import { hash01, isLit, shade, skyStage, viewBaseRow } from "../src/client/shared/tower-art.tsx";

test("shade lightens, darkens and clamps", () => {
  expect(shade("#808080", 0)).toBe("#808080");
  expect(shade("#808080", -0.5)).toBe("#404040");
  expect(shade("#808080", 0.5)).toBe("#c0c0c0");
  expect(shade("#123456", -1)).toBe("#000000");
  expect(shade("#123456", 1)).toBe("#ffffff");
  expect(shade("not-a-color", 0.5)).toBe("not-a-color");
});

test("window lights are deterministic with a mix of lit and dark", () => {
  expect(isLit(1, 2, 3, 0)).toBe(isLit(1, 2, 3, 0));
  const all = [];
  for (let r = 0; r < 40; r++) for (let i = 0; i < 4; i++) all.push(isLit(0, 1, r, i));
  const lit = all.filter(Boolean).length / all.length;
  expect(lit).toBeGreaterThan(0.4);
  expect(lit).toBeLessThan(0.8);
  for (let i = 0; i < 100; i++) {
    const v = hash01(i, 5);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test("sky stage changes every 5 floors and tops out at night", () => {
  expect([0, 4, 5, 9, 10, 14, 15, 19, 20, 99].map(skyStage)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test("phone build view keeps a monster egg in frame", () => {
  const within = (base: number, rows: number, row: number) => row >= base && row < base + rows;
  // No egg: follow the top of the tower.
  expect(viewBaseRow(40, 7, null)).toBe(34);
  expect(viewBaseRow(3, 7, null)).toBe(0);
  // Egg far below a tall teammate column: scroll down to the egg.
  expect(within(viewBaseRow(40, 7, 26), 7, 26)).toBe(true);
  // Egg above the tower: scroll up so it and a row of headroom show.
  expect(within(viewBaseRow(10, 7, 14), 7, 14)).toBe(true);
  // Egg already in view: same as following the top.
  expect(viewBaseRow(12, 7, 10)).toBe(6);
});
