/**
 * Tower Fight battlefield, drawn in field units (see fight-physics.ts) inside
 * one SVG so the projector and the phones show exactly the same arcs.
 * SVG y points down, so field height h is drawn at FIELD_H - h.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import {
  CATAPULT_X,
  FIELD_H,
  FIELD_W,
  GROUND,
  LAUNCH_Y,
  SHOT_R,
  TOWER_H,
  TOWER_W,
  TOWER_X,
  COL_W,
  shotPos,
  type ShotImpact,
} from "../../shared/fight-physics.ts";
import { TOWER_MAX_DAMAGE, type FightShot } from "../../shared/protocol.ts";
import { ACCESSORY_ART, AVATAR_ART } from "./avatar-art.tsx";
import castleClothImg from "./fight/castle-cloth.webp";
import castle0 from "./fight/castle-0.webp";
import castle1 from "./fight/castle-1.webp";
import castle2 from "./fight/castle-2.webp";
import castle3 from "./fight/castle-3.webp";
import castle4 from "./fight/castle-4.webp";
import { hash01 } from "./tower-art.tsx";

/** Field height → SVG y. */
export const sy = (y: number) => FIELD_H - y;
const BASE = sy(GROUND);
/** How long an impact burst shows after a shot lands. */
export const IMPACT_MS = 1200;

/** The whole scene: sky, terrain, both towers and catapults; extra layers go on top. */
export function Battlefield(props: {
  terrain: number[];
  damage: number[];
  colors: string[];
  /** Avatar waiting in each team's catapult, if any. */
  loaded?: (AvatarChoice | null)[];
  /** Team whose tower is collapsing right now. */
  collapsing?: number | null;
  /** Per team: someone is repairing that tower (scaffolding goes up). */
  repairing?: boolean[];
  /** Avatar radius in field units (bigger on small phone screens). */
  spriteR?: number;
  class?: string;
  children?: ComponentChildren;
  svgRef?: preact.Ref<SVGSVGElement>;
}) {
  const { terrain, damage, colors, loaded, collapsing, children } = props;
  return (
    <svg ref={props.svgRef} class={`battlefield ${props.class ?? ""}`} viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <linearGradient id="bf-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2f8ff0" />
          <stop offset="0.5" stop-color="#5fb4ff" />
          <stop offset="1" stop-color="#cdeaff" />
        </linearGradient>
        {/* In field units, so the extended ground keeps the same grass-to-dirt bands as the hill. */}
        <linearGradient id="bf-grass" gradientUnits="userSpaceOnUse" x1="0" y1={sy(Math.max(...terrain))} x2="0" y2={FIELD_H + 20}>
          <stop offset="0" stop-color="#5cbf3a" />
          <stop offset="0.12" stop-color="#3f9a2a" />
          <stop offset="0.45" stop-color="#8a5a2b" />
          <stop offset="1" stop-color="#5e3a1a" />
        </linearGradient>
        {/* A collapsing tower sinks out of sight at ground level. */}
        <clipPath id="bf-above-ground">
          <rect x={-FIELD_W} y={-FIELD_H} width={FIELD_W * 3} height={FIELD_H + BASE} />
        </clipPath>
      </defs>
      <rect x={-FIELD_W} y={-FIELD_H} width={FIELD_W * 3} height={FIELD_H * 2} fill="url(#bf-sky)" />
      <Clouds />
      <Terrain terrain={terrain} />
      {[0, 1].map((team) => (
        <g key={team}>
          <CastleTower team={team} color={colors[team]!} damage={damage[team] ?? 0} collapsing={collapsing === team} repairing={!!props.repairing?.[team]} />
          <Catapult team={team} loaded={loaded?.[team] ?? null} r={props.spriteR} />
        </g>
      ))}
      {children}
    </svg>
  );
}

function Clouds() {
  return (
    <g class="bf-clouds" fill="#fff" opacity="0.85">
      {[0, 1, 2, 3].map((i) => {
        const x = 80 + i * 250 + hash01(i, 5) * 80;
        const y = 70 + hash01(i, 6) * 110;
        const s = 0.7 + hash01(i, 7) * 0.6;
        return (
          <g key={i} class={`bf-cloud c${i}`} transform={`translate(${x} ${y}) scale(${s})`}>
            <circle cx="0" cy="10" r="22" />
            <circle cx="26" cy="0" r="28" />
            <circle cx="54" cy="10" r="20" />
            <rect x="0" y="10" width="54" height="22" rx="11" />
          </g>
        );
      })}
    </g>
  );
}

export function Terrain({ terrain }: { terrain: number[] }) {
  // Flat ground continues past both edges, for screens wider than the field.
  const edge = FIELD_W;
  const pts = [`${-edge},${sy(terrain[0]!)}`, ...terrain.map((h, i) => `${i * COL_W},${sy(h).toFixed(1)}`), `${FIELD_W + edge},${sy(terrain.at(-1)!)}`].join(" L");
  return (
    <g class="bf-terrain">
      <path d={`M${-edge},${FIELD_H * 2} L${pts} L${FIELD_W + edge},${FIELD_H * 2} Z`} fill="url(#bf-grass)" />
      <path d={`M${pts}`} fill="none" stroke="#2f7a1f" stroke-width="4" stroke-linejoin="round" />
    </g>
  );
}

// Proportions of the castle image, as printed by scripts/fight-castle.py.
const CASTLE_ASPECT = 0.403;
/** Share of the image height above the battlements (flagpole and flag). */
const CASTLE_FLAG_PART = 0.169;
/** Drawn so the stonework is as tall as the tower's hit box. */
const CASTLE_H = TOWER_H / (1 - CASTLE_FLAG_PART);
const CASTLE_W = CASTLE_H * CASTLE_ASPECT;
const STONE = "#8f9199";
/** The tower at each damage stage, intact first. */
const CASTLE_STAGES = [castle0, castle1, castle2, castle3, castle4];

/**
 * A stone castle tower (generated images, see scripts/fight-castle.py) whose flag and
 * banners take the team color; it looks worse with every hit, and is rubble at TOWER_MAX_DAMAGE.
 */
export function CastleTower({ team, color, damage, collapsing, repairing }: { team: number; color: string; damage: number; collapsing?: boolean; repairing?: boolean }) {
  const cx = TOWER_X[team]!;
  const top = BASE - TOWER_H;
  const stage = Math.min(damage, CASTLE_STAGES.length - 1);
  const img = { x: cx - CASTLE_W / 2, y: BASE - CASTLE_H, width: CASTLE_W, height: CASTLE_H };
  const destroyed = damage >= TOWER_MAX_DAMAGE;
  const body = (
    <g class="castle-body" transform={damage >= 4 ? `rotate(${team === 0 ? -2.5 : 2.5} ${cx} ${BASE})` : undefined}>
      {/* The right-hand tower is mirrored, so both banners hang on the outer side. */}
      <g transform={team === 0 ? undefined : `translate(${2 * cx} 0) scale(-1 1)`}>
        <mask id={`castle-cloth-${team}`} maskUnits="userSpaceOnUse" {...img}>
          <image href={castleClothImg} {...img} preserveAspectRatio="none" />
        </mask>
        <rect {...img} fill={color} mask={`url(#castle-cloth-${team})`} />
        {/* Every stage stays in the page so the next one is already loaded when a hit lands. */}
        {CASTLE_STAGES.map((href, i) => (
          <image key={i} href={href} {...img} preserveAspectRatio="none" visibility={i === stage ? "visible" : "hidden"} />
        ))}
        {damage >= 4 && (
          // Burning in the broken-off corner of the last stage.
          <g class="castle-fire">
            <path d={`M${cx + 18},${top + 24} q10,-26 4,-44 q18,18 12,44 Z`} fill="#ff8a00" />
            <path d={`M${cx + 22},${top + 24} q6,-16 2,-28 q10,12 6,28 Z`} fill="#ffd23f" />
          </g>
        )}
      </g>
    </g>
  );
  return (
    <g class={`castle ${collapsing ? "collapsing" : ""}`} data-team={team}>
      {destroyed && !collapsing ? null : collapsing ? <g clip-path="url(#bf-above-ground)">{body}</g> : body}
      {destroyed && <Rubble team={team} />}
      {damage >= 3 && !destroyed && <Smoke x={cx} y={top - 20} />}
      {collapsing && <Smoke x={cx} y={BASE - 40} big />}
      {repairing && !destroyed && <Scaffold team={team} />}
    </g>
  );
}

/** Wooden scaffolding and a busy hammer while someone repairs the tower. */
function Scaffold({ team }: { team: number }) {
  const cx = TOWER_X[team]!;
  const l = cx - TOWER_W / 2 - 10;
  const r = cx + TOWER_W / 2 + 10;
  const top = BASE - TOWER_H + 20;
  const plank = (y: number) => <rect key={y} x={l - 4} y={y} width={r - l + 8} height={7} rx="2" fill="#c8913f" stroke="#1f1633" stroke-width="2" />;
  return (
    <g class="scaffold">
      {[l, r].map((x) => (
        <rect key={x} x={x - 3} y={top} width={6} height={BASE - top} fill="#a8742e" stroke="#1f1633" stroke-width="2" />
      ))}
      <path d={`M${l},${BASE} L${r},${top + 60} M${r},${BASE} L${l},${top + 60}`} stroke="#a8742e" stroke-width="4" />
      {[top, top + 60, top + 120].map(plank)}
      <text class="scaffold-hammer" x={cx + (team === 0 ? 30 : -30)} y={top - 10} text-anchor="middle">
        🔨
      </text>
    </g>
  );
}

function Rubble({ team }: { team: number }) {
  const cx = TOWER_X[team]!;
  return (
    <g class="rubble">
      {Array.from({ length: 14 }, (_, i) => {
        const w = 14 + hash01(team, i, 1) * 18;
        const h = 10 + hash01(team, i, 2) * 12;
        const px = cx - 55 + hash01(team, i, 3) * 110 - w / 2;
        const lift = (1 - Math.abs(px + w / 2 - cx) / 60) * 34 * hash01(team, i, 4);
        return (
          <rect
            key={i}
            x={px}
            y={BASE - h - Math.max(0, lift)}
            width={w}
            height={h}
            rx="2"
            fill={hash01(team, i, 6) < 0.5 ? STONE : "#a9abb3"}
            stroke="#1f1633"
            stroke-width="2.5"
            transform={`rotate(${(hash01(team, i, 5) - 0.5) * 50} ${px + w / 2} ${BASE - h / 2})`}
          />
        );
      })}
    </g>
  );
}

function Smoke({ x, y, big }: { x: number; y: number; big?: boolean }) {
  const s = big ? 2.2 : 1;
  return (
    <g class={`smoke ${big ? "big" : ""}`}>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x + (i - 1) * 10 * s} cy={y} r={12 * s} fill="#6b6b75" style={{ animationDelay: `${i * 0.6}s` }} />
      ))}
    </g>
  );
}

/** A wooden catapult; Red's throws to the right, Blue's to the left. */
export function Catapult({ team, loaded, r }: { team: number; loaded: AvatarChoice | null; r?: number }) {
  const cx = CATAPULT_X[team]!;
  const dir = team === 0 ? 1 : -1;
  const cupY = sy(LAUNCH_Y);
  return (
    <g class="catapult">
      <g transform={`translate(${cx} 0) scale(${dir} 1)`}>
        <rect x={-34} y={BASE - 14} width={52} height={9} rx="3" fill="#8a5a2b" stroke="#1f1633" stroke-width="2.5" />
        <path d={`M-22,${BASE - 12} L-8,${BASE - 40} L6,${BASE - 12}`} fill="none" stroke="#6b4420" stroke-width="7" stroke-linejoin="round" />
        <line x1={-8} y1={BASE - 38} x2={-40} y2={cupY + 6} stroke="#8a5a2b" stroke-width="7" stroke-linecap="round" />
        <path d={`M-50,${cupY} q10,14 20,0`} fill="#6b4420" stroke="#1f1633" stroke-width="2.5" />
        <circle cx={-26} cy={BASE - 5} r={8} fill="#5e3a1a" stroke="#1f1633" stroke-width="2.5" />
        <circle cx={10} cy={BASE - 5} r={8} fill="#5e3a1a" stroke="#1f1633" stroke-width="2.5" />
      </g>
      {loaded && <AvatarSprite choice={loaded} x={cx} y={LAUNCH_Y} r={r} />}
    </g>
  );
}

/** An avatar drawn in the field (center x, y), optionally spinning. */
export function AvatarSprite({ choice, x, y, r = SHOT_R * 1.5, spin = 0 }: { choice: AvatarChoice; x: number; y: number; r?: number; spin?: number }) {
  const body = AVATAR_ART[choice.avatar] ?? AVATAR_ART.cat;
  const extra = ACCESSORY_ART[choice.accessory] ?? ACCESSORY_ART.none;
  return (
    <g transform={`translate(${x - r} ${sy(y) - r}) scale(${(2 * r) / 100})`}>
      <g transform={spin ? `rotate(${spin} 50 50)` : undefined}>
        {body()}
        {extra()}
      </g>
    </g>
  );
}

/** Burst where a shot landed: a dust cloud on the ground, a big bang on a tower. */
export function ImpactBurst({ impact }: { impact: ShotImpact }) {
  if (impact.kind === "offscreen") return null;
  const x = impact.x;
  const y = sy(impact.y);
  const tower = impact.kind === "tower";
  return (
    <g class={`burst ${tower ? "tower" : "ground"}`}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <circle key={i} cx={x} cy={y} r={tower ? 12 : 9} fill={tower ? (i % 2 ? "#ffd23f" : "#ff6a00") : "#9c7a52"} style={{ "--dx": `${Math.cos(a) * 42}px`, "--dy": `${Math.sin(a) * 42 - 18}px` }} />;
      })}
      {tower && <text x={x} y={y - 26} text-anchor="middle" class="burst-text">💥</text>}
    </g>
  );
}

/**
 * Animation clock for shots. Each shot starts (locally) when it was first seen
 * minus how long ago it was fired, so every screen replays it from the same point.
 * Ticks every frame while a shot is flying or its burst is showing.
 */
export function useShotClock(shots: FightShot[]): { now: number; startOf: (s: FightShot) => number } {
  const [now, setNow] = useState(() => performance.now());
  const starts = useRef(new Map<number, number>());
  for (const s of shots) if (!starts.current.has(s.id)) starts.current.set(s.id, performance.now() - s.elapsedMs);
  const startOf = (s: FightShot) => starts.current.get(s.id)!;
  const active = shots.some((s) => performance.now() - startOf(s) < s.durationMs + IMPACT_MS);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = (t: number) => {
      setNow(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, shots.map((s) => s.id).join()]);
  return { now: Math.max(now, active ? 0 : performance.now()), startOf };
}

/** Every shot's flight (avatar tumbling along its arc with a dotted trail), then its burst. */
export function ShotLayer({ shots, onLand, spriteR }: { shots: FightShot[]; onLand?: (s: FightShot) => void; spriteR?: number }) {
  const { now, startOf } = useShotClock(shots);
  const landed = useRef(new Set<number>());
  const out = [];
  for (const s of shots) {
    const age = now - startOf(s);
    if (age < 0) continue;
    if (age < s.durationMs) {
      const t = age / 1000;
      const p = shotPos(s.team, s.vx, s.vy, t);
      const trail = [];
      for (let k = 1; k <= 6; k++) {
        const tt = t - k * 0.06;
        if (tt <= 0) break;
        const q = shotPos(s.team, s.vx, s.vy, tt);
        trail.push(<circle key={k} cx={q.x} cy={sy(q.y)} r={5 - k * 0.6} fill="#fff" opacity={0.8 - k * 0.11} />);
      }
      out.push(
        <g key={s.id} class="shot">
          {trail}
          <AvatarSprite choice={s.avatar} x={p.x} y={p.y} r={spriteR} spin={age * 0.5 * (s.team === 0 ? 1 : -1)} />
        </g>,
      );
    } else if (age < s.durationMs + IMPACT_MS) {
      if (!landed.current.has(s.id)) {
        landed.current.add(s.id);
        onLand?.(s);
      }
      out.push(<ImpactBurst key={s.id} impact={s.impact} />);
    }
  }
  return <g class="shots">{out}</g>;
}

/** Five health pips for a tower. */
export function HealthBar({ damage, color, label }: { damage: number; color: string; label?: string }) {
  const left = TOWER_MAX_DAMAGE - damage;
  return (
    <span class="health" style={{ "--team": color }} role="img" aria-label={label ?? `${left} of ${TOWER_MAX_DAMAGE} health left`}>
      {Array.from({ length: TOWER_MAX_DAMAGE }, (_, i) => (
        <i key={i} class={i < left ? "full" : ""} />
      ))}
    </span>
  );
}
