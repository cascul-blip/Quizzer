/**
 * Robot Attack arena: a 12×12 checkerboard seen at an angle, with the robot
 * looming behind its far edge. Board coordinates: u across (0 = left),
 * v toward the viewer (0 = far row, next to the robot).
 */
import { useEffect, useRef, useState } from "preact/hooks";
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

type Pt = { x: number; y: number };

/** The three laser emitters at the tips of the robot's back arms (at rest): left, center, right. */
export const EMITTERS: Pt[] = [
  { x: 280, y: 215 },
  { x: CX - 92, y: 44 },
  { x: ARENA_W - 280, y: 215 },
];

/** Rest pose of each back arm: shoulder → four joints → emitter tip. */
const ARMS: Pt[][] = [
  [{ x: 540, y: 215 }, { x: 470, y: 262 }, { x: 400, y: 290 }, { x: 335, y: 282 }, { x: 295, y: 250 }, EMITTERS[0]!],
  [{ x: 590, y: 200 }, { x: 552, y: 180 }, { x: 526, y: 146 }, { x: 510, y: 110 }, { x: 504, y: 76 }, EMITTERS[1]!],
  [{ x: 660, y: 215 }, { x: 730, y: 262 }, { x: 800, y: 290 }, { x: 865, y: 282 }, { x: 905, y: 250 }, EMITTERS[2]!],
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
      <Robot attacking={!!props.attack} clock={clock} />
      <Board marked={marked} />
      <Pieces players={props.players} hit={hit} me={props.me ?? null} />
      {props.attack && <Lasers key={props.attack.seq} marked={props.marked} tips={tips} />}
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

/** A mechanical arm's segments and joints (the emitter is drawn separately, in front of the body). */
function MechArm({ pts }: { pts: Pt[] }) {
  const segs = pts.slice(1).map((b, i) => ({ a: pts[i]!, b, w: 28 - i * 3 }));
  return (
    <g class="mech-arm">
      {segs.map(({ a, b, w }, i) => (
        <line key={`o${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2a2d38" stroke-width={w + 10} stroke-linecap="round" />
      ))}
      {segs.map(({ a, b, w }, i) => (
        <line key={`m${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="url(#ra-metal)" stroke-width={w} stroke-linecap="round" />
      ))}
      {/* hydraulic pistons along every other segment */}
      {segs.map(({ a, b, w }, i) => {
        if (i % 2) return null;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const nx = (-(b.y - a.y) / len) * (w / 2 + 3);
        const ny = ((b.x - a.x) / len) * (w / 2 + 3);
        return <line key={`p${i}`} x1={a.x + (b.x - a.x) * 0.2 + nx} y1={a.y + (b.y - a.y) * 0.2 + ny} x2={a.x + (b.x - a.x) * 0.85 + nx} y2={a.y + (b.y - a.y) * 0.85 + ny} stroke="#b8bfcc" stroke-width="4" stroke-linecap="round" />;
      })}
      {pts.slice(0, -1).map((p, i) => (
        <g key={`j${i}`}>
          <circle cx={p.x} cy={p.y} r={17 - i * 1.6} fill="#3a3f4d" stroke="#1a1c24" stroke-width="4" />
          <circle cx={p.x} cy={p.y} r={6 - i * 0.5} fill="#9aa3b3" />
        </g>
      ))}
    </g>
  );
}

function Emitter({ at, attacking }: { at: Pt; attacking: boolean }) {
  return (
    <g class={`emitter ${attacking ? "firing" : ""}`}>
      <circle cx={at.x} cy={at.y} r="26" fill="#2a2d38" stroke="#1a1c24" stroke-width="4" />
      <circle cx={at.x} cy={at.y} r="15" class="emitter-core" filter="url(#ra-glow)" />
    </g>
  );
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (c: Pt, r: number, deg: number): Pt => ({ x: c.x + r * Math.cos(rad(deg)), y: c.y + r * Math.sin(rad(deg)) });
const ptsToPath = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

/** Outline of a half gear's toothed rim, from angle a0 to a1 (degrees, clockwise on screen). */
function gearRim(c: Pt, r: number, depth: number, teeth: number, a0: number, a1: number): Pt[] {
  const pitch = (a1 - a0) / teeth;
  const out: Pt[] = [];
  for (let i = 0; i < teeth; i++) {
    const s = a0 + i * pitch;
    out.push(polar(c, r, s), polar(c, r, s + pitch * 0.2), polar(c, r + depth, s + pitch * 0.32), polar(c, r + depth, s + pitch * 0.68), polar(c, r, s + pitch * 0.8));
  }
  out.push(polar(c, r, a1));
  return out;
}

/** The axe head: half a gear, its flat side along the haft. */
const GEAR_C = { x: 783, y: 118 };
const GEAR_R = 60;
const GEAR_DEPTH = 13;
const GEAR_TEETH = 7;
/** The haft points this way (degrees), so the half gear spans from it to its opposite. */
const HAFT_UP = (Math.atan2(95 - 390, 790 - 700) * 180) / Math.PI;
const GEAR_RIM = gearRim(GEAR_C, GEAR_R, GEAR_DEPTH, GEAR_TEETH, HAFT_UP, HAFT_UP + 180);
/** Where tooth n's tip is, for the sparks to jump from. */
const toothTip = (n: number) => polar(GEAR_C, GEAR_R + GEAR_DEPTH, HAFT_UP + ((n + 0.5) * 180) / GEAR_TEETH);

function GearAxe() {
  const inner = [polar(GEAR_C, GEAR_R * 0.62, HAFT_UP), polar(GEAR_C, GEAR_R * 0.62, HAFT_UP + 180)];
  const [t1, t3, t5] = [toothTip(2), toothTip(0), toothTip(4)];
  return (
    <g class="axe">
      <line x1="700" y1="390" x2="790" y2="95" stroke="#3a2a1c" stroke-width="12" stroke-linecap="round" />
      <line x1="700" y1="390" x2="790" y2="95" stroke="#6b5039" stroke-width="5" stroke-linecap="round" />
      <path d={`${ptsToPath(GEAR_RIM)} Z`} fill="url(#ra-metal)" stroke="#1a1c24" stroke-width="4" stroke-linejoin="round" />
      <path d={`M${inner[0]!.x.toFixed(1)},${inner[0]!.y.toFixed(1)} A${GEAR_R * 0.62},${GEAR_R * 0.62} 0 0 1 ${inner[1]!.x.toFixed(1)},${inner[1]!.y.toFixed(1)}`} fill="none" stroke="#4b5160" stroke-width="3" />
      {[30, 90, 150].map((a) => {
        const h = polar(GEAR_C, GEAR_R * 0.4, HAFT_UP + a);
        return <circle key={a} cx={h.x} cy={h.y} r="6" fill="#1a1c24" />;
      })}
      <circle cx={GEAR_C.x} cy={GEAR_C.y} r="13" fill="#3a3f4d" stroke="#1a1c24" stroke-width="3" />
      <circle cx={GEAR_C.x} cy={GEAR_C.y} r="4" fill="#9aa3b3" />
      <path class="axe-edge" d={ptsToPath(GEAR_RIM)} fill="none" stroke="#6ff3ff" stroke-width="3" stroke-linejoin="round" filter="url(#ra-glow)" />
      <path class="spark s1" d={`M${t1.x.toFixed(1)},${t1.y.toFixed(1)} l18,-14 l-6,16 l20,-10`} fill="none" stroke="#bff8ff" stroke-width="3" stroke-linejoin="round" />
      <path class="spark s2" d={`M${t5.x.toFixed(1)},${t5.y.toFixed(1)} l22,6 l-14,6 l18,10`} fill="none" stroke="#bff8ff" stroke-width="3" stroke-linejoin="round" />
      <path class="spark s3" d={`M${t3.x.toFixed(1)},${t3.y.toFixed(1)} l4,-22 l6,14 l10,-18`} fill="none" stroke="#bff8ff" stroke-width="3" stroke-linejoin="round" />
    </g>
  );
}

/** The robot: red robe with the cowl down, glowing blue eyes, a gear axe crackling with lightning, three jointed back arms. */
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
      {/* electric gear axe in the right hand */}
      <GearAxe />
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
