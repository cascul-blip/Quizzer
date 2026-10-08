import { describe, expect, test } from "bun:test";
import { EMPTY, START_MARGIN, enclosedBy, hexDistance, isGuarded, isProtected, landBoardSize, neighbors, placementCost, startTiles, type LandStart } from "../src/shared/land-board.ts";

const at = (size: number, row: number, col: number) => row * size + col;
const board = (size: number) => Array<number>(size * size).fill(EMPTY);

describe("geometry", () => {
  test("board size follows the team count", () => {
    expect([2, 3, 4, 5, 6].map(landBoardSize)).toEqual([10, 12, 12, 14, 14]);
  });

  test("inner tiles have six neighbours, in the right places for even and odd rows", () => {
    expect(neighbors(10, at(10, 4, 4)).sort((a, b) => a - b)).toEqual([at(10, 3, 3), at(10, 3, 4), at(10, 4, 3), at(10, 4, 5), at(10, 5, 3), at(10, 5, 4)]);
    expect(neighbors(10, at(10, 5, 4)).sort((a, b) => a - b)).toEqual([at(10, 4, 4), at(10, 4, 5), at(10, 5, 3), at(10, 5, 5), at(10, 6, 4), at(10, 6, 5)]);
    expect(neighbors(10, 0).sort((a, b) => a - b)).toEqual([1, 10]);
  });

  test("neighbours are mutual and one step apart", () => {
    for (let t = 0; t < 144; t++) {
      for (const n of neighbors(12, t)) {
        expect(neighbors(12, n)).toContain(t);
        expect(hexDistance(12, t, n)).toBe(1);
      }
    }
  });
});

describe("starting points", () => {
  for (let teams = 2; teams <= 6; teams++) {
    test(`${teams} teams: evenly spread, clear of the edges and of each other`, () => {
      const size = landBoardSize(teams);
      const starts = startTiles(teams);
      expect(new Set(starts).size).toBe(teams);
      for (const t of starts) {
        const row = Math.floor(t / size);
        const col = t % size;
        for (const v of [row, col]) {
          expect(v).toBeGreaterThanOrEqual(START_MARGIN);
          expect(v).toBeLessThanOrEqual(size - 1 - START_MARGIN);
        }
      }
      const around = starts.map((t, i) => hexDistance(size, t, starts[(i + 1) % teams]!));
      // Protected zones (a start and its neighbours) never touch.
      expect(Math.min(...around)).toBeGreaterThanOrEqual(4);
      expect(Math.max(...around) - Math.min(...around)).toBeLessThanOrEqual([4, 5].includes(teams) ? 1 : 0);
    });
  }
});

describe("placing", () => {
  const size = 10;
  const [red, blue] = startTiles(2) as [number, number];
  const starts: LandStart[] = [
    { team: 0, tile: red, out: false },
    { team: 1, tile: blue, out: false },
  ];
  const owners = board(size);
  owners[red] = 0;
  owners[blue] = 1;
  owners[at(size, 0, 0)] = 1;

  test("grass costs 1, enemy land costs the steal price, own land can't be taken", () => {
    expect(placementCost(owners, size, starts, 0, at(size, 9, 9), 2, 2)).toBe(1);
    expect(placementCost(owners, size, starts, 0, at(size, 0, 0), 2, 2)).toBe(2);
    expect(placementCost(owners, size, starts, 1, at(size, 0, 0), 2, 2)).toBeNull();
    expect(placementCost(owners, size, starts, 0, 100, 2, 2)).toBeNull();
    expect(placementCost(owners, size, starts, 0, 1.5, 2, 2)).toBeNull();
  });

  test("an opposing start and the tiles next to it are off limits; your own aren't", () => {
    expect(placementCost(owners, size, starts, 0, blue, 2, 2)).toBeNull();
    for (const n of neighbors(size, blue)) {
      expect(isProtected(size, starts, 0, n)).toBe(true);
      expect(placementCost(owners, size, starts, 0, n, 2, 2)).toBeNull();
      expect(placementCost(owners, size, starts, 1, n, 2, 2)).toBe(1);
    }
  });

  test("the ring 2 steps from an opposing start costs the guard price, grass or stolen; your own ring doesn't", () => {
    const ring = owners.map((_, t) => t).filter((t) => hexDistance(size, blue, t) === 2);
    expect(ring).toHaveLength(12);
    for (const t of ring) {
      expect(isGuarded(size, starts, 0, t)).toBe(true);
      expect(isGuarded(size, starts, 1, t)).toBe(false);
      expect(placementCost(owners, size, starts, 0, t, 2, 2)).toBe(2);
      expect(placementCost(owners, size, starts, 1, t, 2, 2)).toBe(1);
    }
    // Blue holds a ring tile: stealing it is still 2, not 4. The guard price applies when it's the higher one.
    const held = [...owners];
    held[ring[0]!] = 1;
    expect(placementCost(held, size, starts, 0, ring[0]!, 2, 2)).toBe(2);
    expect(placementCost(held, size, starts, 0, ring[0]!, 2, 3)).toBe(3);
    expect(placementCost(held, size, starts, 0, ring[0]!, 3, 2)).toBe(3);
    // One step further out is ordinary grass.
    const beyond = owners.map((_, t) => t).filter((t) => hexDistance(size, blue, t) === 3 && hexDistance(size, red, t) > 2);
    for (const t of beyond) expect(placementCost(owners, size, starts, 0, t, 2, 2)).toBe(1);
  });

  test("a knocked-out team's start is ordinary land", () => {
    const after = starts.map((s) => (s.team === 1 ? { ...s, out: true } : s));
    const ringTile = owners.findIndex((_, t) => hexDistance(size, blue, t) === 2);
    expect(placementCost(owners, size, after, 0, ringTile, 2, 2)).toBe(1);
    expect(placementCost(owners, size, after, 0, neighbors(size, blue)[0]!, 2, 2)).toBe(1);
    expect(placementCost(owners, size, after, 0, blue, 2, 2)).toBe(2);
  });
});

describe("surrounding", () => {
  const size = 10;

  test("a full ring captures what is inside, enemy tiles included", () => {
    const owners = board(size);
    const mid = at(size, 5, 5);
    const ring = neighbors(size, mid);
    for (const t of ring.slice(1)) owners[t] = 0;
    expect(enclosedBy(owners, size, 0)).toEqual([]);
    owners[ring[0]!] = 0;
    expect(enclosedBy(owners, size, 0)).toEqual([mid]);
    owners[mid] = 1;
    expect(enclosedBy(owners, size, 0)).toEqual([mid]);
    expect(enclosedBy(owners, size, 1)).toEqual([]);
  });

  test("a bigger ring captures everything inside it", () => {
    const owners = board(size);
    const mid = at(size, 5, 5);
    for (let t = 0; t < owners.length; t++) if (hexDistance(size, mid, t) === 2) owners[t] = 0;
    expect(enclosedBy(owners, size, 0).sort((a, b) => a - b)).toEqual([mid, ...neighbors(size, mid)].sort((a, b) => a - b));
  });

  test("the board edge is not a wall", () => {
    const owners = board(size);
    for (const t of neighbors(size, 0)) owners[t] = 0;
    expect(enclosedBy(owners, size, 0)).toEqual([]);
    // Nor along a side: a wall from edge to edge cuts nothing off.
    for (let col = 0; col < size; col++) owners[at(size, 3, col)] = 0;
    expect(enclosedBy(owners, size, 0)).toEqual([]);
  });

  test("a ring that uses edge tiles still counts", () => {
    const owners = board(size);
    const inner = at(size, 1, 1);
    for (const t of neighbors(size, inner)) owners[t] = 0;
    expect(enclosedBy(owners, size, 0)).toEqual([inner]);
  });
});
