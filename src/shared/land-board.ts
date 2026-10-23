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

/** How far from a start the guarded ring is: just outside the protected tiles, where the smallest surrounding ring goes. */
export const GUARD_DISTANCE = 2;

/** In the ring GUARD_DISTANCE steps from the starting point of a team other than `team` that is still in the game. */
export function isGuarded(size: number, starts: LandStart[], team: number, tile: number): boolean {
  return starts.some((s) => !s.out && s.team !== team && hexDistance(size, s.tile, tile) === GUARD_DISTANCE);
}

/**
 * Claims needed for `team` to take a tile: 1 for grass, `stealCost` for enemy land, null if it can't be taken.
 * A guarded tile costs at least `guardCost`, whoever holds it.
 */
export function placementCost(owners: number[], size: number, starts: LandStart[], team: number, tile: number, stealCost: number, guardCost: number): number | null {
  if (!Number.isInteger(tile) || tile < 0 || tile >= owners.length) return null;
  const owner = owners[tile]!;
  if (owner === team || isProtected(size, starts, team, tile)) return null;
  const cost = owner === EMPTY ? 1 : stealCost;
  return isGuarded(size, starts, team, tile) ? Math.max(cost, guardCost) : cost;
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

/** With this many claims (or more) still needed to ring a starting point, nothing is brewing yet. */
const THREAT_CALM_CLAIMS = 12;
/** With this many claims (or fewer) still needed, the ring is as good as closed. */
const THREAT_CLOSE_CLAIMS = 2;
/** Threat when one more tile would capture an area: a base, plus a bit per tile captured, up to a cap. */
const THREAT_CAPTURE_BASE = 0.35;
const THREAT_CAPTURE_PER_TILE = 0.05;
const THREAT_CAPTURE_MAX = 0.75;

/**
 * The fewest claims `team` still needs to wall `target` off from the board edge, counted up to `limit`.
 * A minimum cut: the team's own tiles are walls already, tiles it can't take can't be cut,
 * and every other tile costs what it costs to claim.
 */
function claimsToEnclose(owners: number[], size: number, starts: LandStart[], team: number, target: number, stealCost: number, guardCost: number, limit: number): number {
  // Each tile is two nodes (in = 2t, out = 2t + 1) joined by an edge of its cost; the sink is past the board edge.
  const n = owners.length;
  const sink = 2 * n;
  const head = Array<number>(2 * n + 1).fill(-1);
  const next: number[] = [];
  const to: number[] = [];
  const cap: number[] = [];
  const link = (a: number, b: number, c: number) => {
    to.push(b, a);
    cap.push(c, 0);
    next.push(head[a]!, head[b]!);
    head[a] = to.length - 2;
    head[b] = to.length - 1;
  };
  for (let t = 0; t < n; t++) {
    if (owners[t] === team) continue;
    link(2 * t, 2 * t + 1, t === target ? Infinity : (placementCost(owners, size, starts, team, t, stealCost, guardCost) ?? Infinity));
    for (const nb of neighbors(size, t)) if (owners[nb] !== team) link(2 * t + 1, 2 * nb, Infinity);
    const row = Math.floor(t / size);
    const col = t % size;
    if (row === 0 || col === 0 || row === size - 1 || col === size - 1) link(2 * t + 1, sink, Infinity);
  }
  let flow = 0;
  while (flow < limit) {
    // Shortest augmenting path from the target to the edge.
    const via = Array<number>(2 * n + 1).fill(-1);
    const queue = [2 * target];
    const seen = new Uint8Array(2 * n + 1);
    seen[2 * target] = 1;
    for (let h = 0; h < queue.length && !seen[sink]; h++) {
      for (let e = head[queue[h]!]!; e !== -1; e = next[e]!) {
        if (cap[e]! <= 0 || seen[to[e]!]) continue;
        seen[to[e]!] = 1;
        via[to[e]!] = e;
        queue.push(to[e]!);
      }
    }
    if (!seen[sink]) break;
    let push = Infinity;
    for (let v = sink; v !== 2 * target; v = to[via[v]! ^ 1]!) push = Math.min(push, cap[via[v]!]!);
    if (push === Infinity) return limit;
    for (let v = sink; v !== 2 * target; v = to[via[v]! ^ 1]!) {
      cap[via[v]!]! -= push;
      cap[via[v]! ^ 1]! += push;
    }
    flow += push;
  }
  return Math.min(flow, limit);
}

/**
 * How close any team is to closing a ring, 0 (nothing brewing) … 1 (about to happen). The larger of:
 * how few claims a team still needs to surround an opposing starting point, and how much land
 * a team would capture by placing just one more tile.
 */
export function captureThreat(owners: number[], size: number, starts: LandStart[], stealCost: number, guardCost: number): number {
  const alive = starts.filter((s) => !s.out);
  const trial = [...owners];
  let threat = 0;
  for (const { team } of alive) {
    for (const s of alive) {
      if (s.team === team || owners[s.tile] === team) continue;
      const claims = claimsToEnclose(owners, size, starts, team, s.tile, stealCost, guardCost, THREAT_CALM_CLAIMS);
      threat = Math.max(threat, (THREAT_CALM_CLAIMS - claims) / (THREAT_CALM_CLAIMS - THREAT_CLOSE_CLAIMS));
    }
    let captured = 0;
    for (let t = 0; t < owners.length; t++) {
      if (placementCost(owners, size, starts, team, t, stealCost, guardCost) === null) continue;
      trial[t] = team;
      captured = Math.max(captured, enclosedBy(trial, size, team).length);
      trial[t] = owners[t]!;
    }
    if (captured > 0) threat = Math.max(threat, Math.min(THREAT_CAPTURE_MAX, THREAT_CAPTURE_BASE + captured * THREAT_CAPTURE_PER_TILE));
  }
  return Math.max(0, Math.min(1, threat));
}

/**
 * The neighbour across side `side` of a tile, or null past the board edge. Sides run clockwise
 * from the top-right one: 0 NE, 1 E, 2 SE, 3 SW, 4 W, 5 NW; side k joins corners k and k + 1
 * when the corners are numbered clockwise from the top.
 */
export function neighborAcross(size: number, tile: number, side: number): number | null {
  const row = Math.floor(tile / size);
  const col = tile % size;
  const shift = row & 1;
  const [r, c] = [
    [row - 1, col + shift],
    [row, col + 1],
    [row + 1, col + shift],
    [row + 1, col - 1 + shift],
    [row, col - 1],
    [row - 1, col - 1 + shift],
  ][side]!;
  return r! >= 0 && r! < size && c! >= 0 && c! < size ? r! * size + c! : null;
}

/** A side of an owned tile where the land changes hands: next to grass or to another team's tile. */
export interface BorderEdge {
  tile: number;
  side: number;
  owner: number;
  /** The neighbour is another team's tile, not grass. */
  rival: boolean;
}

/** Every side where an owned tile meets a tile with a different owner. The board edge is never a border. */
export function borderEdges(owners: number[], size: number): BorderEdge[] {
  const edges: BorderEdge[] = [];
  for (let tile = 0; tile < owners.length; tile++) {
    const owner = owners[tile]!;
    if (owner === EMPTY) continue;
    for (let side = 0; side < 6; side++) {
      const n = neighborAcross(size, tile, side);
      if (n === null || owners[n] === owner) continue;
      edges.push({ tile, side, owner, rival: owners[n] !== EMPTY });
    }
  }
  return edges;
}
