// why: the rig and timing mirror scripts/snowman-art/rig.py and timeline.py so the live sweep matches the reference animation.
import { useEffect, useRef, useState } from "preact/hooks";
import { ROBOT_BOARD, robotRing } from "../../shared/modes/robot.ts";
import type { ArenaPlayer } from "./robot-art.tsx";
import { ARENA_H, ARENA_W, BACKDROP, EDGE, Pieces, prefersStill, project, quad, TILE, tileBox } from "./robot-art.tsx";
import elbowImg from "./snowman/arm-elbow.webp";
import foreImg from "./snowman/arm-fore.webp";
import shoulderImg from "./snowman/arm-shoulder.webp";
import upperImg from "./snowman/arm-upper.webp";
import backdropImg from "./snowman/backdrop.webp";
import clawDistImg from "./snowman/claw-dist.webp";
import clawProxImg from "./snowman/claw-prox.webp";
import eyeGlowImg from "./snowman/eye-glow.webp";
import frostHitImg from "./snowman/fx-frost-hit.webp";
import sprayImg from "./snowman/fx-snow-spray.webp";
import palmImg from "./snowman/hand-palm.webp";
import bodyImg from "./snowman/snowman-body.webp";
import hatImg from "./snowman/snowman-hat.webp";
import headImg from "./snowman/snowman-head.webp";
import scarfImg from "./snowman/snowman-scarf.webp";
import thumbImg from "./snowman/thumb.webp";
import doomedImg from "./snowman/tile-doomed.webp";
import { TILE_ART } from "./snowman/tiles.ts";

type Pt = { x: number; y: number };

const UPPER_ARM_THICKNESS = 40;
const UPPER_ARM_LENGTH = 180;
const FOREARM_LENGTH = 160;
const MIRROR_X = ARENA_W / 2;
const RIGHT_SHOULDER_PIVOT: Pt = { x: 670.3855619360131, y: 321.5422477440525 };

export const RS = RIGHT_SHOULDER_PIVOT;

const CLAW_SPREAD_AT_UNIT_SCALE_DEG = 22;
const CLAW_LENGTH_SCALES = [1.0, 1.08, 0.95];

interface Hand {
  knuckleCurlDeg: number;
  tipCurlDeg: number;
  spread: number;
  thumbClose: number;
}
export const POSE: Record<"open" | "half" | "closed" | "grasp", Hand> = {
  open: { knuckleCurlDeg: 0, tipCurlDeg: 0, spread: 1.3, thumbClose: 0 },
  half: { knuckleCurlDeg: 30, tipCurlDeg: 35, spread: 1.0, thumbClose: 0.45 },
  closed: { knuckleCurlDeg: 65, tipCurlDeg: 80, spread: 0.55, thumbClose: 1.0 },
  grasp: { knuckleCurlDeg: 40, tipCurlDeg: 55, spread: 0.75, thumbClose: 0.7 },
};

interface Arm {
  shoulder: number;
  elbow: number;
  wrist: number;
  hand: Hand;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixHand = (p: Hand, q: Hand, t: number): Hand => ({
  knuckleCurlDeg: lerp(p.knuckleCurlDeg, q.knuckleCurlDeg, t),
  tipCurlDeg: lerp(p.tipCurlDeg, q.tipCurlDeg, t),
  spread: lerp(p.spread, q.spread, t),
  thumbClose: lerp(p.thumbClose, q.thumbClose, t),
});
const mixArm = (a: Arm, b: Arm, t: number): Arm => ({
  shoulder: lerp(a.shoulder, b.shoulder, t),
  elbow: lerp(a.elbow, b.elbow, t),
  wrist: lerp(a.wrist, b.wrist, t),
  hand: mixHand(a.hand, b.hand, t),
});
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const at = (p: Pt, d: number, len: number): Pt => ({ x: p.x + len * Math.cos(rad(d)), y: p.y + len * Math.sin(rad(d)) });
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const wrapDegrees = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const ease = (t: number) => {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
};
const easeIn = (t: number) => {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x;
};

function solveRaisedElbow(S: Pt, T: Pt): { shoulder: number; elbow: number } {
  const d = Math.min(Math.max(dist(S, T), Math.abs(UPPER_ARM_LENGTH - FOREARM_LENGTH) + 1), UPPER_ARM_LENGTH + FOREARM_LENGTH - 1e-3);
  const base = deg(Math.atan2(T.y - S.y, T.x - S.x));
  const a = deg(Math.acos((UPPER_ARM_LENGTH * UPPER_ARM_LENGTH + d * d - FOREARM_LENGTH * FOREARM_LENGTH) / (2 * UPPER_ARM_LENGTH * d)));
  const s = base - a;
  const E = at(S, s, UPPER_ARM_LENGTH);
  return { shoulder: s, elbow: wrapDegrees(deg(Math.atan2(T.y - E.y, T.x - E.x)) - s) };
}

type PieceName = "upper" | "fore" | "elbow" | "thumb" | "palm" | "prox" | "dist" | "shoulder";
const PIECE_ART: Record<PieceName, string> = {
  upper: upperImg,
  fore: foreImg,
  elbow: elbowImg,
  thumb: thumbImg,
  palm: palmImg,
  prox: clawProxImg,
  dist: clawDistImg,
  shoulder: shoulderImg,
};
const HEIGHT_PER_WIDTH = { thumb: 34 / 112, dist: 51 / 128, shoulder: 150 / 192 };

interface Op {
  name: PieceName;
  x: number;
  y: number;
  deg: number;
  flip: boolean;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

// why: twig pieces flip so the snow stays on top; claws never do.
function seg(name: PieceName, A: Pt, B: Pt, thick: number): Op {
  const len = dist(A, B);
  const d = deg(Math.atan2(B.y - A.y, B.x - A.x));
  const h = name === "dist" || name === "thumb" ? len * HEIGHT_PER_WIDTH[name] : thick;
  return { name, x: A.x, y: A.y, deg: d, flip: (name === "upper" || name === "fore") && Math.cos(rad(d)) < 0, ox: 0, oy: -h / 2, w: len, h };
}

export function layout(S: Pt, arm: Arm): { ops: Op[]; tip: Pt } {
  const { knuckleCurlDeg: kc, tipCurlDeg: tc, spread: sp, thumbClose: th } = arm.hand;
  const E = at(S, arm.shoulder, UPPER_ARM_LENGTH);
  const fa = arm.shoulder + arm.elbow;
  const W = at(E, fa, FOREARM_LENGTH);
  const h = fa + arm.wrist;
  const n = { x: -Math.sin(rad(h)), y: Math.cos(rad(h)) };
  const ops: Op[] = [seg("upper", S, E, UPPER_ARM_THICKNESS), seg("fore", E, W, UPPER_ARM_THICKNESS * 0.8)];
  const knot = UPPER_ARM_THICKNESS * 1.3;
  ops.push({ name: "elbow", x: E.x, y: E.y, deg: 0, flip: false, ox: -knot / 2, oy: -knot / 2, w: knot, h: knot });
  // why: the thumb's base starts inside the palm, so it never looks detached.
  const t0 = at(W, h, UPPER_ARM_THICKNESS * 0.2);
  const T0 = { x: t0.x + n.x * UPPER_ARM_THICKNESS * 0.12, y: t0.y + n.y * UPPER_ARM_THICKNESS * 0.12 };
  const ta = h + 62 - th * 55;
  ops.push(seg("thumb", at(T0, ta, -UPPER_ARM_THICKNESS * 0.3), at(T0, ta, UPPER_ARM_THICKNESS * 0.85), UPPER_ARM_THICKNESS * 0.42));
  ops.push(seg("palm", at(W, h, -UPPER_ARM_THICKNESS * 0.25), at(W, h, UPPER_ARM_THICKNESS * 1.45), UPPER_ARM_THICKNESS * 0.95));
  const F = at(W, h, UPPER_ARM_THICKNESS * 1.2);
  const MIDDLE_CLAW = 1;
  let middleClawTip = F;
  for (let i = 0; i < 3; i++) {
    const o = (i - 1) * UPPER_ARM_THICKNESS * 0.3 * Math.min(sp, 1.1);
    const B0 = { x: F.x + n.x * o, y: F.y + n.y * o };
    const ls = CLAW_LENGTH_SCALES[i]!;
    const a1 = h + (i - 1) * CLAW_SPREAD_AT_UNIT_SCALE_DEG * sp + kc;
    const M1 = at(B0, a1, UPPER_ARM_THICKNESS * 0.85 * ls);
    const a2 = a1 + tc;
    const end = at(M1, a2, UPPER_ARM_THICKNESS * 1.15 * ls);
    ops.push(seg("prox", at(B0, a1, -UPPER_ARM_THICKNESS * 0.1), at(M1, a1, UPPER_ARM_THICKNESS * 0.08), UPPER_ARM_THICKNESS * 0.32 * ls));
    ops.push(seg("dist", M1, end, UPPER_ARM_THICKNESS * 0.32 * ls));
    if (i === MIDDLE_CLAW) middleClawTip = end;
  }
  return { ops, tip: middleClawTip };
}

function shoulderOp(arm: Arm): Op {
  const w = UPPER_ARM_THICKNESS * 1.55;
  const h = w * HEIGHT_PER_WIDTH.shoulder;
  return { name: "shoulder", x: RIGHT_SHOULDER_PIVOT.x, y: RIGHT_SHOULDER_PIVOT.y, deg: arm.shoulder, flip: false, ox: -0.42 * w, oy: -h / 2, w, h };
}

const mirrorOp = (o: Op): Op => ({ ...o, x: 2 * MIRROR_X - o.x, deg: 180 - o.deg, flip: !o.flip });
const mirrorPt = (p: Pt): Pt => ({ x: 2 * MIRROR_X - p.x, y: p.y });

const f1 = (n: number) => n.toFixed(1);

function Ops({ ops }: { ops: Op[] }) {
  return (
    <>
      {ops.map((o, i) => (
        <image
          key={i}
          href={PIECE_ART[o.name]}
          x={f1(o.ox)}
          y={f1(o.oy)}
          width={f1(o.w)}
          height={f1(o.h)}
          preserveAspectRatio="none"
          transform={`translate(${f1(o.x)},${f1(o.y)}) rotate(${f1(o.deg)}) scale(1,${o.flip ? -1 : 1})`}
        />
      ))}
    </>
  );
}

const armOps = (side: Side, arm: Arm) => {
  const ops = layout(RIGHT_SHOULDER_PIVOT, arm).ops;
  return side === "R" ? ops : ops.map(mirrorOp);
};
const clumpOp = (side: Side, arm: Arm) => (side === "R" ? shoulderOp(arm) : mirrorOp(shoulderOp(arm)));

type Side = "L" | "R";
const SIDES: Side[] = ["L", "R"];

// why: every idle term is a sine of this period, so the idle loops.
const IDLE_PERIOD_S = 4;

interface Pose {
  arms: Record<Side, Arm>;
  headDy: number;
  breathe: number;
  eyeGlow: number;
}

function idle(t: number): Pose {
  const w = (2 * Math.PI * t) / IDLE_PERIOD_S;
  const R: Arm = {
    shoulder: 4 * Math.sin(w),
    elbow: -60 + 6 * Math.sin(w + 0.9),
    wrist: 15 + 5 * Math.sin(2 * w + 0.4),
    hand: mixHand(POSE.half, POSE.closed, 0.25 + 0.25 * Math.sin(2 * w)),
  };
  const L: Arm = {
    shoulder: -5 + 4 * Math.sin(w + 2.1),
    elbow: -60 + 6 * Math.sin(w + 3.0),
    wrist: 15 + 5 * Math.sin(2 * w + 2.5),
    hand: mixHand(POSE.open, POSE.half, 0.3 + 0.3 * Math.sin(2 * w + 1.7)),
  };
  R.hand = { ...R.hand, tipCurlDeg: R.hand.tipCurlDeg + 8 * Math.sin(4 * w) };
  L.hand = { ...L.hand, tipCurlDeg: L.hand.tipCurlDeg + 8 * Math.sin(4 * w + 1.3) };
  return { arms: { L, R }, headDy: -2 * Math.sin(w), breathe: 0.006 * (1 + Math.sin(w)), eyeGlow: 0.75 + 0.25 * Math.sin(2 * w) };
}

const SWEEP_TIMELINE_S = { windup: 0.45, reach: 0.8, sweepEnd: 1.7, close: 1.95, back: 2.75 };
const RAKE_START_HAND_DEG = 108;
const TILE_SWEEP_S = 0.8;
const CRACK_LEAD_S = 0.35;

interface Rake {
  u0: number;
  u1: number;
  v: number;
}

export const boardPt = (u: number, v: number): Pt => project(u, v);

function tipOffset(h: number, hand: Hand): Pt {
  const W = { x: UPPER_ARM_LENGTH + FOREARM_LENGTH, y: 0 };
  const tip = layout({ x: 0, y: 0 }, { shoulder: 0, elbow: 0, wrist: h, hand }).tip;
  return { x: tip.x - W.x, y: tip.y - W.y };
}

export function armForTip(P: Pt, h: number, hand: Hand): Arm {
  const o = tipOffset(h, hand);
  const { shoulder, elbow } = solveRaisedElbow(RIGHT_SHOULDER_PIVOT, { x: P.x - o.x, y: P.y - o.y });
  return { shoulder, elbow, wrist: wrapDegrees(h - (shoulder + elbow)), hand };
}

const WINDUP_POSE: Arm = { shoulder: -30, elbow: -70, wrist: -25, hand: POSE.open };

function rakeArm(attackElapsedS: number, r: Rake, rest: Arm): { arm: Arm; eye: number } {
  if (attackElapsedS < SWEEP_TIMELINE_S.windup) {
    const f = ease(attackElapsedS / SWEEP_TIMELINE_S.windup);
    return { arm: mixArm(rest, WINDUP_POSE, f), eye: lerp(0.75, 1.6, f) };
  }
  if (attackElapsedS < SWEEP_TIMELINE_S.reach) {
    const start = armForTip(boardPt(r.u0, r.v), RAKE_START_HAND_DEG, POSE.open);
    return {
      arm: mixArm(WINDUP_POSE, start, easeIn((attackElapsedS - SWEEP_TIMELINE_S.windup) / (SWEEP_TIMELINE_S.reach - SWEEP_TIMELINE_S.windup))),
      eye: 1.6,
    };
  }
  if (attackElapsedS < SWEEP_TIMELINE_S.sweepEnd) {
    const f = (attackElapsedS - SWEEP_TIMELINE_S.reach) / (SWEEP_TIMELINE_S.sweepEnd - SWEEP_TIMELINE_S.reach);
    const u = lerp(r.u0, r.u1, ease(f));
    return {
      arm: armForTip(boardPt(u, r.v + 0.15 * Math.sin(Math.PI * f)), RAKE_START_HAND_DEG - 18 * ease(f), mixHand(POSE.open, POSE.grasp, ease(f))),
      eye: 1.6,
    };
  }
  const end = boardPt(r.u1, r.v);
  if (attackElapsedS < SWEEP_TIMELINE_S.close) {
    const f = ease((attackElapsedS - SWEEP_TIMELINE_S.sweepEnd) / (SWEEP_TIMELINE_S.close - SWEEP_TIMELINE_S.sweepEnd));
    return { arm: armForTip({ x: end.x, y: end.y - 40 * f }, RAKE_START_HAND_DEG - 18 + 10 * f, mixHand(POSE.grasp, POSE.closed, f)), eye: lerp(1.6, 1.2, f) };
  }
  if (attackElapsedS < SWEEP_TIMELINE_S.back) {
    const f = ease((attackElapsedS - SWEEP_TIMELINE_S.close) / (SWEEP_TIMELINE_S.back - SWEEP_TIMELINE_S.close));
    const last = armForTip({ x: end.x, y: end.y - 40 }, RAKE_START_HAND_DEG - 8, POSE.closed);
    return { arm: mixArm(last, rest, f), eye: lerp(1.2, 0.75, f) };
  }
  return { arm: rest, eye: 0.75 };
}

function rakeTipOverBoard(attackElapsedS: number, r: Rake): Pt | null {
  if (attackElapsedS < SWEEP_TIMELINE_S.reach || attackElapsedS > SWEEP_TIMELINE_S.sweepEnd + 0.02) return null;
  return layout(RIGHT_SHOULDER_PIVOT, rakeArm(Math.min(attackElapsedS, SWEEP_TIMELINE_S.sweepEnd - 1e-3), r, idle(0).arms.R).arm).tip;
}

export function contactTime(r: Rake, u: number): number {
  const target = Math.min(Math.max((r.u0 - (u + 0.5)) / (r.u0 - r.u1), 0), 1);
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    if (ease(m) < target) lo = m;
    else hi = m;
  }
  return SWEEP_TIMELINE_S.reach + lo * (SWEEP_TIMELINE_S.sweepEnd - SWEEP_TIMELINE_S.reach);
}

function tileMotion(ageS: number): { dx: number; dy: number; rot: number; alpha: number } {
  const a = ageS / TILE_SWEEP_S;
  return {
    dx: -95 * ease(a / 0.7),
    dy: -16 * Math.sin(Math.PI * Math.min(a / 0.45, 1)) + 300 * Math.max(0, a - 0.35) ** 2,
    rot: 55 * easeIn(a),
    alpha: 1 - ease((a - 0.55) / 0.45),
  };
}

const half = ROBOT_BOARD / 2;
const sideOf = (u: number): Side => (u < half ? "L" : "R");
const columnInRightArmSpace = (u: number) => (u < half ? ROBOT_BOARD - 1 - u : u);

interface Plan {
  rakes: Partial<Record<Side, Rake>>;
  contact: Map<number, number>;
}

export function planAttack(marked: number[], players: ArenaPlayer[], hit: Set<string>): Plan {
  const rakes: Partial<Record<Side, Rake>> = {};
  const contact = new Map<number, number>();
  for (const side of SIDES) {
    const tiles = marked.filter((i) => sideOf(i % ROBOT_BOARD) === side);
    if (tiles.length === 0) continue;
    const cols = tiles.map((i) => columnInRightArmSpace(i % ROBOT_BOARD));
    const rows = tiles.map((i) => Math.floor(i / ROBOT_BOARD));
    const u0 = Math.min(Math.max(...cols) + 0.9, ROBOT_BOARD - 0.1);
    const u1 = Math.min(Math.min(...cols) - 0.3, u0 - 1.2);
    // why: the rake runs through the players it hits, kept where the arm reaches every column.
    const hitRows = players.filter((p) => hit.has(p.id) && sideOf(p.x) === side).map((p) => p.y);
    const band = hitRows.length > 0 ? hitRows : rows;
    const lo = Math.min(...rows) + 0.6;
    const hi = Math.max(lo, Math.min(5.5, Math.max(...rows) + 0.4));
    const v = Math.min(Math.max(band.reduce((a, b) => a + b, 0) / band.length + 0.5, lo), hi);
    const r = { u0, u1, v };
    rakes[side] = r;
    for (const i of tiles) contact.set(i, contactTime(r, columnInRightArmSpace(i % ROBOT_BOARD)));
  }
  return { rakes, contact };
}

function useFrame(on: boolean): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const loop = () => {
      tick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return performance.now();
}

// why: the idle clock stops for each attack, so the rake starts from and returns to the snowman's pose.
interface Clock {
  offset: number;
  frozenAt: number | null;
  seq: number | null;
  attackStart: number;
}

function useClock(attackSeq: number | null): Clock {
  const ref = useRef<Clock>({ offset: 0, frozenAt: null, seq: null, attackStart: 0 });
  const c = ref.current;
  if (attackSeq !== c.seq) {
    const now = performance.now();
    if (c.frozenAt !== null) c.offset += now - c.attackStart;
    c.frozenAt = attackSeq === null ? null : now - c.offset;
    c.attackStart = now;
    c.seq = attackSeq;
  }
  return c;
}

function frame(clock: Clock, plan: Plan | null, nowMs: number, still: boolean): { pose: Pose; t: number | null; over: Set<Side> } {
  const t = plan ? (still ? SWEEP_TIMELINE_S.back + 0.1 : (nowMs - clock.attackStart) / 1000) : null;
  const pose = idle(still ? 0 : ((clock.frozenAt ?? nowMs - clock.offset) / 1000) % IDLE_PERIOD_S);
  const over = new Set<Side>();
  if (plan && t !== null) {
    let eye: number | null = null;
    for (const side of SIDES) {
      const r = plan.rakes[side];
      if (!r) continue;
      const res = rakeArm(t, r, pose.arms[side]);
      pose.arms = { ...pose.arms, [side]: res.arm };
      eye = Math.max(eye ?? 0, res.eye);
      if (t > SWEEP_TIMELINE_S.windup && t < SWEEP_TIMELINE_S.back) over.add(side);
    }
    if (eye !== null) pose.eyeGlow = eye;
  }
  return { pose, t, over };
}

const SNOWMAN_LAYER_RECT = { x: 464.1509433962264, y: 40, w: 271.6981132075472, h: 600 };
const EYES: Pt[] = [
  { x: 586.2182116488925, y: 197.01394585726007 },
  { x: 639.8687448728466, y: 197.5061525840853 },
];

export function SnowmanArena(props: {
  players: ArenaPlayer[];
  marked: number[];
  inset?: number;
  collapsing?: number[];
  attack?: { seq: number; hit: string[] } | null;
  me?: string | null;
  class?: string;
}) {
  const hit = new Set(props.attack?.hit ?? []);
  const seq = props.attack?.seq ?? null;
  const clock = useClock(seq);
  const planRef = useRef<{ seq: number | null; plan: Plan | null }>({ seq: null, plan: null });
  if (planRef.current.seq !== seq) planRef.current = { seq, plan: props.attack ? planAttack(props.marked, props.players, hit) : null };
  const plan = planRef.current.plan;
  const zapDelay = new Map<string, number>();
  if (plan) {
    for (const p of props.players) {
      const c = plan.contact.get(p.y * ROBOT_BOARD + p.x);
      if (hit.has(p.id) && c !== undefined) zapDelay.set(p.id, c);
    }
  }
  const collapsing = new Set(props.collapsing ?? []);
  return (
    <svg
      class={`robot-arena snowman ${props.class ?? ""} ${props.attack ? "attacking" : ""}`}
      viewBox={`0 0 ${ARENA_W} ${ARENA_H}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <filter id="sa-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <rect x={-ARENA_W} y={-ARENA_H} width={ARENA_W * 3} height={ARENA_H * 3} fill="#060a14" />
      <image href={backdropImg} x={BACKDROP.x} y={BACKDROP.y} width={BACKDROP.w} height={BACKDROP.h} preserveAspectRatio="none" />
      <Snowman clock={clock} plan={plan} />
      <SnowBoard marked={new Set(props.marked)} inset={props.inset ?? 0} collapsing={collapsing} attacking={!!plan} />
      {plan && <SweptTiles key={seq} clock={clock} plan={plan} marked={props.marked} collapsing={collapsing} />}
      <Pieces players={props.players} hit={hit} me={props.me ?? null} zapDelay={zapDelay} />
      {plan && <SweepFx key={seq} clock={clock} plan={plan} players={props.players} hit={hit} />}
    </svg>
  );
}

function Snowman({ clock, plan }: { clock: Clock; plan: Plan | null }) {
  const still = prefersStill();
  const now = useFrame(!still);
  const { pose, over } = frame(clock, plan, now, still);
  const b = pose.breathe;
  const lift = pose.headDy - SNOWMAN_LAYER_RECT.h * b;
  const behind = SIDES.filter((s) => !over.has(s));
  const r = 13 * (0.8 + 0.4 * pose.eyeGlow);
  return (
    <g class="snowman">
      <image
        href={bodyImg}
        x={f1(SNOWMAN_LAYER_RECT.x - (SNOWMAN_LAYER_RECT.w * b) / 2)}
        y={f1(SNOWMAN_LAYER_RECT.y - SNOWMAN_LAYER_RECT.h * b)}
        width={f1(SNOWMAN_LAYER_RECT.w * (1 + b))}
        height={f1(SNOWMAN_LAYER_RECT.h * (1 + b))}
        preserveAspectRatio="none"
      />
      {behind.map((s) => (
        <Ops key={s} ops={armOps(s, pose.arms[s])} />
      ))}
      <image
        href={headImg}
        x={SNOWMAN_LAYER_RECT.x}
        y={f1(SNOWMAN_LAYER_RECT.y + lift)}
        width={SNOWMAN_LAYER_RECT.w}
        height={SNOWMAN_LAYER_RECT.h}
        preserveAspectRatio="none"
      />
      <image
        href={hatImg}
        x={SNOWMAN_LAYER_RECT.x}
        y={f1(SNOWMAN_LAYER_RECT.y + lift)}
        width={SNOWMAN_LAYER_RECT.w}
        height={SNOWMAN_LAYER_RECT.h}
        preserveAspectRatio="none"
      />
      <image
        href={scarfImg}
        x={SNOWMAN_LAYER_RECT.x}
        y={f1(SNOWMAN_LAYER_RECT.y + 0.4 * pose.headDy - SNOWMAN_LAYER_RECT.h * b)}
        width={SNOWMAN_LAYER_RECT.w}
        height={SNOWMAN_LAYER_RECT.h}
        preserveAspectRatio="none"
      />
      <Ops ops={SIDES.map((s) => clumpOp(s, pose.arms[s]))} />
      <g class="snowman-eyes" opacity={Math.min(1, 0.5 + 0.5 * pose.eyeGlow).toFixed(2)}>
        {EYES.map((e, i) => (
          <image key={i} href={eyeGlowImg} x={f1(e.x - r)} y={f1(e.y + lift - r)} width={f1(2 * r)} height={f1(2 * r)} />
        ))}
      </g>
    </g>
  );
}

function SnowBoard({ marked, inset, collapsing, attacking }: { marked: Set<number>; inset: number; collapsing: Set<number>; attacking: boolean }) {
  const far = inset;
  const near = ROBOT_BOARD - inset;
  const fl = project(far, far);
  const fr = project(near, far);
  const nl = project(far, near);
  const nr = project(near, near);
  const tiles = [];
  const clips = [];
  const marks = [];
  for (let v = 0; v < ROBOT_BOARD; v++) {
    for (let u = 0; u < ROBOT_BOARD; u++) {
      const i = v * ROBOT_BOARD + u;
      const gone = robotRing(i) < inset;
      if (gone) continue;
      const box = tileBox(u, v);
      if (collapsing.has(i)) {
        clips.push(
          <clipPath key={i} id={`sa-q${i}`}>
            <polygon points={quad(u, v)} />
          </clipPath>,
        );
        tiles.push(
          <g key={i} class="tile-collapse">
            <image href={TILE_ART[i]} {...box} preserveAspectRatio="none" />
            <polygon points={quad(u, v)} class="tile-collapse-glow" />
            <image href={doomedImg} {...box} preserveAspectRatio="none" clip-path={`url(#sa-q${i})`} />
          </g>,
        );
        continue;
      }
      tiles.push(<image key={i} href={TILE_ART[i]} {...box} preserveAspectRatio="none" />);
      if (marked.has(i) && !attacking) marks.push(<FrostTarget key={i} u={u} v={v} />);
    }
  }
  return (
    <g class="board">
      <polygon points={`${nl.x},${nl.y} ${nr.x},${nr.y} ${nr.x},${nr.y + EDGE} ${nl.x},${nl.y + EDGE}`} fill="#16202e" />
      <defs>{clips}</defs>
      {tiles}
      <g class="reticles">{marks}</g>
      <polygon points={`${fl.x},${fl.y} ${fr.x},${fr.y} ${nr.x},${nr.y} ${nl.x},${nl.y}`} fill="none" stroke="#aacdeb" stroke-width="3" stroke-opacity="0.8" />
    </g>
  );
}

const SNOWFLAKE: [number, number, number, number][] = (() => {
  const R = 0.4;
  const segs: [number, number, number, number][] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 + Math.PI / 6;
    const at = (r: number, da = 0) => [0.5 + r * Math.cos(a + da), 0.5 + r * Math.sin(a + da)] as const;
    segs.push([0.5, 0.5, ...at(R)]);
    for (const [r, len] of [
      [0.17, 0.11],
      [0.28, 0.08],
    ]) {
      const [bx, by] = at(r);
      for (const side of [-1, 1]) {
        const b = a + (side * Math.PI) / 3;
        segs.push([bx, by, bx + len * Math.cos(b), by + len * Math.sin(b)]);
      }
    }
  }
  return segs;
})();

function snowflakePath(u: number, v: number): string {
  const pt = (x: number, y: number) => {
    const p = project(u + x, v + y);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  };
  return SNOWFLAKE.map(([x0, y0, x1, y1]) => `M${pt(x0, y0)}L${pt(x1, y1)}`).join("");
}

// why: the heavy black outline keeps the white snowflake readable against the snow.
function FrostTarget({ u, v }: { u: number; v: number }) {
  const d = snowflakePath(u, v);
  const s = project(u + 0.5, v + 0.5).s;
  return (
    <g class="tile-x" style={{ animationDelay: `${((u * 7 + v * 13) % 10) * 25}ms` }}>
      <polygon points={quad(u, v)} class="tile-danger" />
      <path d={d} fill="none" stroke="#000" stroke-width={(11 * s).toFixed(1)} stroke-linecap="round" stroke-linejoin="round" />
      <path d={d} fill="none" stroke="#fff" stroke-width={(4.5 * s).toFixed(1)} stroke-linecap="round" stroke-linejoin="round" />
    </g>
  );
}

function SweptTiles({ clock, plan, marked, collapsing }: { clock: Clock; plan: Plan; marked: number[]; collapsing: Set<number> }) {
  const still = prefersStill();
  const now = useFrame(!still);
  const t = still ? SWEEP_TIMELINE_S.back + 0.1 : (now - clock.attackStart) / 1000;
  const out = [];
  for (const i of marked) {
    const u = i % ROBOT_BOARD;
    const v = Math.floor(i / ROBOT_BOARD);
    const c = plan.contact.get(i) ?? SWEEP_TIMELINE_S.reach;
    const box = tileBox(u, v);
    if (collapsing.has(i)) {
      const age = t - c;
      if (age >= TILE_SWEEP_S) continue;
      const m = age > 0 ? tileMotion(age) : { dx: 0, dy: 0, rot: 0, alpha: 1 };
      const dx = sideOf(u) === "R" ? m.dx : -m.dx;
      const rot = sideOf(u) === "R" ? -m.rot : m.rot;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      out.push(
        <g key={i} opacity={m.alpha.toFixed(2)} transform={`translate(${f1(dx)},${f1(m.dy)}) rotate(${f1(rot)},${f1(cx)},${f1(cy)})`}>
          <image href={TILE_ART[i]} {...box} preserveAspectRatio="none" />
          <polygon points={quad(u, v)} class="tile-swept" />
          <image href={doomedImg} {...box} preserveAspectRatio="none" />
        </g>,
      );
      continue;
    }
    if (t < c - CRACK_LEAD_S) {
      out.push(<FrostTarget key={i} u={u} v={v} />);
      continue;
    }
    const k = Math.min(1, (t - (c - CRACK_LEAD_S)) / CRACK_LEAD_S);
    out.push(
      <g key={i} opacity={k.toFixed(2)}>
        <polygon points={quad(u, v)} class="tile-swept" />
        <image href={doomedImg} {...box} preserveAspectRatio="none" clip-path={`url(#sa-c${i})`} />
        <clipPath id={`sa-c${i}`}>
          <polygon points={quad(u, v)} />
        </clipPath>
      </g>,
    );
  }
  return <g class="swept-tiles">{out}</g>;
}

function repeatableRandom(n: number, k: number): number {
  const x = Math.sin(n * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const SPRAY_INTERVAL_S = 1 / 30;
const SPRAY_LIFE_S = 0.55;
const TRAIL_S = 0.22;
const TRAIL_STEPS = 8;

function SweepFx({ clock, plan, players, hit }: { clock: Clock; plan: Plan; players: ArenaPlayer[]; hit: Set<string> }) {
  const still = prefersStill();
  const now = useFrame(!still);
  const { pose, t, over } = frame(clock, plan, now, still);
  if (t === null) return null;
  const arms = [];
  const fx = [];
  for (const side of SIDES) {
    const r = plan.rakes[side];
    if (!r) continue;
    const m = (p: Pt) => (side === "R" ? p : mirrorPt(p));
    if (over.has(side)) {
      arms.push(<Ops key={side} ops={[...armOps(side, pose.arms[side]), clumpOp(side, pose.arms[side])]} />);
    }
    const pts: Pt[] = [];
    for (let j = TRAIL_STEPS; j >= 0; j--) {
      const p = rakeTipOverBoard(t - (j * TRAIL_S) / TRAIL_STEPS, r);
      if (p) pts.push(m({ x: p.x, y: p.y + 4 }));
    }
    for (let j = 1; j < pts.length; j++) {
      const f = j / pts.length;
      fx.push(
        <line
          key={`${side}t${j}`}
          x1={f1(pts[j - 1]!.x)}
          y1={f1(pts[j - 1]!.y)}
          x2={f1(pts[j]!.x)}
          y2={f1(pts[j]!.y)}
          class="sweep-trail"
          stroke-width={f1(6 + 23 * f)}
          stroke-opacity={(0.8 * f).toFixed(2)}
          filter="url(#sa-blur)"
        />,
      );
    }
    for (let n = 0; ; n++) {
      const born = SWEEP_TIMELINE_S.reach + 0.03 + n * SPRAY_INTERVAL_S;
      if (born >= SWEEP_TIMELINE_S.sweepEnd || born > t) break;
      const age = t - born;
      if (age >= SPRAY_LIFE_S) continue;
      const p = rakeTipOverBoard(born, r);
      if (!p) continue;
      const r0 = repeatableRandom(n, 0);
      const r1 = repeatableRandom(n, 1);
      const s = (40 + 40 * repeatableRandom(n, 2)) * (0.7 + 1.8 * age);
      const pos = m({ x: p.x + 90 * age * (r0 - 0.2) + 40 * age, y: p.y - 60 * age * (0.5 + r1) + 90 * age * age });
      fx.push(
        <image
          key={`${side}s${n}`}
          href={sprayImg}
          x={f1(-s / 2)}
          y={f1(-s / 2)}
          width={f1(s)}
          height={f1(s)}
          opacity={(1 - age / SPRAY_LIFE_S).toFixed(2)}
          transform={`translate(${f1(pos.x)},${f1(pos.y)}) rotate(${f1(repeatableRandom(n, 3) * 360)})`}
        />,
      );
    }
  }
  for (const p of players) {
    if (!hit.has(p.id)) continue;
    const age = t - (plan.contact.get(p.y * ROBOT_BOARD + p.x) ?? SWEEP_TIMELINE_S.reach);
    if (age < 0 || age > 0.6) continue;
    const c = project(p.x + 0.5, p.y + 0.62);
    const size = TILE * 0.95 * c.s;
    const w = 90 * c.s * (0.7 + age);
    fx.push(
      <image
        key={`hit-${p.id}`}
        href={frostHitImg}
        x={f1(c.x - w / 2)}
        y={f1(c.y - size * 0.55 - w / 2)}
        width={f1(w)}
        height={f1(w)}
        opacity={(1 - age / 0.6).toFixed(2)}
      />,
    );
  }
  return (
    <g class="sweep">
      {arms}
      {fx}
    </g>
  );
}
