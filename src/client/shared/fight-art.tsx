import { gingerbreadGround } from "../../shared/fight-ground.ts";
import type { HillHeight } from "../../shared/fight-physics.ts";
import { useGingerbread, fightChristmasArt, catapultAngle } from "./fight-skin.tsx";
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
  shots?: FightShot[];
  hill?: HillHeight;
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
  const christmas = useGingerbread();
  const art = fightChristmasArt();
  return (
    <svg ref={props.svgRef} class={`battlefield ${christmas ? "gingerbread-battlefield" : ""} ${props.class ?? ""}`} viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        {/* The grass texture is tiled in field units so it doesn't stretch with the terrain. */}
        {!christmas && <pattern id="bf-grass" patternUnits="userSpaceOnUse" width={GRASS_TILE} height={GRASS_TILE}>
          <image href={pickArt(grassImg, phoneGrassImg)} width={GRASS_TILE} height={GRASS_TILE} />
        </pattern>}
        {christmas && <pattern id="bf-cookie" patternUnits="userSpaceOnUse" width="180" height="180"><image href={art.earth} width="180" height="180" /></pattern>}
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
      <rect x={-FIELD_W} y={-FIELD_H} width={FIELD_W * 3} height={FIELD_H * 2} fill={christmas ? "#49305d" : "#1f1f18"} />
      <Mirrored href={christmas ? art.sky : pickArt(skyImg, phoneSkyImg)} y={christmas ? -50 : 0} height={FIELD_H} />
      <Terrain terrain={terrain} hill={props.hill ?? "medium"} />
      {[0, 1].map((team) => (
        <g key={team}>
          <CastleTower team={team} color={colors[team]!} damage={damage[team] ?? 0} collapsing={collapsing === team} repairing={!!props.repairing?.[team]} />
          <Catapult shots={props.shots ?? []} team={team} color={colors[team]!} loaded={loaded?.[team] ?? null} r={props.spriteR} />
        </g>
      ))}
      {children}
      {christmas && <g class="ginger-snow" pointer-events="none">{Array.from({ length: 24 }, (_, i) => (
        <circle key={i} cx={(i * 137 + 41) % FIELD_W} cy={(i * 79) % FIELD_H} r={1.3 + i % 3} fill="#fff9ef" opacity="0.65" style={{ animationDelay: `${-i * 0.43}s`, animationDuration: `${7 + i % 5}s` }} />
      ))}</g>}
    </svg>
  );
}

/** Size of one grass tile in field units. */
const GRASS_TILE = 56;
/** Depth of the grass band below the surface, in field units. */
const GRASS_DEPTH = 10;

function Terrain({ terrain, hill }: { terrain: number[]; hill: HillHeight }) {
  const christmas = useGingerbread();
  const original = gingerbreadGround(hill);
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
        {christmas ? <>
          <path d={ground} fill="url(#bf-cookie)" />
          {/* Fixed original icing is cut away by craters; no surface stroke regrows it. */}
          <Mirrored href={fightChristmasArt().grounds[hill]} y={original.y} height={original.height} />
        </> : <Mirrored href={pickArt(earthImg, phoneEarthImg)} y={37.5} height={562.5} />}
      </g>
      <path d={ground} fill="url(#bf-depth)" />
      {!christmas && <><g clip-path="url(#bf-ground)" fill="none" stroke-linejoin="round">
        <path d={`M${pts}`} stroke="#2a1608" stroke-opacity="0.35" stroke-width={GRASS_DEPTH * 2 + 8} />
        <path d={`M${pts}`} stroke="url(#bf-grass)" stroke-width={GRASS_DEPTH * 2} />
      </g>
      <path d={`M${pts}`} fill="none" stroke="#24561a" stroke-width="3" stroke-linejoin="round" /></>}
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
  const christmas = useGingerbread();
  const cx = TOWER_X[team]!;
  const top = BASE - TOWER_H;
  const stage = Math.min(damage, CASTLE_STAGES.length - 1);
  // Source canvases include bottom padding: sink the iced foot into the ground by one unit.
  const img = christmas ? { x: cx - 46, y: top - 3, width: 92, height: TOWER_H + 14 } : { x: cx - CASTLE_W / 2, y: BASE - CASTLE_H, width: CASTLE_W, height: CASTLE_H };
  const destroyed = damage >= TOWER_MAX_DAMAGE;
  const body = (
    <g class="castle-body" transform={damage >= 4 ? `rotate(${team === 0 ? -2.5 : 2.5} ${cx} ${BASE})` : undefined}>
      {/* The right-hand tower is mirrored, so both banners hang on the outer side. */}
      <g transform={team === 0 ? undefined : `translate(${2 * cx} 0) scale(-1 1)`}>
        {!christmas && <g><mask id={`castle-cloth-${team}`} maskUnits="userSpaceOnUse" {...img}>
          <image href={pickArt(CLOTH_STAGES[stage]!, PHONE_CLOTH_STAGES[stage]!)} {...img} preserveAspectRatio="none" />
        </mask>
        <rect {...img} fill={color} mask={`url(#castle-cloth-${team})`} /></g>}
        {/* Every stage stays in the page so the next one is already loaded when a hit lands. */}
        {(christmas ? fightChristmasArt().castles : isPhoneArt() ? PHONE_CASTLE_STAGES : CASTLE_STAGES).map((href, i) => (
          <image key={i} href={href} {...img} preserveAspectRatio="none" visibility={i === stage ? "visible" : "hidden"} />
        ))}
        {christmas && <>
          <GingerbreadCandy team={team} color={color} stage={stage} image={img} />
          <GingerbreadStripes team={team} color={color} stage={stage} image={img} />
          <g class="ginger-team-flag">
            <image href={fightChristmasArt().flags[team]} x={cx - 46.4} y={top - 54} width="110" height="73.33" preserveAspectRatio="none" />
          </g>
        </>}
        {!christmas && damage >= 4 && (
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

/** Traced candy regions in the source canvas; tint the original pixels to retain sugar and shading. */
function GingerbreadCandy({ team, color, stage, image }: { team: number; color: string; stage: number; image: { x: number; y: number; width: number; height: number } }) {
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
  const candy = [
    "M43 276 C41 237 60 200 92 198 C127 194 148 236 154 275 Q100 259 43 276 Z",
    "M173 235 C176 193 200 151 237 150 C276 148 300 195 302 235 Q239 213 173 235 Z",
    "M333 212 C338 163 365 120 398 120 C438 121 468 167 470 212 Q398 192 333 212 Z",
    "M496 235 C501 190 525 150 559 150 C597 150 620 194 626 237 Q559 213 496 235 Z",
    "M639 276 C644 230 666 198 696 199 C733 199 750 244 752 281 Q700 261 639 276 Z",
    "M40 1824 C43 1760 63 1711 102 1713 C133 1714 151 1752 156 1773 L143 1829 Q117 1820 105 1832 Q73 1821 40 1824 Z",
    "M138 1834 C140 1791 161 1748 195 1746 C229 1744 249 1794 251 1842 Q239 1860 211 1847 Q178 1830 138 1834 Z",
    "M542 1840 C543 1795 566 1746 598 1746 C629 1745 653 1792 655 1838 Q620 1832 602 1847 Q563 1860 542 1840 Z",
    "M638 1775 C648 1736 670 1712 691 1713 C725 1712 747 1760 751 1824 Q717 1821 692 1830 Q669 1820 652 1831 Z",
  ];
  return <g class="ginger-team-gumdrops">
    <defs>
      <clipPath id={`ginger-candy-${team}`} clipPathUnits="userSpaceOnUse" transform={`translate(${image.x} ${image.y}) scale(${image.width / 793} ${image.height / 1983})`}>
          {candy.map((d, i) => <path key={i} d={d} />)}
          {stage < 3 && <ellipse cx="398" cy="410" rx="27" ry="34" />}
          <ellipse cx="398" cy="783" rx="28" ry="31" />
          <ellipse cx="398" cy="1155" rx="28" ry="30" />
      </clipPath>
      <filter id={`ginger-candy-color-${team}`} color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values={`${rgb.map(c => `${.2126 * c * 1.2} ${.7152 * c * 1.2} ${.0722 * c * 1.2} 0 0`).join(" ")} 0 0 0 1 0`} />
      </filter>
    </defs>
    <image href={fightChristmasArt().castles[stage]} {...image} preserveAspectRatio="none" clip-path={`url(#ginger-candy-${team})`} filter={`url(#ginger-candy-color-${team})`} />
  </g>;
}

/** Color only the baked candy stripes around the door, keeping the white icing stripes white. */
function GingerbreadStripes({ team, color, stage, image }: { team: number; color: string; stage: number; image: { x: number; y: number; width: number; height: number } }) {
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
  return <g class="ginger-team-stripes">
    <defs>
      <clipPath id={`ginger-stripes-${team}`} clipPathUnits="userSpaceOnUse" transform={`translate(${image.x} ${image.y}) scale(${image.width / 793} ${image.height / 1983})`}>
        <path d="M165 1852 V1455 C165 1324 269 1230 395 1230 C521 1230 625 1324 625 1455 V1852 H550 V1455 C550 1370 480 1300 395 1300 C310 1300 240 1370 240 1455 V1852 Z" />
      </clipPath>
      <filter id={`ginger-stripes-color-${team}`} color-interpolation-filters="sRGB">
        {/* Warm cookie-colored pixels have a much larger red/blue difference than white icing. */}
        <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 4 0 -4 0 -0.65" result="stripe-mask" />
        <feColorMatrix in="SourceGraphic" type="matrix" values={`${rgb.map(c => `${.2126 * c * 1.2} ${.7152 * c * 1.2} ${.0722 * c * 1.2} 0 0`).join(" ")} 0 0 0 1 0`} result="team-color" />
        <feComposite in="team-color" in2="stripe-mask" operator="in" />
      </filter>
    </defs>
    <image href={fightChristmasArt().castles[stage]} {...image} preserveAspectRatio="none" clip-path={`url(#ginger-stripes-${team})`} filter={`url(#ginger-stripes-color-${team})`} />
  </g>;
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
  const christmas = useGingerbread();
  const cx = TOWER_X[team]!;
  if (christmas) return <g class="rubble">{Array.from({ length: 14 }, (_, i) => <g key={i} transform={`translate(${cx - 48 + i * 7.5} ${BASE - 4 - i % 3 * 3}) rotate(${i * 37})`}><rect x="-8" y="-6" width="16" height="12" rx="3" fill={i % 3 ? "#bc7539" : "#f8e8ce"} stroke="#e6ad67" stroke-width="1" /></g>)}</g>;
  return <image class="rubble" href={pickArt(rubbleImg, phoneRubbleImg)} x={cx - 65} y={BASE + 4 - 84} width={130} height={84} preserveAspectRatio="none" />;
}

/** A dust cloud rising over a damaged tower, or a bigger one as it collapses. */
function Smoke({ x, y, big }: { x: number; y: number; big?: boolean }) {
  const christmas = useGingerbread();
  const w = big ? 90 : 70;
  const h = w * (195 / 256);
  return (
    <g class={`smoke ${big ? "big" : ""}`}>
      {christmas ? [0, 1, 2].map(i => <circle key={i} class="ginger-sugar-puff" cx={x + (i - 1) * 10} cy={y} r={big ? 12 : 7} fill="#fff1da" style={{ animationDelay: `${i * .6}s` }} />) : [0, 1, 2].map((i) => (
        <image key={i} href={pickArt(dustImg, phoneDustImg)} x={x - w / 2 + (i - 1) * 8} y={y - h / 2} width={w} height={h} style={{ animationDelay: `${i * 0.6}s` }} />
      ))}
    </g>
  );
}

/** A wooden catapult with team-coloured cloth; Red's throws to the right, Blue's to the left. */
function Catapult({ team, color, loaded, r, shots }: { team: number; color: string; loaded: AvatarChoice | null; r?: number; shots: FightShot[] }) {
  const christmas = useGingerbread();
  if (christmas) return <GingerbreadCatapult team={team} color={color} loaded={loaded} r={r} shots={shots} />;
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

/** The arm is a separate transparent sprite; its peppermint axle is the rotation pivot. */
function GingerbreadCatapult({ team, color, loaded, r, shots }: { team: number; color: string; loaded: AvatarChoice | null; r?: number; shots: FightShot[] }) {
  const cx = CATAPULT_X[team]!;
  const { now, startOf } = useShotClock(shots);
  const latest = shots.filter(s => s.team === team).reduce<FightShot | null>((a, s) => !a || s.id > a.id ? s : a, null);
  const age = latest ? now - startOf(latest) : -1;
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const angle = reduced ? 24 : catapultAngle(age);
  const firing = age >= 0 && age < 700;
  const art = fightChristmasArt();
  return <g class={`catapult ginger-catapult ${firing ? "firing" : ""}`} data-team={team}>
    <g transform={`translate(${cx} 0) scale(${team === 0 ? 1 : -1} 1)`}>
      <g transform={`translate(29.2 ${BASE - 21})`}>
        <g class="ginger-catapult-arm" transform={`rotate(${angle})`} data-angle={angle}>
          <image href={art.arm} x={-37.68} y={-7.47} width={41.5} height={13.83} preserveAspectRatio="none" />
        </g>
      </g>
      <image transform={firing && !reduced ? `translate(0 ${Math.sin(age / 40) * Math.exp(-age / 150) * 1.8})` : undefined} class="ginger-catapult-base" href={art.base} x={-2.2} y={BASE - 28.8} width={57.6} height={32} preserveAspectRatio="none" />
      <circle cx="29.2" cy={BASE - 21} r="3" fill={color} stroke="#fff2d2" stroke-width="1" />
      {firing && !reduced && age < 300 && <g class="ginger-release-dust" opacity={1 - age / 300}>{[0,1,2,3,4].map(i => <circle key={i} cx={6 + i * 10} cy={BASE - age / 18 - i % 2 * 3} r={1.5 + age / 160} fill="#fff7ea" />)}</g>}
    </g>
    {loaded && <AvatarSprite choice={loaded} x={cx} y={LAUNCH_Y} r={r} />}
  </g>;
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
  const christmas = useGingerbread();
  if (impact.kind === "offscreen") return null;
  const x = impact.x;
  const y = sy(impact.y);
  const tower = impact.kind === "tower";
  if (christmas) return <g class="burst ginger-crumbs">
    {Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2; return <circle key={i} cx={x} cy={y} r={3 + i % 4} fill={i % 3 ? "#c88846" : "#fff1df"} style={{ "--dx": `${Math.cos(a) * (tower ? 45 : 34)}px`, "--dy": `${Math.sin(a) * 38 - 24}px` }} />; })}
  </g>;
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
