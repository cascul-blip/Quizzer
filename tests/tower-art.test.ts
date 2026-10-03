import { expect, test } from "bun:test";
import { blockTile, hash01, skyStage, viewBaseRow } from "../src/client/shared/tower-art.tsx";

test("block tiles are deterministic, with shops and a lobby at street level", () => {
  expect([0, 1, 2].map((c) => blockTile(0, c, 0))).toEqual(["shop", "lobby", "shop"]);
  expect(blockTile(1, 2, 3)).toBe(blockTile(1, 2, 3));
  const offices = new Set<unknown>();
  for (let r = 1; r < 40; r++) for (let c = 0; c < 3; c++) offices.add(blockTile(0, c, r));
  expect([...offices].sort()).toEqual([0, 1, 2, 3]);
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
