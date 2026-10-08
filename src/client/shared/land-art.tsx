import { EMPTY, boardExtent, hexCenter, isGuarded, isProtected } from "../../shared/land-board.ts";
import { TEAMS, type LandBoard, type LandCapture, type LandPlace } from "../../shared/protocol.ts";
import claimedTile from "./land/claimed.webp";
import grass1Tile from "./land/grass-1.webp";
import grass2Tile from "./land/grass-2.webp";
import grass3Tile from "./land/grass-3.webp";

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
const TILE_W = TILE_R * Math.sqrt(3);
// Generated art (scripts/land-tiles.py): painted grass, and grey paving shading that takes the team colour underneath.
const GRASS_TILES = [grass1Tile, grass2Tile, grass3Tile];
const CLIP_ID = "hex-clip";

function TileArt({ href }: { href: string }) {
  return <image href={href} x={-TILE_W / 2} y={-TILE_R} width={TILE_W} height={TILE_R * 2} preserveAspectRatio="none" clip-path={`url(#${CLIP_ID})`} />;
}

export const teamColor = (team: number) => TEAMS[team % TEAMS.length]!.color;

export interface HexBoardProps {
  board: LandBoard;
  /** The team looking at the board: tiles it can't take are dimmed. */
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
    const blocked = viewer !== undefined && owner !== viewer && isProtected(size, starts, viewer, tile);
    // Costs this viewer extra: the ring around another team's start.
    const guarded = viewer !== undefined && owner !== viewer && !blocked && isGuarded(size, starts, viewer, tile);
    const flipIndex = flipped?.get(tile);
    const cls = ["hex", owner === EMPTY ? "grass" : "owned", placed?.tile === tile ? "placed" : "", flipIndex !== undefined ? "flipped" : "", blocked ? "blocked" : "", guarded ? "guarded" : ""].join(" ");
    return (
      <g key={tile} data-tile={tile} class={cls} transform={`translate(${(c.x * R).toFixed(2)} ${(c.y * R).toFixed(2)})`}>
        <g class="hex-body" style={flipIndex !== undefined ? { animationDelay: `${Math.min(flipIndex * 25, 600)}ms` } : undefined}>
          <polygon class="hex-fill" points={TILE} style={owner === EMPTY ? undefined : { fill: teamColor(owner) }} />
          <TileArt href={owner === EMPTY ? GRASS_TILES[(tile * 7 + Math.floor(tile / size) * 3) % GRASS_TILES.length]! : claimedTile} />
          <polygon class="hex-edge" points={TILE} />
          {start && <StartMark color={teamColor(start.team)} out={start.out} />}
        </g>
        {blocked && <polygon class="hex-block" points={TILE} />}
        {guarded && <polygon class="hex-guard" points={TILE} />}
      </g>
    );
  });
  const sel = selected != null ? hexCenter(size, selected) : null;
  return (
    <svg class="hex-board" viewBox={`0 0 ${(width * R).toFixed(2)} ${(height * R).toFixed(2)}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label ?? "The land"}>
      <defs>
        <clipPath id={CLIP_ID}>
          <polygon points={TILE} />
        </clipPath>
      </defs>
      {tiles}
      {sel && <polygon class="hex-select" points={hexPoints(R * 1.02)} transform={`translate(${(sel.x * R).toFixed(2)} ${(sel.y * R).toFixed(2)})`} />}
    </svg>
  );
}

/** A team's starting point: an X in the team colour on a white badge. Faded once the team is knocked out. */
function StartMark({ color, out }: { color: string; out: boolean }) {
  const d = R * 0.32;
  return (
    <g class={`start-mark ${out ? "out" : ""}`}>
      <circle r={R * 0.62} />
      <path d={`M${-d} ${-d}L${d} ${d}M${d} ${-d}L${-d} ${d}`} style={{ stroke: color }} />
    </g>
  );
}
