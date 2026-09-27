/**
 * Robot Attack arena: a 12×12 checkerboard seen at an angle, with the robot
 * looming behind its far edge. Board coordinates: u across (0 = left),
 * v toward the viewer (0 = far row, next to the robot).
 */
import type { AvatarChoice } from "../../shared/avatars.ts";
import { ROBOT_BOARD } from "../../shared/protocol.ts";
import { ACCESSORY_ART, AVATAR_ART } from "./avatar-art.tsx";

export const ARENA_W = 1200;
export const ARENA_H = 860;
const CX = ARENA_W / 2;
/** Screen y of the board's near edge and far edge. */
const NEAR_Y = 800;
const FAR_Y = 360;
/** How much farther away the far row is than the near row (perspective strength). */
const DEPTH = 0.55;
/** Tile width at the near edge. */
const TILE = 84;
const H0 = (NEAR_Y - FAR_Y) / (1 - 1 / (1 + DEPTH));
const HORIZON = NEAR_Y - H0;
const EDGE = 18;
/** Avatars drawn on one tile before the rest collapse into a "+N" chip. */
const STACK_SHOWN = 3;

/** Board point → screen point, with the perspective scale there. */
export function project(u: number, v: number): { x: number; y: number; s: number } {
  const z = 1 + (DEPTH * (ROBOT_BOARD - v)) / ROBOT_BOARD;
  return { x: CX + ((u - ROBOT_BOARD / 2) * TILE) / z, y: HORIZON + H0 / z, s: 1 / z };
}

const quad = (u: number, v: number) => {
  const pts = [project(u, v), project(u + 1, v), project(u + 1, v + 1), project(u, v + 1)];
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
};

/** The three laser emitters at the tips of the robot's back arms: left, center, right. */
export const EMITTERS = [
  { x: 280, y: 215 },
  { x: CX, y: 34 },
  { x: ARENA_W - 280, y: 215 },
];

export interface ArenaPlayer {
  id: string;
  avatar: AvatarChoice;
  x: number;
  y: number;
}

export function RobotArena(props: {
  players: ArenaPlayer[];
  marked: number[];
  /** Laser attack in progress; the key restarts the animation for every attack. */
  attack?: { seq: number; hit: string[] } | null;
  /** Highlighted player (e.g. the one this phone belongs to). */
  me?: string | null;
  class?: string;
}) {
  const marked = new Set(props.marked);
  const hit = new Set(props.attack?.hit ?? []);
  return (
    <svg class={`robot-arena ${props.class ?? ""} ${props.attack ? "attacking" : ""}`} viewBox={`0 0 ${ARENA_W} ${ARENA_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <radialGradient id="ra-bg" cx="0.5" cy="0.25" r="0.9">
          <stop offset="0" stop-color="#3b1f4f" />
          <stop offset="0.6" stop-color="#170d24" />
          <stop offset="1" stop-color="#07040c" />
        </radialGradient>
        <radialGradient id="ra-eye" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#e6fbff" />
          <stop offset="0.4" stop-color="#4fd8ff" />
          <stop offset="1" stop-color="#4fd8ff" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="ra-robe" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#7a0f16" />
          <stop offset="0.45" stop-color="#c81f2a" />
          <stop offset="1" stop-color="#6b0c12" />
        </linearGradient>
        <linearGradient id="ra-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#d4d9e2" />
          <stop offset="0.5" stop-color="#8c94a3" />
          <stop offset="1" stop-color="#4b5160" />
        </linearGradient>
        <filter id="ra-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x={-ARENA_W} y={-ARENA_H} width={ARENA_W * 3} height={ARENA_H * 3} fill="url(#ra-bg)" />
      <Robot attacking={!!props.attack} />
      <Board marked={marked} />
      <Pieces players={props.players} hit={hit} me={props.me ?? null} />
      {props.attack && <Lasers key={props.attack.seq} marked={props.marked} />}
    </svg>
  );
}

function Board({ marked }: { marked: Set<number> }) {
  const nl = project(0, ROBOT_BOARD);
  const nr = project(ROBOT_BOARD, ROBOT_BOARD);
  const tiles = [];
  const xs = [];
  for (let v = 0; v < ROBOT_BOARD; v++) {
    for (let u = 0; u < ROBOT_BOARD; u++) {
      const i = v * ROBOT_BOARD + u;
      tiles.push(<polygon key={i} points={quad(u, v)} class={(u + v) % 2 ? "tile dark" : "tile light"} />);
      if (marked.has(i)) {
        const a = project(u + 0.18, v + 0.18);
        const b = project(u + 0.82, v + 0.82);
        const c = project(u + 0.82, v + 0.18);
        const d = project(u + 0.18, v + 0.82);
        xs.push(
          <g key={i} class="tile-x" style={{ animationDelay: `${((u * 7 + v * 13) % 10) * 25}ms` }}>
            <polygon points={quad(u, v)} class="tile-danger" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            <line x1={c.x} y1={c.y} x2={d.x} y2={d.y} />
          </g>,
        );
      }
    }
  }
  return (
    <g class="board">
      {/* Front edge, for a bit of thickness. */}
      <polygon points={`${nl.x},${nl.y} ${nr.x},${nr.y} ${nr.x},${nr.y + EDGE} ${nl.x},${nl.y + EDGE}`} fill="#231a33" />
      <polygon points={`${project(0, 0).x},${project(0, 0).y} ${project(ROBOT_BOARD, 0).x},${project(ROBOT_BOARD, 0).y} ${nr.x},${nr.y} ${nl.x},${nl.y}`} fill="none" stroke="#8a7bb0" stroke-width="4" />
      {tiles}
      <g class="tile-xs">{xs}</g>
    </g>
  );
}

/** Avatars on their tiles, far rows first so nearer ones overlap them. */
function Pieces({ players, hit, me }: { players: ArenaPlayer[]; hit: Set<string>; me: string | null }) {
  const byTile = new Map<number, ArenaPlayer[]>();
  for (const p of players) {
    const i = p.y * ROBOT_BOARD + p.x;
    const list = byTile.get(i) ?? [];
    // Keep this phone's own avatar on top of a stack.
    if (p.id === me) list.unshift(p);
    else list.push(p);
    byTile.set(i, list);
  }
  const out = [];
  for (const [i, list] of [...byTile].sort((a, b) => a[0] - b[0])) {
    const u = i % ROBOT_BOARD;
    const v = Math.floor(i / ROBOT_BOARD);
    const shown = list.slice(0, STACK_SHOWN);
    const c = project(u + 0.5, v + 0.62);
    const size = TILE * 0.95 * c.s;
    // Fan a stack out sideways, back to front.
    shown
      .map((p, k) => ({ p, k }))
      .reverse()
      .forEach(({ p, k }) => {
        const dx = shown.length > 1 ? (k - (shown.length - 1) / 2) * size * 0.42 : 0;
        const x = c.x + dx - size / 2;
        const y = c.y - size;
        const art = AVATAR_ART[p.avatar.avatar] ?? AVATAR_ART.cat;
        const extra = ACCESSORY_ART[p.avatar.accessory] ?? ACCESSORY_ART.none;
        out.push(
          <g key={p.id} class={`piece ${hit.has(p.id) ? "zapped" : ""} ${p.id === me ? "mine" : ""}`} style={{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` }}>
            <ellipse cx={size / 2} cy={size * 0.98} rx={size * 0.34} ry={size * 0.09} fill="rgba(0,0,0,0.45)" />
            {p.id === me && <ellipse class="mine-ring" cx={size / 2} cy={size * 0.98} rx={size * 0.46} ry={size * 0.14} />}
            <g transform={`scale(${size / 100})`}>
              {art()}
              {extra()}
            </g>
          </g>,
        );
      });
    if (list.length > STACK_SHOWN) {
      out.push(
        <g key={`more-${i}`} class="stack-more" transform={`translate(${c.x + size * 0.55} ${c.y - size * 1.05})`}>
          <rect x={-2} y={-18 * c.s * 1.4} width={46 * c.s * 1.4} height={24 * c.s * 1.4} rx={10} />
          <text x={21 * c.s * 1.4 - 2} y={-1} font-size={18 * c.s * 1.4} text-anchor="middle">
            +{list.length - STACK_SHOWN}
          </text>
        </g>,
      );
    }
  }
  return <g class="pieces">{out}</g>;
}

/** A beam from the nearest back arm to every targeted tile. */
function Lasers({ marked }: { marked: number[] }) {
  return (
    <g class="lasers">
      {marked.map((i, n) => {
        const u = i % ROBOT_BOARD;
        const v = Math.floor(i / ROBOT_BOARD);
        const arm = u < 4 ? 0 : u < 8 ? 1 : 2;
        const from = EMITTERS[arm]!;
        const to = project(u + 0.5, v + 0.5);
        const delay = `${(n % 12) * 40 + arm * 60}ms`;
        return (
          <g key={i} style={{ animationDelay: delay }} class="beam">
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} class="beam-glow" style={{ animationDelay: delay }} />
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} class="beam-core" style={{ animationDelay: delay }} />
            <ellipse cx={to.x} cy={to.y} rx={TILE * 0.35 * to.s} ry={TILE * 0.14 * to.s} class="scorch" style={{ animationDelay: delay }} />
          </g>
        );
      })}
    </g>
  );
}

/** One mechanical arm: shoulder → elbow → emitter, with joints. */
function MechArm({ from, elbow, to, attacking }: { from: { x: number; y: number }; elbow: { x: number; y: number }; to: { x: number; y: number }; attacking: boolean }) {
  return (
    <g class="mech-arm">
      <polyline points={`${from.x},${from.y} ${elbow.x},${elbow.y} ${to.x},${to.y}`} fill="none" stroke="#2a2d38" stroke-width="30" stroke-linejoin="round" stroke-linecap="round" />
      <polyline points={`${from.x},${from.y} ${elbow.x},${elbow.y} ${to.x},${to.y}`} fill="none" stroke="url(#ra-metal)" stroke-width="20" stroke-linejoin="round" stroke-linecap="round" />
      {/* hydraulic piston along the upper arm */}
      <line x1={(from.x * 2 + elbow.x) / 3} y1={(from.y * 2 + elbow.y) / 3 - 14} x2={elbow.x} y2={elbow.y - 14} stroke="#b8bfcc" stroke-width="5" />
      <circle cx={elbow.x} cy={elbow.y} r="17" fill="#3a3f4d" stroke="#1a1c24" stroke-width="4" />
      <circle cx={elbow.x} cy={elbow.y} r="6" fill="#9aa3b3" />
      <g class={`emitter ${attacking ? "firing" : ""}`}>
        <circle cx={to.x} cy={to.y} r="26" fill="#2a2d38" stroke="#1a1c24" stroke-width="4" />
        <circle cx={to.x} cy={to.y} r="15" class="emitter-core" filter="url(#ra-glow)" />
      </g>
    </g>
  );
}

/** The robot: red robe with the cowl down, glowing blue eyes, an electric axe, three mechanical back arms. */
function Robot({ attacking }: { attacking: boolean }) {
  return (
    <g class={`robot ${attacking ? "attacking" : ""}`}>
      {/* back arms, behind the body */}
      <MechArm from={{ x: 540, y: 215 }} elbow={{ x: 390, y: 300 }} to={EMITTERS[0]!} attacking={attacking} />
      <MechArm from={{ x: 660, y: 215 }} elbow={{ x: 810, y: 300 }} to={EMITTERS[2]!} attacking={attacking} />
      <MechArm from={{ x: 600, y: 200 }} elbow={{ x: 660, y: 110 }} to={EMITTERS[1]!} attacking={attacking} />
      {/* robe */}
      <path d="M520,205 Q600,190 680,205 L760,400 L440,400 Z" fill="url(#ra-robe)" stroke="#3d0609" stroke-width="5" stroke-linejoin="round" />
      <path d="M600,215 L600,400" stroke="#5d0a10" stroke-width="5" />
      <path d="M560,225 L535,400 M640,225 L665,400" stroke="#8f141c" stroke-width="4" opacity="0.7" />
      {/* rope belt */}
      <path d="M492,318 Q600,340 708,318" fill="none" stroke="#d9b45a" stroke-width="9" stroke-linecap="round" />
      <path d="M560,332 l-8,46 M572,334 l2,44" stroke="#d9b45a" stroke-width="6" stroke-linecap="round" />
      {/* left arm, hanging */}
      <path d="M522,212 Q470,260 468,330 L500,336 Q506,275 540,232 Z" fill="url(#ra-robe)" stroke="#3d0609" stroke-width="4" />
      <circle cx="482" cy="345" r="18" fill="url(#ra-metal)" stroke="#1a1c24" stroke-width="3" />
      {/* electric axe in the right hand */}
      <g class="axe">
        <line x1="700" y1="390" x2="790" y2="95" stroke="#3a2a1c" stroke-width="12" stroke-linecap="round" />
        <line x1="700" y1="390" x2="790" y2="95" stroke="#6b5039" stroke-width="5" stroke-linecap="round" />
        <path d="M772,112 Q840,80 870,150 Q830,150 790,170 Z" fill="url(#ra-metal)" stroke="#1a1c24" stroke-width="4" stroke-linejoin="round" />
        <path d="M770,120 Q735,95 720,140 Q745,140 766,152 Z" fill="url(#ra-metal)" stroke="#1a1c24" stroke-width="4" stroke-linejoin="round" />
        <path class="axe-edge" d="M846,96 Q880,120 872,158" fill="none" stroke="#6ff3ff" stroke-width="4" filter="url(#ra-glow)" />
        <path class="spark s1" d="M860,110 l18,-14 l-6,16 l20,-10" fill="none" stroke="#bff8ff" stroke-width="3" stroke-linejoin="round" />
        <path class="spark s2" d="M874,150 l22,6 l-14,6 l18,10" fill="none" stroke="#bff8ff" stroke-width="3" stroke-linejoin="round" />
        <path class="spark s3" d="M836,86 l4,-22 l6,14 l10,-18" fill="none" stroke="#bff8ff" stroke-width="3" stroke-linejoin="round" />
      </g>
      {/* right arm, gripping the haft */}
      <path d="M678,212 Q732,250 742,300 L712,312 Q700,268 660,232 Z" fill="url(#ra-robe)" stroke="#3d0609" stroke-width="4" />
      <circle cx="734" cy="300" r="19" fill="url(#ra-metal)" stroke="#1a1c24" stroke-width="3" />
      {/* the cowl, pulled down and bunched around the shoulders */}
      <path d="M520,212 Q530,176 600,172 Q670,176 680,212 Q640,236 600,234 Q560,236 520,212 Z" fill="#a3161f" stroke="#3d0609" stroke-width="5" stroke-linejoin="round" />
      <path d="M540,210 Q600,226 660,210" fill="none" stroke="#5d0a10" stroke-width="4" />
      {/* neck and head */}
      <rect x="586" y="160" width="28" height="24" fill="#4b5160" />
      <path d="M552,100 Q552,62 600,60 Q648,62 648,100 L644,150 Q600,176 556,150 Z" fill="url(#ra-metal)" stroke="#1a1c24" stroke-width="5" stroke-linejoin="round" />
      <path d="M566,104 Q600,94 634,104 L630,128 Q600,138 570,128 Z" fill="#161820" />
      <g class="eyes" filter="url(#ra-glow)">
        <ellipse cx="584" cy="114" rx="11" ry="6" fill="#4fd8ff" />
        <ellipse cx="616" cy="114" rx="11" ry="6" fill="#4fd8ff" />
      </g>
      <circle class="eye-halo" cx="584" cy="114" r="26" fill="url(#ra-eye)" opacity="0.55" />
      <circle class="eye-halo" cx="616" cy="114" r="26" fill="url(#ra-eye)" opacity="0.55" />
      <path d="M576,146 h48 M580,154 h40" stroke="#4b5160" stroke-width="3" />
      <line x1="600" y1="60" x2="600" y2="40" stroke="#4b5160" stroke-width="5" />
    </g>
  );
}

/** Tiles visible in each direction around the player on the phone's map (7×7). */
const MINI_RADIUS = 3;

/**
 * Top-down map for the phone: a 7×7 window that follows the player, who stays
 * in the middle. Shows the red Xs, other players as dots, and the robot's edge of the board.
 */
export function MiniBoard({ me, others, marked, avatar, zapped }: { me: { x: number; y: number }; others: { x: number; y: number }[]; marked: number[]; avatar: AvatarChoice; zapped?: boolean }) {
  const cell = 10;
  const span = (2 * MINI_RADIUS + 1) * cell;
  const set = new Set(marked);
  const art = AVATAR_ART[avatar.avatar] ?? AVATAR_ART.cat;
  const extra = ACCESSORY_ART[avatar.accessory] ?? ACCESSORY_ART.none;
  const size = ROBOT_BOARD * cell;
  // The whole board slides under a fixed window so the player stays centered.
  const shift = { x: (MINI_RADIUS - me.x) * cell, y: (MINI_RADIUS - me.y) * cell };
  return (
    <svg class="mini-board" viewBox={`0 0 ${span} ${span}`} role="img" aria-label={`You are on column ${me.x + 1}, row ${me.y + 1}`}>
      {/* The svg box can be wider or taller than the map; show only the 7×7 window. */}
      <clipPath id="mini-window">
        <rect x={0} y={0} width={span} height={span} rx={2} />
      </clipPath>
      <rect x={0} y={0} width={span} height={span} rx={2} class="mini-void" />
      <g clip-path="url(#mini-window)">
        <g class="mini-scroll" style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}>
          {/* The robot stands beyond the top edge, as on the big screen. */}
          <rect x={0} y={-cell} width={size} height={cell - 1.5} class="mini-robot-edge" />
          {/* Repeated so one is always inside the 7-tile window. */}
          {Array.from({ length: ROBOT_BOARD / 2 }, (_, k) => (
            <text key={k} x={(2 * k + 1) * cell} y={-2.4} text-anchor="middle" class="mini-robot-label">
              🤖
            </text>
          ))}
          {Array.from({ length: ROBOT_BOARD * ROBOT_BOARD }, (_, i) => {
            const x = (i % ROBOT_BOARD) * cell;
            const y = Math.floor(i / ROBOT_BOARD) * cell;
            return (
              <g key={i}>
                <rect x={x} y={y} width={cell} height={cell} class={((i % ROBOT_BOARD) + Math.floor(i / ROBOT_BOARD)) % 2 ? "tile dark" : "tile light"} />
                {set.has(i) && <path d={`M${x + 2},${y + 2} L${x + 8},${y + 8} M${x + 8},${y + 2} L${x + 2},${y + 8}`} class="mini-x" />}
              </g>
            );
          })}
          <rect x={0} y={0} width={size} height={size} class="mini-edge" />
          {others.map((o, i) => (
            <circle key={i} cx={o.x * cell + cell / 2} cy={o.y * cell + cell / 2} r={2.6} class="mini-other" />
          ))}
        </g>
      </g>
      <g class={`mini-me ${zapped ? "zapped" : ""}`} transform={`translate(${MINI_RADIUS * cell - 1} ${MINI_RADIUS * cell - 1})`}>
        <rect x={0} y={0} width={cell + 2} height={cell + 2} rx={2} class="mini-me-ring" />
        <g transform={`scale(${(cell + 2) / 100})`}>
          {art()}
          {extra()}
        </g>
      </g>
    </svg>
  );
}
