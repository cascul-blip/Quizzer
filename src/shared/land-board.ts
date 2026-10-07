// Land Grab's hexagonal board: geometry and the rules that only depend on it.
// Tiles are pointy-top hexes in offset rows (odd rows sit half a tile to the right);
// tile index = row * size + col. owners[tile] is a team index, or EMPTY.

export const EMPTY = -1;

/** A start is this many tiles in from the nearest edge at least, so a ring fits around its protected tiles. */
export const START_MARGIN = 2;

export interface LandStart {
  team: number;
  tile: number;
  /** The team was surrounded: its start is ordinary land now. */
  out: boolean;
}

/** Board side length for a team count: 2 → 10, 3–4 → 12, 5–6 → 14. */
export function landBoardSize(teams: number): number {
  return teams <= 2 ? 10 : teams <= 4 ? 12 : 14;
}

const SQRT3 = Math.sqrt(3);

/** Centre of a tile, in units of the hex's corner radius (tiles are √3 wide and 2 tall, rows 1.5 apart). */
export function hexCenter(size: number, tile: number): { x: number; y: number } {
  const row = Math.floor(tile / size);
  const col = tile % size;
  return { x: SQRT3 * (col + 0.5 + (row & 1) * 0.5), y: 1.5 * row + 1 };
}

/** Width and height of the whole board in the same units as hexCenter. */
export function boardExtent(size: number): { width: number; height: number } {
  return { width: SQRT3 * (size + 0.5), height: 1.5 * size + 0.5 };
}

export function neighbors(size: number, tile: number): number[] {
  const row = Math.floor(tile / size);
  const col = tile % size;
  const shift = row & 1;
  const cells: [number, number][] = [
    [row, col - 1],
    [row, col + 1],
    [row - 1, col - 1 + shift],
    [row - 1, col + shift],
    [row + 1, col - 1 + shift],
    [row + 1, col + shift],
  ];
  return cells.filter(([r, c]) => r >= 0 && r < size && c >= 0 && c < size).map(([r, c]) => r * size + c);
}

/** Steps between two tiles. */
export function hexDistance(size: number, a: number, b: number): number {
  const axial = (t: number) => {
    const row = Math.floor(t / size);
    return { q: (t % size) - (row - (row & 1)) / 2, r: row };
  };
  const p = axial(a);
  const q = axial(b);
  const dq = p.q - q.q;
  const dr = p.r - q.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Ring radius (in tiles) and first angle per team count; the starts sit evenly around the centre tile. */
const START_RINGS: Record<number, { radius: number; angle: number }> = {
  3: { radius: 3, angle: 0 },
  4: { radius: 3.5, angle: 45 },
  5: { radius: 3.5, angle: -90 },
  6: { radius: 4, angle: 0 },
};

/**
 * Each team's starting tile. 2, 3 and 6 teams are exactly the same distance apart;
 * with 4 or 5 a hex grid can't do that, so they are the nearest tiles to an even ring.
 */
export function startTiles(teams: number): number[] {
  const size = landBoardSize(teams);
  if (teams <= 2) {
    const row = size / 2 - 1;
    return [row * size + START_MARGIN, row * size + size - 1 - START_MARGIN].slice(0, Math.max(1, teams));
  }
  const ring = START_RINGS[Math.min(6, teams)]!;
  const centre = hexCenter(size, (size / 2) * size + size / 2);
  return Array.from({ length: teams }, (_, i) => {
    const a = ((ring.angle + (360 / teams) * i) * Math.PI) / 180;
    return nearestTile(size, centre.x + ring.radius * SQRT3 * Math.cos(a), centre.y + ring.radius * SQRT3 * Math.sin(a));
  });
}

function nearestTile(size: number, x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let t = 0; t < size * size; t++) {
    const c = hexCenter(size, t);
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestD - 1e-9) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/** On or next to the starting point of a team other than `team` that is still in the game. */
export function isProtected(size: number, starts: LandStart[], team: number, tile: number): boolean {
  return starts.some((s) => !s.out && s.team !== team && (s.tile === tile || neighbors(size, s.tile).includes(tile)));
}

/** Claims needed for `team` to take a tile: 1 for grass, `stealCost` for enemy land, null if it can't be taken. */
export function placementCost(owners: number[], size: number, starts: LandStart[], team: number, tile: number, stealCost: number): number | null {
  if (!Number.isInteger(tile) || tile < 0 || tile >= owners.length) return null;
  const owner = owners[tile]!;
  if (owner === team || isProtected(size, starts, team, tile)) return null;
  return owner === EMPTY ? 1 : stealCost;
}

/**
 * Tiles walled in by `team`: everything that isn't the team's and can't reach the
 * board edge without crossing the team's land. The edge itself is never part of a wall.
 */
export function enclosedBy(owners: number[], size: number, team: number): number[] {
  const open = new Uint8Array(owners.length);
  const queue: number[] = [];
  const visit = (t: number) => {
    if (open[t] || owners[t] === team) return;
    open[t] = 1;
    queue.push(t);
  };
  for (let i = 0; i < size; i++) {
    visit(i);
    visit((size - 1) * size + i);
    visit(i * size);
    visit(i * size + size - 1);
  }
  for (let head = 0; head < queue.length; head++) for (const n of neighbors(size, queue[head]!)) visit(n);
  const enclosed: number[] = [];
  for (let t = 0; t < owners.length; t++) if (!open[t] && owners[t] !== team) enclosed.push(t);
  return enclosed;
}
