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
  TOWER_X,
  COL_W,
  shotPos,
  type ShotImpact,
} from "../../shared/fight-physics.ts";
import { TOWER_MAX_DAMAGE, type FightShot } from "../../shared/protocol.ts";
import { ACCESSORY_ART, AVATAR_ART } from "./avatar-art.tsx";
import castle0 from "./fight/castle-0.webp";
import castle1 from "./fight/castle-1.webp";
import castle2 from "./fight/castle-2.webp";
import castle3 from "./fight/castle-3.webp";
import castle4 from "./fight/castle-4.webp";
import castleCloth0 from "./fight/castle-cloth-0.webp";
import castleCloth1 from "./fight/castle-cloth-1.webp";
import castleCloth2 from "./fight/castle-cloth-2.webp";
import castleCloth3 from "./fight/castle-cloth-3.webp";
import castleCloth4 from "./fight/castle-cloth-4.webp";
import catapultImg from "./fight/catapult.webp";
import catapultClothImg from "./fight/catapult-cloth.webp";
import dirtImg from "./fight/fx-dirt.webp";
import dustImg from "./fight/fx-dust.webp";
import rubbleImg from "./fight/fx-rubble.webp";
import earthImg from "./fight/ground-earth.webp";
import grassImg from "./fight/ground-grass.webp";
import scaffoldImg from "./fight/scaffold.webp";
import skyImg from "./fight/sky.webp";
import phoneBackdropImg from "./fight/phone/aim-backdrop.webp";
import phoneBrickImg from "./fight/phone/brick.webp";
import phoneCastle0 from "./fight/phone/castle-0.webp";
import phoneCastle1 from "./fight/phone/castle-1.webp";
import phoneCastle2 from "./fight/phone/castle-2.webp";
import phoneCastle3 from "./fight/phone/castle-3.webp";
import phoneCastle4 from "./fight/phone/castle-4.webp";
import phoneCastleCloth0 from "./fight/phone/castle-cloth-0.webp";
import phoneCastleCloth1 from "./fight/phone/castle-cloth-1.webp";
import phoneCastleCloth2 from "./fight/phone/castle-cloth-2.webp";
import phoneCastleCloth3 from "./fight/phone/castle-cloth-3.webp";
import phoneCastleCloth4 from "./fight/phone/castle-cloth-4.webp";
import phoneCatapultImg from "./fight/phone/catapult.webp";
import phoneCatapultClothImg from "./fight/phone/catapult-cloth.webp";
import phoneDirtImg from "./fight/phone/fx-dirt.webp";
import phoneDustImg from "./fight/phone/fx-dust.webp";
import phoneRubbleImg from "./fight/phone/fx-rubble.webp";
import phoneEarthImg from "./fight/phone/ground-earth.webp";
import phoneGrassImg from "./fight/phone/ground-grass.webp";
import phoneScaffoldImg from "./fight/phone/scaffold.webp";
import phoneSkyImg from "./fight/phone/sky.webp";
import phoneUiAttackImg from "./fight/phone/ui-attack.webp";
import phoneUiRebuildImg from "./fight/phone/ui-rebuild.webp";
import { isPhoneArt, pickArt } from "./phone-art.ts";

/** Field height → SVG y. */
export const sy = (y: number) => FIELD_H - y;
const BASE = sy(GROUND);
/** How long an impact burst shows after a shot lands. */
const IMPACT_MS = 1200;
/** Art for the phone's own screens around the battlefield (backdrop, choice icons, repair bricks). */
export const FIGHT_PHONE_UI = { backdrop: phoneBackdropImg, attack: phoneUiAttackImg, rebuild: phoneUiRebuildImg, brick: phoneBrickImg };

/** The painted sky and earth cover the field once; mirrored copies either side fill wide screens seamlessly. */
function Mirrored({ href, y, height }: { href: string; y: number; height: number }) {
  const at = { href, y, height, preserveAspectRatio: "none" };
  // The copies overlap the main image by one unit, so no anti-aliased hairline shows at the joins.
  return (
    <>
      <image {...at} x={0} width={FIELD_W} />
      <image {...at} x={-1} width={FIELD_W + 1} transform="scale(-1 1)" />
      <image {...at} x={-2 * FIELD_W} width={FIELD_W + 1} transform="scale(-1 1)" />
    </>
  );
}

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
        {/* The grass texture is tiled in field units so it doesn't stretch with the terrain. */}
        <pattern id="bf-grass" patternUnits="userSpaceOnUse" width={GRASS_TILE} height={GRASS_TILE}>
          <image href={pickArt(grassImg, phoneGrassImg)} width={GRASS_TILE} height={GRASS_TILE} />
        </pattern>
        {/* The soil darkens with depth; in field units, so the extended ground matches the hill. */}
        <linearGradient id="bf-depth" gradientUnits="userSpaceOnUse" x1="0" y1={sy(Math.max(...terrain))} x2="0" y2={FIELD_H + 20}>
          <stop offset="0" stop-color="#2a1608" stop-opacity="0" />
          <stop offset="1" stop-color="#2a1608" stop-opacity="0.3" />
        </linearGradient>
        {/* A collapsing tower sinks out of sight at ground level. */}
        <clipPath id="bf-above-ground">
          <rect x={-FIELD_W} y={-FIELD_H} width={FIELD_W * 3} height={FIELD_H + BASE} />
        </clipPath>
      </defs>
      {/* Flat top colour of the painted sky, for screens taller than the field. */}
      <rect x={-FIELD_W} y={-FIELD_H} width={FIELD_W * 3} height={FIELD_H * 2} fill="#1f1f18" />
      <Mirrored href={pickArt(skyImg, phoneSkyImg)} y={0} height={FIELD_H} />
      <Terrain terrain={terrain} />
      {[0, 1].map((team) => (
        <g key={team}>
          <CastleTower team={team} color={colors[team]!} damage={damage[team] ?? 0} collapsing={collapsing === team} repairing={!!props.repairing?.[team]} />
          <Catapult team={team} color={colors[team]!} loaded={loaded?.[team] ?? null} r={props.spriteR} />
        </g>
      ))}
      {children}
    </svg>
  );
}

/** Size of one grass tile in field units. */
const GRASS_TILE = 56;
/** Depth of the grass band below the surface, in field units. */
const GRASS_DEPTH = 10;

function Terrain({ terrain }: { terrain: number[] }) {
  // Flat ground continues past both edges, for screens wider than the field.
  const edge = FIELD_W;
  const pts = [`${-edge},${sy(terrain[0]!)}`, ...terrain.map((h, i) => `${i * COL_W},${sy(h).toFixed(1)}`), `${FIELD_W + edge},${sy(terrain.at(-1)!)}`].join(" L");
  const ground = `M${-edge},${FIELD_H * 2} L${pts} L${FIELD_W + edge},${FIELD_H * 2} Z`;
  return (
    <g class="bf-terrain">
      {/* The grass is a thick stroke along the surface, clipped so only its lower half shows, so it follows craters. */}
      <clipPath id="bf-ground">
        <path d={ground} />
      </clipPath>
      {/* Plain loam under the earth painting (the path runs below the screen); craters just clip the painting deeper. */}
      <path d={ground} fill="#2a1a10" />
      <g clip-path="url(#bf-ground)">
        <Mirrored href={pickArt(earthImg, phoneEarthImg)} y={37.5} height={562.5} />
      </g>
      <path d={ground} fill="url(#bf-depth)" />
      <g clip-path="url(#bf-ground)" fill="none" stroke-linejoin="round">
        <path d={`M${pts}`} stroke="#2a1608" stroke-opacity="0.35" stroke-width={GRASS_DEPTH * 2 + 8} />
        <path d={`M${pts}`} stroke="url(#bf-grass)" stroke-width={GRASS_DEPTH * 2} />
      </g>
      <path d={`M${pts}`} fill="none" stroke="#24561a" stroke-width="3" stroke-linejoin="round" />
    </g>
  );
}

// Proportions of the castle image (width / height), measured on the art build's castle-0.webp.
const CASTLE_ASPECT = 0.403;
/** Share of the image height above the battlements (roof and pennant). */
const CASTLE_FLAG_PART = 0.198;
/** Drawn so the stonework is as tall as the tower's hit box. */
const CASTLE_H = TOWER_H / (1 - CASTLE_FLAG_PART);
const CASTLE_W = CASTLE_H * CASTLE_ASPECT;
/** The tower at each damage stage, intact first. */
const CASTLE_STAGES = [castle0, castle1, castle2, castle3, castle4];
const PHONE_CASTLE_STAGES = [phoneCastle0, phoneCastle1, phoneCastle2, phoneCastle3, phoneCastle4];
/** The team-cloth mask for each stage; damaged stages lose roof and banner, so one mask won't do. */
const CLOTH_STAGES = [castleCloth0, castleCloth1, castleCloth2, castleCloth3, castleCloth4];
const PHONE_CLOTH_STAGES = [phoneCastleCloth0, phoneCastleCloth1, phoneCastleCloth2, phoneCastleCloth3, phoneCastleCloth4];

/**
 * A stone castle tower (painted images from the art build) whose flag and
 * banners take the team color; it looks worse with every hit, and is rubble at TOWER_MAX_DAMAGE.
 */
function CastleTower({ team, color, damage, collapsing, repairing }: { team: number; color: string; damage: number; collapsing?: boolean; repairing?: boolean }) {
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
          <image href={pickArt(CLOTH_STAGES[stage]!, PHONE_CLOTH_STAGES[stage]!)} {...img} preserveAspectRatio="none" />
        </mask>
        <rect {...img} fill={color} mask={`url(#castle-cloth-${team})`} />
        {/* Every stage stays in the page so the next one is already loaded when a hit lands. */}
        {(isPhoneArt() ? PHONE_CASTLE_STAGES : CASTLE_STAGES).map((href, i) => (
          <image key={i} href={href} {...img} preserveAspectRatio="none" visibility={i === stage ? "visible" : "hidden"} />
        ))}
        {damage >= 4 && (
          // Burning in the broken-off corner of the last stage.
          <g class="castle-fire">
            <path d={`M${cx + 16},${top + 8} q10,-26 4,-44 q18,18 12,44 Z`} fill="#ff8a00" />
            <path d={`M${cx + 20},${top + 8} q6,-16 2,-28 q10,12 6,28 Z`} fill="#ffd23f" />
          </g>
        )}
      </g>
    </g>
  );
  return (
    <g class={`castle ${collapsing ? "collapsing" : ""}`} data-team={team}>
      {destroyed && !collapsing ? null : collapsing ? <g clip-path="url(#bf-above-ground)">{body}</g> : body}
      {destroyed && <Rubble team={team} />}
      {damage >= 3 && !destroyed && <Smoke x={cx} y={top - 8} />}
      {collapsing && <Smoke x={cx} y={BASE - 40} big />}
      {repairing && !destroyed && <Scaffold team={team} />}
    </g>
  );
}

/** Wooden scaffolding and a busy hammer while someone repairs the tower. */
function Scaffold({ team }: { team: number }) {
  const cx = TOWER_X[team]!;
  const top = BASE - TOWER_H + 20;
  return (
    <g class="scaffold">
      {/* Mirrored for Blue, so the ladder faces the hill on both sides. */}
      <image
        href={pickArt(scaffoldImg, phoneScaffoldImg)}
        x={cx - 56}
        y={BASE - 217}
        width={112}
        height={219.2}
        preserveAspectRatio="none"
        transform={team === 0 ? undefined : `translate(${2 * cx} 0) scale(-1 1)`}
      />
      <text class="scaffold-hammer" x={cx + (team === 0 ? 30 : -30)} y={top - 10} text-anchor="middle">
        🔨
      </text>
    </g>
  );
}

/** The heap a destroyed tower leaves behind. */
function Rubble({ team }: { team: number }) {
  const cx = TOWER_X[team]!;
  return <image class="rubble" href={pickArt(rubbleImg, phoneRubbleImg)} x={cx - 65} y={BASE + 4 - 84} width={130} height={84} preserveAspectRatio="none" />;
}

/** A dust cloud rising over a damaged tower, or a bigger one as it collapses. */
function Smoke({ x, y, big }: { x: number; y: number; big?: boolean }) {
  const w = big ? 90 : 70;
  const h = w * (195 / 256);
  return (
    <g class={`smoke ${big ? "big" : ""}`}>
      {[0, 1, 2].map((i) => (
        <image key={i} href={pickArt(dustImg, phoneDustImg)} x={x - w / 2 + (i - 1) * 8} y={y - h / 2} width={w} height={h} style={{ animationDelay: `${i * 0.6}s` }} />
      ))}
    </g>
  );
}

/** A wooden catapult with team-coloured cloth; Red's throws to the right, Blue's to the left. */
function Catapult({ team, color, loaded, r }: { team: number; color: string; loaded: AvatarChoice | null; r?: number }) {
  const cx = CATAPULT_X[team]!;
  const dir = team === 0 ? 1 : -1;
  const cupY = sy(LAUNCH_Y);
  // Placed so the cup sits at (cx, LAUNCH_Y) and the wheels on the ground.
  const img = { x: -4.8, y: cupY - 5, width: 57.1, height: 39.4 };
  return (
    <g class="catapult">
      <g transform={`translate(${cx} 0) scale(${dir} 1)`}>
        <mask id={`catapult-cloth-${team}`} maskUnits="userSpaceOnUse" {...img}>
          <image href={pickArt(catapultClothImg, phoneCatapultClothImg)} {...img} preserveAspectRatio="none" />
        </mask>
        <rect {...img} fill={color} mask={`url(#catapult-cloth-${team})`} />
        <image href={pickArt(catapultImg, phoneCatapultImg)} {...img} preserveAspectRatio="none" />
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

/** Burst where a shot landed: a spray of dirt on the ground, a big bang on a tower. */
function ImpactBurst({ impact }: { impact: ShotImpact }) {
  if (impact.kind === "offscreen") return null;
  const x = impact.x;
  const y = sy(impact.y);
  const tower = impact.kind === "tower";
  if (!tower) {
    const w = 80;
    const h = w * (249 / 256);
    return (
      <g class="burst ground">
        <image class="burst-dirt" href={pickArt(dirtImg, phoneDirtImg)} x={x - w / 2} y={y + 8 - h} width={w} height={h} />
      </g>
    );
  }
  return (
    <g class="burst tower">
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <circle key={i} cx={x} cy={y} r={12} fill={i % 2 ? "#ffd23f" : "#ff6a00"} style={{ "--dx": `${Math.cos(a) * 42}px`, "--dy": `${Math.sin(a) * 42 - 18}px` }} />;
      })}
      <text x={x} y={y - 26} text-anchor="middle" class="burst-text">💥</text>
    </g>
  );
}

/**
 * Animation clock for shots. Each shot starts (locally) when it was first seen
 * minus how long ago it was fired, so every screen replays it from the same point.
 * Ticks every frame while a shot is flying or its burst is showing.
 */
function useShotClock(shots: FightShot[]): { now: number; startOf: (s: FightShot) => number } {
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
