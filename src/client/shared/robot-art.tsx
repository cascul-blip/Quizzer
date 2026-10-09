/**
 * Robot Attack arena: a 12×12 checkerboard seen at an angle, with the robot
 * looming behind its far edge. Board coordinates: u across (0 = left),
 * v toward the viewer (0 = far row, next to the robot).
 */
import { useEffect, useRef, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { ROBOT_BOARD, robotRing } from "../../shared/protocol.ts";
import { ACCESSORY_ART, AVATAR_ART } from "./avatar-art.tsx";
import armImg from "./robot/arm.webp";
import bodyImg from "./robot/body.webp";
import emitterImg from "./robot/emitter.webp";
import jointImg from "./robot/joint.webp";

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

type Pt = { x: number; y: number };

/** The three laser emitters at the tips of the robot's back arms (at rest): left, center (over its head), right. */
export const EMITTERS: Pt[] = [
  { x: 280, y: 215 },
  { x: CX, y: 38 },
  { x: ARENA_W - 280, y: 215 },
];

/** Rest pose of each back arm: shoulder → four joints → emitter tip. The outer two start at the posts of the backpack, the middle one behind the hood. */
const ARMS: Pt[][] = [
  [{ x: 516, y: 108 }, { x: 455, y: 72 }, { x: 385, y: 58 }, { x: 320, y: 80 }, { x: 288, y: 140 }, EMITTERS[0]!],
  [{ x: 600, y: 170 }, { x: 556, y: 128 }, { x: 540, y: 92 }, { x: 548, y: 60 }, { x: 572, y: 40 }, EMITTERS[1]!],
  [{ x: 670, y: 108 }, { x: 740, y: 72 }, { x: 812, y: 58 }, { x: 878, y: 80 }, { x: 912, y: 140 }, EMITTERS[2]!],
];
const ARM_SEGMENTS = ARMS.map((pts) => pts.slice(1).map((p, i) => ({ len: Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), ang: Math.atan2(p.y - pts[i]!.y, p.x - pts[i]!.x) })));
/** One slow sway, back and forth. */
const SWAY_PERIOD_MS = 7000;
/** Bend added at each joint at the sway's peak (radians); it builds up toward the tip. */
const SWAY_AMP = 0.06;
/** Phase lag from one joint to the next, so the arm ripples instead of swinging stiffly. */
const SWAY_LAG = 0.7;
const ARM_PHASE = [0, 2.1, 4.2];

/** An arm's joint points at sway time t (ms), or its rest pose for null. The last point is the emitter. */
function armPose(k: number, t: number | null): Pt[] {
  const rest = ARMS[k]!;
  if (t === null) return rest;
  const out = [rest[0]!];
  let bend = 0;
  ARM_SEGMENTS[k]!.forEach((seg, j) => {
    bend += SWAY_AMP * Math.sin((2 * Math.PI * t) / SWAY_PERIOD_MS + ARM_PHASE[k]! + j * SWAY_LAG);
    const prev = out[j]!;
    out.push({ x: prev.x + seg.len * Math.cos(seg.ang + bend), y: prev.y + seg.len * Math.sin(seg.ang + bend) });
  });
  return out;
}

const prefersStill = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Sway clock for the back arms. It stops while an attack is on (so the beams leave
 * from where the emitters actually are) and resumes where it left off afterwards.
 */
interface SwayClock {
  /** Real time not counted as sway time (the attacks so far). */
  offset: number;
  /** Sway time the arms are frozen at, during an attack. */
  frozenAt: number | null;
  frozenReal: number;
  seq: number | null;
}

function useSwayClock(attackSeq: number | null): SwayClock {
  const ref = useRef<SwayClock>({ offset: 0, frozenAt: null, frozenReal: 0, seq: null });
  const c = ref.current;
  if (attackSeq !== c.seq) {
    const now = performance.now();
    if (c.frozenAt !== null) c.offset += now - c.frozenReal;
    c.frozenAt = attackSeq === null ? null : now - c.offset;
    c.frozenReal = now;
    c.seq = attackSeq;
  }
  return c;
}

export interface ArenaPlayer {
  id: string;
  avatar: AvatarChoice;
  x: number;
  y: number;
}

export function RobotArena(props: {
  players: ArenaPlayer[];
  marked: number[];
  /** Rings of tiles already destroyed. */
  inset?: number;
  /** The ring being destroyed this round. */
  collapsing?: number[];
  /** Laser attack in progress; the key restarts the animation for every attack. */
  attack?: { seq: number; hit: string[] } | null;
  /** Highlighted player (e.g. the one this phone belongs to). */
  me?: string | null;
  class?: string;
}) {
  const marked = new Set(props.marked);
  const hit = new Set(props.attack?.hit ?? []);
  const clock = useSwayClock(props.attack?.seq ?? null);
  const tips = [0, 1, 2].map((k) => armPose(k, prefersStill() ? null : clock.frozenAt).at(-1)!);
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
        <filter id="ra-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x={-ARENA_W} y={-ARENA_H} width={ARENA_W * 3} height={ARENA_H * 3} fill="url(#ra-bg)" />
      <Robot attacking={!!props.attack} clock={clock} />
      <Board marked={marked} inset={props.inset ?? 0} collapsing={new Set(props.collapsing ?? [])} />
      <Pieces players={props.players} hit={hit} me={props.me ?? null} />
      {props.attack && <Lasers key={props.attack.seq} marked={props.marked} tips={tips} />}
    </svg>
  );
}

function Board({ marked, inset, collapsing }: { marked: Set<number>; inset: number; collapsing: Set<number> }) {
  const far = inset;
  const near = ROBOT_BOARD - inset;
  const fl = project(far, far);
  const fr = project(near, far);
  const nl = project(far, near);
  const nr = project(near, near);
  const tiles = [];
  const xs = [];
  for (let v = 0; v < ROBOT_BOARD; v++) {
    for (let u = 0; u < ROBOT_BOARD; u++) {
      const i = v * ROBOT_BOARD + u;
      const gone = robotRing(i) < inset;
      if (collapsing.has(i)) {
        // Solid pulsing red until the lasers fire, then the tile drops away.
        tiles.push(<polygon key={i} points={quad(u, v)} class={`tile tile-collapse ${gone ? "gone" : ""}`} />);
        continue;
      }
      if (gone) continue;
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
      <polygon points={`${fl.x},${fl.y} ${fr.x},${fr.y} ${nr.x},${nr.y} ${nl.x},${nl.y}`} fill="none" stroke="#8a7bb0" stroke-width="4" />
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

/** A beam from the nearest back arm's emitter (at `tips`) to every targeted tile. */
function Lasers({ marked, tips }: { marked: number[]; tips: Pt[] }) {
  return (
    <g class="lasers">
      {marked.map((i, n) => {
        const u = i % ROBOT_BOARD;
        const v = Math.floor(i / ROBOT_BOARD);
        const arm = u < 4 ? 0 : u < 8 ? 1 : 2;
        const from = tips[arm]!;
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

/** A back arm's segments and joints (the emitter is drawn separately, in front of the body). */
function MechArm({ pts }: { pts: Pt[] }) {
  return (
    <g class="mech-arm">
      {pts.slice(1).map((b, i) => {
        const a = pts[i]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const h = 30 - i * 3;
        const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        return <image key={`s${i}`} href={armImg} x="0" y={-h / 2} width={len} height={h} preserveAspectRatio="none" transform={`translate(${a.x.toFixed(1)},${a.y.toFixed(1)}) rotate(${deg.toFixed(1)})`} />;
      })}
      {pts.slice(0, -1).map((p, i) => {
        const r = 19 - i * 1.6;
        return <image key={`j${i}`} href={jointImg} x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} />;
      })}
    </g>
  );
}

const EMITTER_R = 32;

function Emitter({ at, attacking }: { at: Pt; attacking: boolean }) {
  return (
    <g class={`emitter ${attacking ? "firing" : ""}`}>
      <image href={emitterImg} x={at.x - EMITTER_R} y={at.y - EMITTER_R} width={EMITTER_R * 2} height={EMITTER_R * 2} />
      <circle cx={at.x} cy={at.y} r="12" class="emitter-core" filter="url(#ra-glow)" />
    </g>
  );
}

/** Where the square body render sits in the arena. Its bottom fades out behind the board. */
const BODY = { x: 350, y: 60, size: 500 };
/** A point of the body render (in pixels of its 1024px source) in arena coordinates. */
const bodyPt = (px: number, py: number): Pt => ({ x: BODY.x + (px / 1024) * BODY.size, y: BODY.y + (py / 1024) * BODY.size });
const bodyLen = (px: number) => (px / 1024) * BODY.size;
/** The mask's lenses: centre and glass radius, in source pixels. The first two are the large ones. */
const OPTICS = [
  { x: 464, y: 206, r: 20 },
  { x: 561, y: 206, r: 20 },
  { x: 461, y: 268, r: 12 },
  { x: 564, y: 268, r: 12 },
].map((o) => ({ ...bodyPt(o.x, o.y), r: bodyLen(o.r) }));
/** The axe's cutting edge: top tip, outermost point, bottom tip. */
const [EDGE_TOP, EDGE_MID, EDGE_BOTTOM] = [bodyPt(876, 148), bodyPt(953, 233), bodyPt(904, 336)] as [Pt, Pt, Pt];
/** Control point of the curve through the three. */
const EDGE_CTRL = { x: 2 * EDGE_MID.x - (EDGE_TOP.x + EDGE_BOTTOM.x) / 2, y: 2 * EDGE_MID.y - (EDGE_TOP.y + EDGE_BOTTOM.y) / 2 };
const at = (p: Pt) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;

/** The live parts of the axe: its glowing edge and the lightning jumping off it. The axe itself is in the body render. */
function AxeGlow() {
  return (
    <g class="axe">
      <path class="axe-edge" d={`M${at(EDGE_TOP)} Q${at(EDGE_CTRL)} ${at(EDGE_BOTTOM)}`} fill="none" stroke="#6ff3ff" stroke-width="3" stroke-linecap="round" filter="url(#ra-glow)" />
      <path class="spark s1" d={`M${at(EDGE_MID)} l18,-14 l-6,16 l20,-10`} fill="none" stroke="#bff8ff" stroke-width="3" stroke-linejoin="round" />
      <path class="spark s2" d={`M${at(EDGE_BOTTOM)} l22,6 l-14,6 l18,10`} fill="none" stroke="#bff8ff" stroke-width="3" stroke-linejoin="round" />
      <path class="spark s3" d={`M${at(EDGE_TOP)} l4,-22 l6,14 l10,-18`} fill="none" stroke="#bff8ff" stroke-width="3" stroke-linejoin="round" />
    </g>
  );
}

/** The robot: a hooded machine priest in a red robe with glowing lenses, an axe crackling with lightning and three jointed back arms. */
function Robot({ attacking, clock }: { attacking: boolean; clock: SwayClock }) {
  const still = prefersStill();
  const frozen = clock.frozenAt !== null;
  const [, tick] = useState(0);
  useEffect(() => {
    if (frozen || still) return;
    let raf = 0;
    const loop = () => {
      tick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [frozen, still]);
  const t = still ? null : (clock.frozenAt ?? performance.now() - clock.offset);
  const arms = [0, 1, 2].map((k) => armPose(k, t));
  return (
    <g class={`robot ${attacking ? "attacking" : ""}`}>
      {/* back arms, behind the body */}
      {arms.map((pts, k) => (
        <MechArm key={k} pts={pts} />
      ))}
      <image href={bodyImg} x={BODY.x} y={BODY.y} width={BODY.size} height={BODY.size} />
      <AxeGlow />
      {OPTICS.slice(0, 2).map((o, i) => (
        <circle key={i} class="eye-halo" cx={o.x} cy={o.y} r={o.r * 3} fill="url(#ra-eye)" opacity="0.55" />
      ))}
      <g class="eyes" filter="url(#ra-glow)">
        {OPTICS.map((o, i) => (
          <circle key={i} cx={o.x} cy={o.y} r={o.r * 0.75} fill="#4fd8ff" />
        ))}
      </g>
      {/* the emitters, in front of the body */}
      {arms.map((pts, k) => (
        <Emitter key={k} at={pts.at(-1)!} attacking={attacking} />
      ))}
    </g>
  );
}

/** Tiles visible in each direction around the player on the phone's map (7×7). */
const MINI_RADIUS = 3;

/**
 * Top-down map for the phone: a 7×7 window that follows the player, who stays
 * in the middle. Shows the red Xs, the collapsing ring in solid red, other players as dots,
 * and the robot's edge of the board.
 */
export function MiniBoard({
  me,
  others,
  marked,
  inset,
  collapsing,
  avatar,
  zapped,
}: {
  me: { x: number; y: number };
  others: { x: number; y: number }[];
  marked: number[];
  inset: number;
  collapsing: number[];
  avatar: AvatarChoice;
  zapped?: boolean;
}) {
  const cell = 10;
  const span = (2 * MINI_RADIUS + 1) * cell;
  const set = new Set(marked);
  const doomed = new Set(collapsing);
  const art = AVATAR_ART[avatar.avatar] ?? AVATAR_ART.cat;
  const extra = ACCESSORY_ART[avatar.accessory] ?? ACCESSORY_ART.none;
  const edge = inset * cell;
  const size = (ROBOT_BOARD - 2 * inset) * cell;
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
          <rect x={edge} y={edge - cell} width={size} height={cell - 1.5} class="mini-robot-edge" />
          {/* Repeated so one is always inside the 7-tile window. */}
          {Array.from({ length: ROBOT_BOARD / 2 }, (_, k) => 2 * k + 1)
            .filter((u) => u >= inset && u <= ROBOT_BOARD - inset)
            .map((u) => (
              <text key={u} x={u * cell} y={edge - 2.4} text-anchor="middle" class="mini-robot-label">
                🤖
              </text>
            ))}
          {Array.from({ length: ROBOT_BOARD * ROBOT_BOARD }, (_, i) => {
            const x = (i % ROBOT_BOARD) * cell;
            const y = Math.floor(i / ROBOT_BOARD) * cell;
            const gone = robotRing(i) < inset;
            if (doomed.has(i)) return <rect key={i} x={x} y={y} width={cell} height={cell} class={`mini-collapse ${gone ? "gone" : ""}`} />;
            if (gone) return null;
            return (
              <g key={i}>
                <rect x={x} y={y} width={cell} height={cell} class={((i % ROBOT_BOARD) + Math.floor(i / ROBOT_BOARD)) % 2 ? "tile dark" : "tile light"} />
                {set.has(i) && <path d={`M${x + 2},${y + 2} L${x + 8},${y + 8} M${x + 8},${y + 2} L${x + 2},${y + 8}`} class="mini-x" />}
              </g>
            );
          })}
          <rect x={edge} y={edge} width={size} height={size} class="mini-edge" />
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
