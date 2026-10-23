import { EMPTY, borderEdges, boardExtent, hexCenter, isProtected, placementCost } from "../../shared/land-board.ts";
import { LAND_GUARD_COST, LAND_STEAL_COST, TEAMS, type LandBoard, type LandCapture, type LandPlace } from "../../shared/protocol.ts";
import claimedTile from "./land/claimed.webp";
import grass1Tile from "./land/grass-1.webp";
import grass2Tile from "./land/grass-2.webp";
import grass3Tile from "./land/grass-3.webp";
import { ShapePath } from "./team-shape.tsx";

// Land Grab's board, shared by the projector and the phones.

/** Corner radius of one hex in SVG units. */
const R = 10;
/** Tiles are drawn a little smaller than their cell, so the dark ground shows between them. */
const TILE_R = R * 0.95;
const hexPoints = (r: number) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (60 * k - 90);
    return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  }).join(" ");
const TILE = hexPoints(TILE_R);
/** Width of the border line where land changes hands. */
const BORDER_W = 1.5;
/** Corners of the hexagon the border lines run along: half a line inside the cell's edge, so two teams' lines sit side by side. */
const BORDER_CORNERS = Array.from({ length: 6 }, (_, k) => {
  const a = (Math.PI / 180) * (60 * k - 90);
  const r = R - BORDER_W / 2 / Math.cos(Math.PI / 6);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
});
const TILE_W = TILE_R * Math.sqrt(3);
// Generated art (scripts/land-tiles.py): painted grass, and grey paving shading that takes the team colour underneath.
const GRASS_TILES = [grass1Tile, grass2Tile, grass3Tile];
const CLIP_ID = "hex-clip";
const HATCH_ID = "hex-hatch";
const GLOW_ID = "hex-glow";

function TileArt({ href }: { href: string }) {
  return <image href={href} x={-TILE_W / 2} y={-TILE_R} width={TILE_W} height={TILE_R * 2} preserveAspectRatio="none" clip-path={`url(#${CLIP_ID})`} />;
}

export const teamColor = (team: number) => TEAMS[team % TEAMS.length]!.color;

export interface HexBoardProps {
  board: LandBoard;
  /** The team looking at the board: tiles it can't take are hatched, tiles that cost extra are marked. */
  viewer?: number;
  selected?: number | null;
  /** Just placed: pops in. */
  placed?: LandPlace | null;
  /** Just surrounded: these tiles flip over to their new colour. */
  capture?: LandCapture | null;
  label?: string;
}

/** The whole board. Each tile carries data-tile, so a tap can be traced back to it. */
export function HexBoard({ board, viewer, selected, placed, capture, label }: HexBoardProps) {
  const { size, owners, starts } = board;
  const { width, height } = boardExtent(size);
  const startAt = new Map(starts.map((s) => [s.tile, s]));
  const flipped = capture ? new Map(capture.tiles.map((t, i) => [t, i])) : null;
  const tiles = owners.map((owner, tile) => {
    const c = hexCenter(size, tile);
    const start = startAt.get(tile);
    const cost = viewer === undefined || owner === viewer ? null : placementCost(owners, size, starts, viewer, tile, LAND_STEAL_COST, LAND_GUARD_COST);
    const blocked = viewer !== undefined && owner !== viewer && isProtected(size, starts, viewer, tile);
    // Costs this viewer more than one claim: another team's land, or the ring around its start.
    const costly = !blocked && cost !== null && cost > 1;
    const flipIndex = flipped?.get(tile);
    const cls = ["hex", owner === EMPTY ? "grass" : "owned", placed?.tile === tile ? "placed" : "", flipIndex !== undefined ? "flipped" : "", blocked ? "blocked" : "", costly ? "costly" : ""].join(" ");
    return (
      <g key={tile} data-tile={tile} class={cls} transform={`translate(${(c.x * R).toFixed(2)} ${(c.y * R).toFixed(2)})`}>
        <g class="hex-body" style={flipIndex !== undefined ? { animationDelay: `${Math.min(flipIndex * 25, 600)}ms` } : undefined}>
          <polygon class="hex-fill" points={TILE} style={owner === EMPTY ? undefined : { fill: teamColor(owner) }} />
          <TileArt href={owner === EMPTY ? GRASS_TILES[(tile * 7 + Math.floor(tile / size) * 3) % GRASS_TILES.length]! : claimedTile} />
          <polygon class="hex-edge" points={TILE} />
          {start && <StartMark team={start.team} out={start.out} />}
        </g>
        {blocked && <polygon class="hex-block" points={TILE} style={{ fill: `url(#${HATCH_ID})` }} />}
        {costly && <CostMark cost={cost!} />}
      </g>
    );
  });
  const borders = borderEdges(owners, size).map(({ tile, side, owner, rival }) => {
    const c = hexCenter(size, tile);
    const a = BORDER_CORNERS[side]!;
    const b = BORDER_CORNERS[(side + 1) % 6]!;
    const [x, y] = [c.x * R, c.y * R];
    return (
      <line
        key={`${tile}-${side}`}
        class={rival ? "rival" : ""}
        x1={(x + a.x).toFixed(2)}
        y1={(y + a.y).toFixed(2)}
        x2={(x + b.x).toFixed(2)}
        y2={(y + b.y).toFixed(2)}
        style={{ stroke: teamColor(owner) }}
      />
    );
  });
  const sel = selected != null ? hexCenter(size, selected) : null;
  return (
    <svg class="hex-board" viewBox={`0 0 ${(width * R).toFixed(2)} ${(height * R).toFixed(2)}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label ?? "The land"}>
      <defs>
        <clipPath id={CLIP_ID}>
          <polygon points={TILE} />
        </clipPath>
        <pattern id={HATCH_ID} width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect class="hex-hatch-bg" width="2.4" height="2.4" />
          <line class="hex-hatch-line" x1="0" y1="0" x2="0" y2="2.4" />
        </pattern>
        <filter id={GLOW_ID} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      {tiles}
      <g class="hex-borders">
        <g class="hex-borders-under">{borders}</g>
        {borders}
      </g>
      {sel && (
        <g class="hex-select" transform={`translate(${(sel.x * R).toFixed(2)} ${(sel.y * R).toFixed(2)})`}>
          <polygon class="hex-select-glow" points={hexPoints(R)} filter={`url(#${GLOW_ID})`} />
          <polygon class="hex-select-rim" points={hexPoints(TILE_R * 0.97)} />
        </g>
      )}
    </svg>
  );
}

/** A team's starting point: the team's shape in its colour, outlined in white. Faded once the team is knocked out. */
function StartMark({ team, out }: { team: number; out: boolean }) {
  return (
    <g class={`start-mark ${out ? "out" : ""}`}>
      <ShapePath team={team} r={R * 0.58} class="start-shape-shadow" />
      <ShapePath team={team} r={R * 0.58} class="start-shape" style={{ fill: teamColor(team) }} />
    </g>
  );
}

/** Takeable, but for more than one claim: a dashed white ring and the price in a badge. */
function CostMark({ cost }: { cost: number }) {
  return (
    <g class="hex-cost">
      <polygon class="hex-cost-ring" points={hexPoints(TILE_R * 0.86)} />
      <g transform={`translate(${(R * 0.42).toFixed(2)} ${(-R * 0.5).toFixed(2)})`}>
        <circle r={R * 0.3} />
        <text y={R * 0.12}>{cost}</text>
      </g>
    </g>
  );
}
