import { useEffect, useRef, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { ROBOT_BOARD, robotRing } from "../../shared/modes/robot.ts";
import { ACCESSORY_ART, AVATAR_ART } from "./avatar-art.tsx";
import connImg from "./robot/arm-connector.webp";
import segImg from "./robot/arm-segment.webp";
import socketImg from "./robot/arm-socket.webp";
import backdropImg from "./robot/backdrop.webp";
import bodyImg from "./robot/body.webp";
import emitterImg from "./robot/emitter.webp";
import reticleImg from "./robot/reticle.webp";
import reticleGlowImg from "./robot/reticle-glow.webp";
import doomedImg from "./robot/tile-doomed.webp";
import { TILE_ART } from "./robot/tiles.ts";
import { ROBOT_SKIN, SKIN_TEXT } from "./robot-skin.ts";

export const ARENA_W = 1200;
export const ARENA_H = 860;
const CX = ARENA_W / 2;
// why: the granite tiles in robot/tiles/ are pre-rendered for these values (and ROBOT_BOARD):
// changing any of them misplaces every tile. tests/robot-art.test.ts checks this.
const NEAR_EDGE_SCREEN_Y = 800;
const FAR_EDGE_SCREEN_Y = 360;
const FAR_ROW_EXTRA_DEPTH = 0.55;
const NEAR_EDGE_TILE_WIDTH = 84;

export const TILE = NEAR_EDGE_TILE_WIDTH;

const H0 = (NEAR_EDGE_SCREEN_Y - FAR_EDGE_SCREEN_Y) / (1 - 1 / (1 + FAR_ROW_EXTRA_DEPTH));
const HORIZON = NEAR_EDGE_SCREEN_Y - H0;
export const EDGE = 18;
const AVATARS_SHOWN_PER_TILE = 3;

export function project(columnFromLeft: number, rowFromRobot: number): { x: number; y: number; s: number } {
  const z = 1 + (FAR_ROW_EXTRA_DEPTH * (ROBOT_BOARD - rowFromRobot)) / ROBOT_BOARD;
  return { x: CX + ((columnFromLeft - ROBOT_BOARD / 2) * NEAR_EDGE_TILE_WIDTH) / z, y: HORIZON + H0 / z, s: 1 / z };
}

export const quad = (u: number, v: number) => {
  const pts = [project(u, v), project(u + 1, v), project(u + 1, v + 1), project(u, v + 1)];
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
};

// why: whole units, to match the pre-rendered tile images.
export function tileBox(u: number, v: number): { x: number; y: number; width: number; height: number } {
  const pts = [project(u, v), project(u + 1, v), project(u + 1, v + 1), project(u, v + 1)];
  const x = Math.floor(Math.min(...pts.map((p) => p.x)));
  const y = Math.floor(Math.min(...pts.map((p) => p.y)));
  return { x, y, width: Math.ceil(Math.max(...pts.map((p) => p.x))) - x, height: Math.ceil(Math.max(...pts.map((p) => p.y))) - y };
}

const RETICLE_INSET = 0.08;

export const reticleBox = (u: number, v: number) => {
  const near = 1 - RETICLE_INSET;
  const a = project(u + RETICLE_INSET, v + RETICLE_INSET);
  const b = project(u + near, v + near);
  const p0 = project(u + RETICLE_INSET, v + near);
  const p1 = project(u + near, v + RETICLE_INSET);
  const x = Math.min(a.x, p0.x);
  return { x, y: a.y, width: Math.max(p1.x, b.x) - x, height: b.y - a.y };
};

type Pt = { x: number; y: number };

const REST_EMITTER_TIPS: Pt[] = [
  { x: 230, y: 190 },
  { x: CX, y: 28 },
  { x: 970, y: 190 },
];

// why: the middle arm starts at the inner right shoulder port so it arcs over the hood.
const REST_ARMS: Pt[][] = [
  [
    { x: 458, y: 182 },
    { x: 441, y: 136.5 },
    { x: 412.9, y: 101.1 },
    { x: 377.1, y: 79 },
    { x: 339, y: 68.7 },
    { x: 302.7, y: 72.2 },
    { x: 271.8, y: 87.2 },
    { x: 249.5, y: 110 },
    { x: 235.8, y: 136.5 },
    { x: 231.1, y: 164 },
    REST_EMITTER_TIPS[0]!,
  ],
  [
    { x: 686, y: 151 },
    { x: 697, y: 124.5 },
    { x: 702.6, y: 98.4 },
    { x: 700.5, y: 73.6 },
    { x: 692, y: 52 },
    { x: 678.1, y: 35.3 },
    { x: 662.1, y: 22.9 },
    { x: 645.2, y: 14.3 },
    { x: 627.9, y: 12.8 },
    { x: 613, y: 19.8 },
    REST_EMITTER_TIPS[1]!,
  ],
  [
    { x: 738, y: 182 },
    { x: 755.2, y: 136.1 },
    { x: 783.7, y: 100.6 },
    { x: 820, y: 78.5 },
    { x: 858.4, y: 68.5 },
    { x: 895.1, y: 72.6 },
    { x: 926.3, y: 87.4 },
    { x: 949.5, y: 109.8 },
    { x: 964, y: 136.1 },
    { x: 969, y: 163.7 },
    REST_EMITTER_TIPS[2]!,
  ],
];
const ARM_SEGMENTS = REST_ARMS.map((pts) =>
  pts.slice(1).map((p, i) => ({ len: Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), ang: Math.atan2(p.y - pts[i]!.y, p.x - pts[i]!.x) })),
);
const SWAY_PERIOD_MS = 7000;
const SWAY_BEND_PER_JOINT_RAD = 0.03;
// why: the lag between joints makes the arm ripple instead of swinging stiffly.
const SWAY_JOINT_LAG_RAD = 0.35;
const ARM_PHASE = [0, 2.1, 4.2];

function armPose(k: number, swayMs: number | null): Pt[] {
  const rest = REST_ARMS[k]!;
  if (swayMs === null) return rest;
  const out = [rest[0]!];
  let bend = 0;
  ARM_SEGMENTS[k]!.forEach((seg, j) => {
    bend += SWAY_BEND_PER_JOINT_RAD * Math.sin((2 * Math.PI * swayMs) / SWAY_PERIOD_MS + ARM_PHASE[k]! + j * SWAY_JOINT_LAG_RAD);
    const prev = out[j]!;
    out.push({ x: prev.x + seg.len * Math.cos(seg.ang + bend), y: prev.y + seg.len * Math.sin(seg.ang + bend) });
  });
  return out;
}

export const prefersStill = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// why: it stops during an attack so the beams leave from where the emitters actually are.
interface SwayClock {
  pausedMs: number;
  frozenAt: number | null;
  frozenReal: number;
  seq: number | null;
}

function useSwayClock(attackSeq: number | null): SwayClock {
  const ref = useRef<SwayClock>({ pausedMs: 0, frozenAt: null, frozenReal: 0, seq: null });
  const c = ref.current;
  if (attackSeq !== c.seq) {
    const now = performance.now();
    if (c.frozenAt !== null) c.pausedMs += now - c.frozenReal;
    c.frozenAt = attackSeq === null ? null : now - c.pausedMs;
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
  inset?: number;
  collapsing?: number[];
  // why: seq keys the animation so every attack restarts it.
  attack?: { seq: number; hit: string[] } | null;
  me?: string | null;
  class?: string;
}) {
  const marked = new Set(props.marked);
  const hit = new Set(props.attack?.hit ?? []);
  const clock = useSwayClock(props.attack?.seq ?? null);
  const tips = [0, 1, 2].map((k) => armPose(k, prefersStill() ? null : clock.frozenAt).at(-1)!);
  return (
    <svg
      class={`robot-arena ${props.class ?? ""} ${props.attack ? "attacking" : ""}`}
      viewBox={`0 0 ${ARENA_W} ${ARENA_H}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="ra-eye" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#fff1e0" />
          <stop offset="0.4" stop-color="#ff3a2a" />
          <stop offset="1" stop-color="#ff3a2a" stop-opacity="0" />
        </radialGradient>
        <filter id="ra-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x={-ARENA_W} y={-ARENA_H} width={ARENA_W * 3} height={ARENA_H * 3} fill="#140a08" />
      <image href={backdropImg} x={BACKDROP.x} y={BACKDROP.y} width={BACKDROP.w} height={BACKDROP.h} preserveAspectRatio="none" />
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
  const clips = [];
  const xs = [];
  for (let v = 0; v < ROBOT_BOARD; v++) {
    for (let u = 0; u < ROBOT_BOARD; u++) {
      const i = v * ROBOT_BOARD + u;
      const gone = robotRing(i) < inset;
      const box = tileBox(u, v);
      if (collapsing.has(i)) {
        clips.push(
          <clipPath key={i} id={`ra-q${i}`}>
            <polygon points={quad(u, v)} />
          </clipPath>,
        );
        tiles.push(
          <g key={i} class={`tile-collapse ${gone ? "gone" : ""}`}>
            <image href={TILE_ART[i]} {...box} preserveAspectRatio="none" />
            <polygon points={quad(u, v)} class="tile-collapse-glow" />
            <image href={doomedImg} {...box} preserveAspectRatio="none" clip-path={`url(#ra-q${i})`} />
          </g>,
        );
        continue;
      }
      if (gone) continue;
      tiles.push(<image key={i} href={TILE_ART[i]} {...box} preserveAspectRatio="none" />);
      if (marked.has(i)) {
        const rb = reticleBox(u, v);
        xs.push(
          <g key={i} class="tile-x" style={{ animationDelay: `${((u * 7 + v * 13) % 10) * 25}ms` }}>
            <polygon points={quad(u, v)} class="tile-danger" />
            <image href={reticleGlowImg} class="reticle-glow" {...rb} preserveAspectRatio="none" />
            <image href={reticleImg} {...rb} preserveAspectRatio="none" />
          </g>,
        );
      }
    }
  }
  return (
    <g class="board">
      <polygon points={`${nl.x},${nl.y} ${nr.x},${nr.y} ${nr.x},${nr.y + EDGE} ${nl.x},${nl.y + EDGE}`} fill="#1a1412" />
      <defs>{clips}</defs>
      {tiles}
      <g class="reticles">{xs}</g>
      <polygon points={`${fl.x},${fl.y} ${fr.x},${fr.y} ${nr.x},${nr.y} ${nl.x},${nl.y}`} fill="none" stroke="#d88a3a" stroke-width="3" stroke-opacity="0.8" />
    </g>
  );
}

// why: far rows first, so nearer avatars overlap them.
export function Pieces({
  players,
  hit,
  me,
  zapDelay: zapDelayS,
}: {
  players: ArenaPlayer[];
  hit: Set<string>;
  me: string | null;
  zapDelay?: Map<string, number>;
}) {
  const byTile = new Map<number, ArenaPlayer[]>();
  for (const p of players) {
    const i = p.y * ROBOT_BOARD + p.x;
    const list = byTile.get(i) ?? [];
    const isMine = p.id === me;
    if (isMine) list.unshift(p);
    else list.push(p);
    byTile.set(i, list);
  }
  const out = [];
  for (const [i, list] of [...byTile].sort((a, b) => a[0] - b[0])) {
    const u = i % ROBOT_BOARD;
    const v = Math.floor(i / ROBOT_BOARD);
    const shown = list.slice(0, AVATARS_SHOWN_PER_TILE);
    const c = project(u + 0.5, v + 0.62);
    const size = NEAR_EDGE_TILE_WIDTH * 0.95 * c.s;
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
          <g
            key={p.id}
            class={`piece ${hit.has(p.id) ? "zapped" : ""} ${p.id === me ? "mine" : ""}`}
            style={{
              transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`,
              ...(zapDelayS?.has(p.id) ? { "--zap-delay": `${zapDelayS.get(p.id)!.toFixed(2)}s` } : {}),
            }}
          >
            <ellipse cx={size / 2} cy={size * 0.98} rx={size * 0.34} ry={size * 0.09} fill="rgba(0,0,0,0.45)" />
            {p.id === me && <ellipse class="mine-ring" cx={size / 2} cy={size * 0.98} rx={size * 0.46} ry={size * 0.14} />}
            <g transform={`scale(${size / 100})`}>
              {art()}
              {extra()}
            </g>
          </g>,
        );
      });
    if (list.length > AVATARS_SHOWN_PER_TILE) {
      out.push(
        <g key={`more-${i}`} class="stack-more" transform={`translate(${c.x + size * 0.55} ${c.y - size * 1.05})`}>
          <rect x={-2} y={-18 * c.s * 1.4} width={46 * c.s * 1.4} height={24 * c.s * 1.4} rx={10} />
          <text x={21 * c.s * 1.4 - 2} y={-1} font-size={18 * c.s * 1.4} text-anchor="middle">
            +{list.length - AVATARS_SHOWN_PER_TILE}
          </text>
        </g>,
      );
    }
  }
  return <g class="pieces">{out}</g>;
}

const nearestArm = (u: number) => (u < 4 ? 0 : u < 8 ? 1 : 2);

function Lasers({ marked, tips }: { marked: number[]; tips: Pt[] }) {
  return (
    <g class="lasers">
      {marked.map((i, n) => {
        const u = i % ROBOT_BOARD;
        const v = Math.floor(i / ROBOT_BOARD);
        const arm = nearestArm(u);
        const from = tips[arm]!;
        const to = project(u + 0.5, v + 0.5);
        const delay = `${(n % 12) * 40 + arm * 60}ms`;
        return (
          <g key={i} style={{ animationDelay: delay }} class="beam">
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} class="beam-glow" style={{ animationDelay: delay }} />
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} class="beam-core" style={{ animationDelay: delay }} />
            <ellipse
              cx={to.x}
              cy={to.y}
              rx={NEAR_EDGE_TILE_WIDTH * 0.35 * to.s}
              ry={NEAR_EDGE_TILE_WIDTH * 0.14 * to.s}
              class="scorch"
              style={{ animationDelay: delay }}
            />
          </g>
        );
      })}
    </g>
  );
}

const ARM_ROOT_THICKNESS = [34, 28, 34];
const TAPER = 0.933;
const armH = (k: number, j: number) => ARM_ROOT_THICKNESS[k]! * TAPER ** j;
const SEGMENT_PULLBACK_PER_THICKNESS = 0.15;
const CONNECTOR_OVERLAP_PER_THICKNESS = 0.45;
const CONNECTOR_WIDTH_PER_THICKNESS = 1.05;
const SOCKET_LENGTH_PER_THICKNESS = 1.4;
const SOCKET_WIDTH_PER_THICKNESS = 1.2;
const SOCKET_SHARE_BEHIND_PORT = 0.35;
const f1 = (n: number) => n.toFixed(1);
const deg = (y: number, x: number) => (Math.atan2(y, x) * 180) / Math.PI;

// why: mirrors layout() in the art build's arms.py; a connector under every joint covers the gap at any bend.
function MechArm({ pts, k }: { pts: Pt[]; k: number }) {
  const n = pts.length - 1;
  const segs = [];
  const cons = [];
  const S: Pt[] = [];
  const E: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    const g0 = i > 0 ? SEGMENT_PULLBACK_PER_THICKNESS * armH(k, i) : 0;
    const g1 = i < n - 1 ? SEGMENT_PULLBACK_PER_THICKNESS * armH(k, i + 1) : 0;
    const s = { x: a.x + dx * g0, y: a.y + dy * g0 };
    S.push(s);
    E.push({ x: b.x - dx * g1, y: b.y - dy * g1 });
    const h = armH(k, i);
    // why: flipped on arms running right to left, so the painted rim light stays on top.
    segs.push(
      <image
        key={`s${i}`}
        href={segImg}
        x="0"
        y={f1(-h / 2)}
        width={f1(len - g0 - g1)}
        height={f1(h)}
        preserveAspectRatio="none"
        transform={`translate(${f1(s.x)},${f1(s.y)}) rotate(${f1(deg(dy, dx))}) scale(1,${dx < 0 ? -1 : 1})`}
      />,
    );
  }
  for (let j = 1; j < n; j++) {
    const a = E[j - 1]!;
    const b = S[j]!;
    const h = armH(k, j);
    let vx = b.x - a.x;
    let vy = b.y - a.y;
    const d = Math.hypot(vx, vy);
    const foldedFlat = d < 1e-3;
    if (foldedFlat) {
      // why: with no gap to span, the connector lies along the bisector of the two segments.
      const p0 = pts[j - 1]!;
      const p1 = pts[j]!;
      const p2 = pts[j + 1]!;
      const l0 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const l1 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      vx = (p1.x - p0.x) / l0 + (p2.x - p1.x) / l1;
      vy = (p1.y - p0.y) / l0 + (p2.y - p1.y) / l1;
    }
    const len = d + 2 * CONNECTOR_OVERLAP_PER_THICKNESS * h;
    const w = CONNECTOR_WIDTH_PER_THICKNESS * h;
    cons.push(
      <image
        key={`c${j}`}
        href={connImg}
        x={f1(-len / 2)}
        y={f1(-w / 2)}
        width={f1(len)}
        height={f1(w)}
        preserveAspectRatio="none"
        transform={`translate(${f1((a.x + b.x) / 2)},${f1((a.y + b.y) / 2)}) rotate(${f1(deg(vy, vx))}) scale(1,${vx < 0 ? -1 : 1})`}
      />,
    );
  }
  // why: segments root to tip, so each one's brass band overlaps the last one's end.
  return (
    <g class="mech-arm">
      {cons}
      {segs}
    </g>
  );
}

// why: it follows the rest pose, so it stays still while the arm sways.
function ArmSocket({ k }: { k: number }) {
  const p0 = REST_ARMS[k]![0]!;
  const p1 = REST_ARMS[k]![1]!;
  const len = SOCKET_LENGTH_PER_THICKNESS * ARM_ROOT_THICKNESS[k]!;
  const w = SOCKET_WIDTH_PER_THICKNESS * ARM_ROOT_THICKNESS[k]!;
  const a = (ARM_SEGMENTS[k]![0]!.ang * 180) / Math.PI;
  return (
    <image
      href={socketImg}
      x={f1(-SOCKET_SHARE_BEHIND_PORT * len)}
      y={f1(-w / 2)}
      width={f1(len)}
      height={f1(w)}
      preserveAspectRatio="none"
      transform={`translate(${p0.x},${p0.y}) rotate(${f1(a)}) scale(1,${p1.x < p0.x ? -1 : 1})`}
    />
  );
}

const EMITTER_R = 40;

function Emitter({ at, attacking }: { at: Pt; attacking: boolean }) {
  return (
    <g class={`emitter ${attacking ? "firing" : ""}`}>
      <image href={emitterImg} x={at.x - EMITTER_R} y={at.y - EMITTER_R} width={EMITTER_R * 2} height={EMITTER_R * 2} />
      <circle cx={at.x} cy={at.y} r="13" class="emitter-core" filter="url(#ra-glow)" />
    </g>
  );
}

// why: wider than the arena so it fills a wide projector's letterbox.
export const BACKDROP = { x: -300, y: -100, w: 1800, h: 1012.5 };
// why: the pedestal runs just past the bottom edge, so the robot stands in the pit.
const BODY = { x: 180, y: 50, size: 840 };
const BODY_SOURCE_PX = 1024;
const bodyPt = (px: number, py: number): Pt => ({ x: BODY.x + (px / BODY_SOURCE_PX) * BODY.size, y: BODY.y + (py / BODY_SOURCE_PX) * BODY.size });
const bodyLen = (px: number) => (px / BODY_SOURCE_PX) * BODY.size;
const OPTICS_SOURCE_PX = [{ x: 509, y: 116, r: 11 }];
const OPTICS = OPTICS_SOURCE_PX.map((o) => ({ ...bodyPt(o.x, o.y), r: bodyLen(o.r) }));

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
  const t = still ? null : (clock.frozenAt ?? performance.now() - clock.pausedMs);
  const arms = [0, 1, 2].map((k) => armPose(k, t));
  return (
    <g class={`robot ${attacking ? "attacking" : ""}`}>
      {arms.map((pts, k) => (
        <MechArm key={k} pts={pts} k={k} />
      ))}
      <image href={bodyImg} x={BODY.x} y={BODY.y} width={BODY.size} height={BODY.size} />
      {[0, 1, 2].map((k) => (
        <ArmSocket key={k} k={k} />
      ))}
      {OPTICS.map((o, i) => (
        <circle key={i} class="eye-halo" cx={o.x} cy={o.y} r={o.r * 2.9} fill="url(#ra-eye)" opacity="0.55" />
      ))}
      <g class="eyes" filter="url(#ra-glow)">
        {OPTICS.map((o, i) => (
          <circle key={i} cx={o.x} cy={o.y} r={o.r * 0.75} fill="#ff3a2a" />
        ))}
      </g>
      {arms.map((pts, k) => (
        <Emitter key={k} at={pts.at(-1)!} attacking={attacking} />
      ))}
    </g>
  );
}

const MINI_RADIUS = 3;

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
  // why: the board slides under a fixed window so the player stays centered.
  const shift = { x: (MINI_RADIUS - me.x) * cell, y: (MINI_RADIUS - me.y) * cell };
  return (
    <svg class={`mini-board ${ROBOT_SKIN}`} viewBox={`0 0 ${span} ${span}`} role="img" aria-label={`You are on column ${me.x + 1}, row ${me.y + 1}`}>
      <clipPath id="mini-window">
        <rect x={0} y={0} width={span} height={span} rx={2} />
      </clipPath>
      <rect x={0} y={0} width={span} height={span} rx={2} class="mini-void" />
      <g clip-path="url(#mini-window)">
        <g class="mini-scroll" style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}>
          <rect x={edge} y={edge - cell} width={size} height={cell - 1.5} class="mini-robot-edge" />
          {/* why: repeated so one is always inside the window. */}
          {Array.from({ length: ROBOT_BOARD / 2 }, (_, k) => 2 * k + 1)
            .filter((u) => u >= inset && u <= ROBOT_BOARD - inset)
            .map((u) => (
              <text key={u} x={u * cell} y={edge - 2.4} text-anchor="middle" class="mini-robot-label">
                {SKIN_TEXT.emoji}
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
