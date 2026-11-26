import type { ComponentChildren, JSX } from "preact";
import type { HostSiegeDefender, HostSiegeMonster } from "../../shared/modes/siege.ts";
import type { SiegeDefenderType, SiegeMonsterType } from "../../shared/siege-rules.ts";
import { SIEGE_CRACKED_HEARTS } from "../../shared/siege-rules.ts";
import { pickArt } from "./phone-art.ts";
import archerDrawImg from "./siege/archer-draw.webp";
import archerReadyImg from "./siege/archer-ready.webp";
import arrowImg from "./siege/arrow.webp";
import bannerClothImg from "./siege/banner-cloth.webp";
import boardImg from "./siege/board.webp";
import castleImg from "./siege/castle-wall.webp";
import castleCrackedImg from "./siege/castle-wall-cracked.webp";
import castleFallenImg from "./siege/castle-wall-fallen.webp";
import christmasArcherDrawImg from "./siege/christmas/archer-draw.webp";
import christmasArcherReadyImg from "./siege/christmas/archer-ready.webp";
import christmasArrowImg from "./siege/christmas/arrow.webp";
import christmasBannerClothImg from "./siege/christmas/banner-cloth.webp";
import christmasBoardImg from "./siege/christmas/board.webp";
import christmasCastleImg from "./siege/christmas/castle-wall.webp";
import christmasCastleCrackedImg from "./siege/christmas/castle-wall-cracked.webp";
import christmasCastleFallenImg from "./siege/christmas/castle-wall-fallen.webp";
import christmasCoinImg from "./siege/christmas/coin.webp";
import christmasDustImg from "./siege/christmas/dust-puff.webp";
import christmasGiantHeadImg from "./siege/christmas/giant-head.webp";
import christmasGiantLeftArmImg from "./siege/christmas/giant-left-arm.webp";
import christmasGiantLegsImg from "./siege/christmas/giant-legs.webp";
import christmasGiantRightArmImg from "./siege/christmas/giant-right-arm.webp";
import christmasGiantTorsoImg from "./siege/christmas/giant-torso.webp";
import christmasGoblinAttackImg from "./siege/christmas/goblin-attack.webp";
import christmasGoblinWalkImg from "./siege/christmas/goblin-walk.webp";
import christmasHeartImg from "./siege/christmas/heart.webp";
import christmasKnightBodyImg from "./siege/christmas/knight-body.webp";
import christmasKnightHeadImg from "./siege/christmas/knight-head.webp";
import christmasKnightLegsImg from "./siege/christmas/knight-legs.webp";
import christmasKnightShieldArmImg from "./siege/christmas/knight-shield-arm.webp";
import christmasKnightSwordArmImg from "./siege/christmas/knight-sword-arm.webp";
import christmasLv2PennantArcherImg from "./siege/christmas/lv2-pennant-archer.webp";
import christmasLv2PennantKnightImg from "./siege/christmas/lv2-pennant-knight.webp";
import christmasLv2WallCourseImg from "./siege/christmas/lv2-wall-course.webp";
import christmasLv3TrimArcherImg from "./siege/christmas/lv3-trim-archer.webp";
import christmasLv3TrimKnightImg from "./siege/christmas/lv3-trim-knight.webp";
import christmasLv3TrimWallImg from "./siege/christmas/lv3-trim-wall.webp";
import christmasLv3WallSpikesImg from "./siege/christmas/lv3-wall-spikes.webp";
import toyboxManifest from "./siege/christmas/manifest.json";
import christmasPhoneArcherIconImg from "./siege/christmas/phone/archer-icon.webp";
import christmasPhoneCoinImg from "./siege/christmas/phone/coin.webp";
import christmasPhoneHeartImg from "./siege/christmas/phone/heart.webp";
import christmasPhoneKnightIconImg from "./siege/christmas/phone/knight-icon.webp";
import christmasPhoneWallIconImg from "./siege/christmas/phone/stone-wall-icon.webp";
import christmasStoneWallImg from "./siege/christmas/stone-wall.webp";
import christmasStoneWallCrackedImg from "./siege/christmas/stone-wall-cracked.webp";
import christmasTrollSmashImg from "./siege/christmas/troll-smash.webp";
import christmasTrollWalkImg from "./siege/christmas/troll-walk.webp";
import christmasWolfLeapImg from "./siege/christmas/wolf-leap.webp";
import christmasWolfRunImg from "./siege/christmas/wolf-run.webp";
import coinImg from "./siege/coin.webp";
import dustImg from "./siege/dust-puff.webp";
import giantHeadImg from "./siege/giant-head.webp";
import giantLeftArmImg from "./siege/giant-left-arm.webp";
import giantLegsImg from "./siege/giant-legs.webp";
import giantRightArmImg from "./siege/giant-right-arm.webp";
import giantTorsoImg from "./siege/giant-torso.webp";
import goblinAttackImg from "./siege/goblin-attack.webp";
import goblinWalkImg from "./siege/goblin-walk.webp";
import heartImg from "./siege/heart.webp";
import knightBodyImg from "./siege/knight-body.webp";
import knightHeadImg from "./siege/knight-head.webp";
import knightLegsImg from "./siege/knight-legs.webp";
import knightShieldArmImg from "./siege/knight-shield-arm.webp";
import knightSwordArmImg from "./siege/knight-sword-arm.webp";
import lv2PennantArcherImg from "./siege/lv2-pennant-archer.webp";
import lv2PennantKnightImg from "./siege/lv2-pennant-knight.webp";
import lv2WallCourseImg from "./siege/lv2-wall-course.webp";
import lv3TrimArcherImg from "./siege/lv3-trim-archer.webp";
import lv3TrimKnightImg from "./siege/lv3-trim-knight.webp";
import lv3TrimWallImg from "./siege/lv3-trim-wall.webp";
import lv3WallSpikesImg from "./siege/lv3-wall-spikes.webp";
import phoneArcherIconImg from "./siege/phone/archer-icon.webp";
import phoneCoinImg from "./siege/phone/coin.webp";
import phoneHeartImg from "./siege/phone/heart.webp";
import phoneKnightIconImg from "./siege/phone/knight-icon.webp";
import phoneWallIconImg from "./siege/phone/stone-wall-icon.webp";
import stoneWallImg from "./siege/stone-wall.webp";
import stoneWallCrackedImg from "./siege/stone-wall-cracked.webp";
import trollSmashImg from "./siege/troll-smash.webp";
import trollWalkImg from "./siege/troll-walk.webp";
import wolfLeapImg from "./siege/wolf-leap.webp";
import wolfRunImg from "./siege/wolf-run.webp";
import { useChristmasSiege } from "./siege-skin.tsx";

// why: keyed by bundled URL, and identical classic files share one URL, so the coin and heart
// are picked as themed pairs in SiegeIcon instead.
const TOYBOX_ART: Record<string, string> = {
  [archerDrawImg]: christmasArcherDrawImg,
  [archerReadyImg]: christmasArcherReadyImg,
  [arrowImg]: christmasArrowImg,
  [bannerClothImg]: christmasBannerClothImg,
  [boardImg]: christmasBoardImg,
  [castleCrackedImg]: christmasCastleCrackedImg,
  [castleFallenImg]: christmasCastleFallenImg,
  [castleImg]: christmasCastleImg,
  [dustImg]: christmasDustImg,
  [giantHeadImg]: christmasGiantHeadImg,
  [giantLeftArmImg]: christmasGiantLeftArmImg,
  [giantLegsImg]: christmasGiantLegsImg,
  [giantRightArmImg]: christmasGiantRightArmImg,
  [giantTorsoImg]: christmasGiantTorsoImg,
  [goblinAttackImg]: christmasGoblinAttackImg,
  [goblinWalkImg]: christmasGoblinWalkImg,
  [knightBodyImg]: christmasKnightBodyImg,
  [knightHeadImg]: christmasKnightHeadImg,
  [knightLegsImg]: christmasKnightLegsImg,
  [knightShieldArmImg]: christmasKnightShieldArmImg,
  [knightSwordArmImg]: christmasKnightSwordArmImg,
  [lv2PennantArcherImg]: christmasLv2PennantArcherImg,
  [lv2PennantKnightImg]: christmasLv2PennantKnightImg,
  [lv2WallCourseImg]: christmasLv2WallCourseImg,
  [lv3TrimArcherImg]: christmasLv3TrimArcherImg,
  [lv3TrimKnightImg]: christmasLv3TrimKnightImg,
  [lv3TrimWallImg]: christmasLv3TrimWallImg,
  [lv3WallSpikesImg]: christmasLv3WallSpikesImg,
  [phoneArcherIconImg]: christmasPhoneArcherIconImg,
  [phoneKnightIconImg]: christmasPhoneKnightIconImg,
  [phoneWallIconImg]: christmasPhoneWallIconImg,
  [stoneWallCrackedImg]: christmasStoneWallCrackedImg,
  [stoneWallImg]: christmasStoneWallImg,
  [trollSmashImg]: christmasTrollSmashImg,
  [trollWalkImg]: christmasTrollWalkImg,
  [wolfLeapImg]: christmasWolfLeapImg,
  [wolfRunImg]: christmasWolfRunImg,
};

function ArtImage({ src, ...props }: JSX.IntrinsicElements["img"]) {
  const christmas = useChristmasSiege();
  return <img {...props} src={christmas && typeof src === "string" ? (TOYBOX_ART[src] ?? src) : src} />;
}

const BOARD_SIZE_PX = { w: 1344, h: 768 };
const CASTLE_SIZE_PX = { w: 360, h: 768 };
/** why: lane art coordinates must match the landmarks measured in ./siege/manifest.md. */
const LANES: readonly { y0: number; y1: number; x: readonly (readonly [number, number])[] }[] = [
  {
    y0: 67,
    y1: 151,
    x: [
      [248, 376],
      [376, 505],
      [505, 633],
      [633, 762],
      [762, 890],
      [890, 1018],
      [1018, 1147],
      [1147, 1275],
    ],
  },
  {
    y0: 169,
    y1: 261,
    x: [
      [248, 380],
      [380, 512],
      [512, 645],
      [645, 777],
      [777, 909],
      [909, 1041],
      [1041, 1174],
      [1174, 1306],
    ],
  },
  {
    y0: 279,
    y1: 381,
    x: [
      [248, 384],
      [384, 521],
      [521, 657],
      [657, 794],
      [794, 930],
      [930, 1067],
      [1067, 1203],
      [1203, 1339],
    ],
  },
  {
    y0: 399,
    y1: 512,
    x: [
      [248, 385],
      [385, 522],
      [522, 659],
      [659, 796],
      [796, 933],
      [933, 1070],
      [1070, 1207],
      [1207, 1344],
    ],
  },
  {
    y0: 530,
    y1: 655,
    x: [
      [248, 385],
      [385, 522],
      [522, 659],
      [659, 796],
      [796, 933],
      [933, 1070],
      [1070, 1207],
      [1207, 1344],
    ],
  },
];
const FIGURE_LANE_PX = 130;
const ANCHOR_DROP_LANE_FRACTION = 0.12;

interface Canvas {
  w: number;
  h: number;
  anchorXPx: number;
  anchorYPx: number;
}

const FIGURES: Record<"archer" | "knight" | "wall" | SiegeMonsterType, Canvas> = {
  archer: { w: 180, h: 220, anchorXPx: 82, anchorYPx: 188 },
  knight: { w: 200, h: 240, anchorXPx: 99, anchorYPx: 205 },
  wall: { w: 200, h: 180, anchorXPx: 91, anchorYPx: 135 },
  goblin: { w: 150, h: 180, anchorXPx: 91, anchorYPx: 155 },
  wolf: { w: 220, h: 160, anchorXPx: 113, anchorYPx: 123 },
  troll: { w: 280, h: 300, anchorXPx: 162, anchorYPx: 252 },
  giant: { w: 420, h: 520, anchorXPx: 226, anchorYPx: 440 },
};

const KNIGHT_PIVOTS_PX = { body: [99, 136], head: [107, 83], sword: [84, 83], shield: [125, 84] } as const;
const GIANT_PIVOTS_PX = { torso: [228, 290], head: [226, 119], right: [148, 143], left: [299, 98] } as const;

const PENNANT = { w: 64, h: 96 };
const ARCHER_PENNANT_PLACEMENT_PX = { foot: [12, 95], ready: [151, 92], draw: [115, 4] } as const;
const KNIGHT_PENNANT = { foot: [10, 95], at: [114, 118] } as const;
const WALL_COURSE = { w: 130, h: 53, foot: [65, 39], at: [96, 52] } as const;
const WALL_SPIKES = { w: 110, h: 79, foot: [55, 62], at: [96, 32] } as const;

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

function laneX(lane: number, squarePosition: number): number {
  const squares = LANES[lane]!.x;
  const centre = (k: number) => (squares[k - 1]![0] + squares[k - 1]![1]) / 2;
  const WALL_FACE_SQUARE_POSITION = 0.5;
  if (squarePosition <= 1) return squares[0]![0] + (centre(1) - squares[0]![0]) * Math.max(0, (squarePosition - WALL_FACE_SQUARE_POSITION) * 2);
  if (squarePosition >= 8) return centre(8) + (squares[7]![1] - centre(8)) * Math.min(1, (squarePosition - 8) * 2);
  const k = Math.floor(squarePosition);
  return centre(k) + (centre(k + 1) - centre(k)) * (squarePosition - k);
}

function boardPoint(lane: number, x: number): { px: number; py: number; scale: number } {
  const l = LANES[Math.max(0, Math.min(LANES.length - 1, lane))]!;
  const h = l.y1 - l.y0;
  return { px: laneX(lane, x), py: (l.y0 + l.y1) / 2 + ANCHOR_DROP_LANE_FRACTION * h, scale: h / FIGURE_LANE_PX };
}

function placeStyle(c: Canvas, p: { px: number; py: number; scale: number }): JSX.CSSProperties {
  const w = c.w * p.scale;
  const h = c.h * p.scale;
  return {
    left: pct(p.px - c.anchorXPx * p.scale, BOARD_SIZE_PX.w),
    top: pct(p.py - c.anchorYPx * p.scale, BOARD_SIZE_PX.h),
    width: pct(w, BOARD_SIZE_PX.w),
    height: pct(h, BOARD_SIZE_PX.h),
    zIndex: Math.round(p.py),
    "--ox": `${(c.anchorXPx / c.w) * 100}%`,
    "--oy": `${(c.anchorYPx / c.h) * 100}%`,
  };
}

function Layer({
  src,
  c,
  box: boxPx,
  origin: pivotPx,
  class: cls = "",
  style,
}: {
  src: string;
  c: Canvas;
  box?: [number, number, number, number];
  origin?: readonly number[];
  class?: string;
  style?: JSX.CSSProperties;
}) {
  const [x, y, w, h] = boxPx ?? [0, 0, c.w, c.h];
  return (
    <ArtImage
      class={`siege-layer ${cls}`}
      src={src}
      alt=""
      draggable={false}
      style={{
        left: pct(x, c.w),
        top: pct(y, c.h),
        width: pct(w, c.w),
        height: pct(h, c.h),
        ...(pivotPx ? { transformOrigin: `${pct(pivotPx[0] - x, w)} ${pct(pivotPx[1] - y, h)}` } : {}),
        ...style,
      }}
    />
  );
}

function footBox(detail: { w: number; h: number }, foot: readonly [number, number], at: readonly [number, number]): [number, number, number, number] {
  return [at[0] - foot[0], at[1] - foot[1], detail.w, detail.h];
}

/** why: alternating animation names restart a CSS animation each time a counter changes. */
const flip = (name: string, seq: number) => (seq > 0 ? `${name}-${seq % 2 ? "a" : "b"}` : "");

export function SiegeBoard({
  hearts,
  castle = "auto",
  children,
  class: cls = "",
}: {
  hearts: number;
  castle?: "auto" | "crumble" | "fallen";
  children?: ComponentChildren;
  class?: string;
}) {
  const christmas = useChristmasSiege();
  const layer = castle === "fallen" ? castleFallenImg : hearts <= SIEGE_CRACKED_HEARTS ? castleCrackedImg : castleImg;
  return (
    <div class={`siege-board ${christmas ? "siege-christmas" : ""} ${cls}`} style={{ aspectRatio: `${BOARD_SIZE_PX.w} / ${BOARD_SIZE_PX.h}` }}>
      <ArtImage class="siege-board-img" src={boardImg} alt="" draggable={false} />
      <div class={`siege-castle ${castle}`} style={{ width: pct(CASTLE_SIZE_PX.w, BOARD_SIZE_PX.w) }}>
        {castle === "crumble" ? (
          <>
            <ArtImage class="castle-fallen-under" src={castleFallenImg} alt="" draggable={false} />
            <ArtImage class="castle-crumbling" src={castleCrackedImg} alt="" draggable={false} />
          </>
        ) : (
          <ArtImage src={layer} alt="" draggable={false} />
        )}
      </div>
      {castle === "crumble" && (
        <div class="castle-dust" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <ArtImage key={i} src={dustImg} alt="" style={{ "--i": String(i), top: `${12 + i * 12}%` }} />
          ))}
        </div>
      )}
      <div class="siege-figures">{children}</div>
    </div>
  );
}

function laneRect(lane: number): JSX.CSSProperties {
  const l = LANES[lane]!;
  return {
    left: pct(l.x[0]![0], BOARD_SIZE_PX.w),
    top: pct(l.y0, BOARD_SIZE_PX.h),
    width: pct(l.x[7]![1] - l.x[0]![0], BOARD_SIZE_PX.w),
    height: pct(l.y1 - l.y0, BOARD_SIZE_PX.h),
  };
}

export function LaneFlash({ lane, kind }: { lane: number; kind: "danger" | "giant" }) {
  return <div class={`siege-lane-flash ${kind}`} style={laneRect(lane)} aria-hidden="true" />;
}

export function WarningArrow({ lane }: { lane: number }) {
  const l = LANES[lane]!;
  const right = Math.min(BOARD_SIZE_PX.w - 6, l.x[7]![1]);
  return (
    <div
      class="siege-warning"
      style={{ left: pct(right - 46, BOARD_SIZE_PX.w), top: pct((l.y0 + l.y1) / 2 - 22, BOARD_SIZE_PX.h), zIndex: 2000 }}
      aria-hidden="true"
    >
      ◀
    </div>
  );
}

function healthBar(health: number, max: number) {
  if (health >= max) return null;
  return (
    <span class="siege-hp" aria-hidden="true">
      <i style={{ width: `${Math.max(0, (health / max) * 100)}%` }} />
    </span>
  );
}

export function DefenderFigure({ d, fresh, drawing }: { d: HostSiegeDefender; fresh: boolean; drawing: boolean }) {
  const c = FIGURES[d.type];
  const p = boardPoint(d.lane, d.square);
  const glow = d.level >= 3 ? "lv3-glow" : "";
  return (
    <div class={`siege-fig defender ${d.type} ${fresh ? "dropped" : ""}`} style={placeStyle(c, p)}>
      <div class={`siege-fig-inner ${glow} ${flip("hit", d.hitSeq)}`}>
        {d.type === "archer" && <Archer level={d.level} drawing={drawing} />}
        {d.type === "knight" && <Knight level={d.level} attackSeq={d.attackSeq} />}
        {d.type === "wall" && <StoneWall level={d.level} cracked={d.health <= d.maxHealth / 2} />}
      </div>
      {healthBar(d.health, d.maxHealth)}
    </div>
  );
}

function Archer({ level, drawing }: { level: number; drawing: boolean }) {
  const c = FIGURES.archer;
  return (
    <>
      <Layer src={drawing ? archerDrawImg : archerReadyImg} c={c} />
      {level >= 3 && <Layer src={lv3TrimArcherImg} c={c} />}
      {level >= 2 && (
        <Layer
          src={lv2PennantArcherImg}
          c={c}
          box={footBox(PENNANT, ARCHER_PENNANT_PLACEMENT_PX.foot, drawing ? ARCHER_PENNANT_PLACEMENT_PX.draw : ARCHER_PENNANT_PLACEMENT_PX.ready)}
          class="pennant"
        />
      )}
    </>
  );
}

/** why: pieces draw in order, so the Lv 2 banner sits between legs and body (behind his back). */
function Knight({ level, attackSeq }: { level: number; attackSeq: number }) {
  const c = FIGURES.knight;
  const P = useChristmasSiege() ? toyboxManifest.knight.pivots : KNIGHT_PIVOTS_PX;
  return (
    <>
      <Layer src={knightLegsImg} c={c} />
      {level >= 3 && <Layer src={lv3TrimKnightImg} c={c} />}
      <div class={`siege-piece knight-upper ${flip("lean", attackSeq)}`} style={{ transformOrigin: `${pct(P.body[0], c.w)} ${pct(P.body[1], c.h)}` }}>
        {level >= 2 && <Layer src={lv2PennantKnightImg} c={c} box={footBox(PENNANT, KNIGHT_PENNANT.foot, KNIGHT_PENNANT.at)} />}
        <Layer src={knightBodyImg} c={c} />
        <Layer src={knightHeadImg} c={c} origin={P.head} class="knight-head" />
        <Layer src={knightSwordArmImg} c={c} origin={P.sword} class={`knight-sword ${flip("swing", attackSeq)}`} />
        <Layer src={knightShieldArmImg} c={c} origin={P.shield} class="knight-shield" />
      </div>
    </>
  );
}

function StoneWall({ level, cracked }: { level: number; cracked: boolean }) {
  const c = FIGURES.wall;
  return (
    <>
      <Layer src={cracked ? stoneWallCrackedImg : stoneWallImg} c={c} />
      {level >= 3 && <Layer src={lv3TrimWallImg} c={c} />}
      {level >= 2 && <Layer src={lv2WallCourseImg} c={c} box={footBox(WALL_COURSE, WALL_COURSE.foot, WALL_COURSE.at)} />}
      {level >= 3 && <Layer src={lv3WallSpikesImg} c={c} box={footBox(WALL_SPIKES, WALL_SPIKES.foot, WALL_SPIKES.at)} />}
    </>
  );
}

export function MonsterFigure({ m, x, posed }: { m: HostSiegeMonster; x: number; posed: boolean }) {
  const christmas = useChristmasSiege();
  const c = monsterCanvas(m.type, christmas);
  const p = boardPoint(m.lane, x);
  const walking = m.state === "walk";
  return (
    <div class={`siege-fig monster ${m.type} state-${m.state}`} style={placeStyle(c, p)}>
      <div class={`siege-move ${walking ? "bob" : ""} ${m.type === "giant" ? "" : flip("lunge", m.attackSeq)}`}>
        <div class={`siege-fig-inner ${flip("hit", m.hitSeq)}`}>
          {m.type === "giant" ? (
            <Giant attackSeq={m.attackSeq} />
          ) : (
            <Layer src={monsterPose(m.type, m.state === "leap" || (m.state === "attack" && posed))} c={c} />
          )}
        </div>
      </div>
      {healthBar(m.health, m.maxHealth)}
    </div>
  );
}

/** why: pose canvases can extend around a weapon while their base stays on the same lane point. */
function monsterCanvas(type: SiegeMonsterType, christmas: boolean): Canvas {
  if (!christmas) return FIGURES[type];
  const { size, anchor } = toyboxManifest[type];
  return { w: size[0]!, h: size[1]!, anchorXPx: anchor[0]!, anchorYPx: anchor[1]! };
}

function monsterPose(type: Exclude<SiegeMonsterType, "giant">, action: boolean): string {
  if (type === "goblin") return action ? goblinAttackImg : goblinWalkImg;
  if (type === "wolf") return action ? wolfLeapImg : wolfRunImg;
  return action ? trollSmashImg : trollWalkImg;
}

function Giant({ attackSeq }: { attackSeq: number }) {
  const c = FIGURES.giant;
  const P = useChristmasSiege() ? toyboxManifest.giant.pivots : GIANT_PIVOTS_PX;
  return (
    <>
      <Layer src={giantLegsImg} c={c} />
      <div class={`siege-piece giant-upper ${flip("lean", attackSeq)}`} style={{ transformOrigin: `${pct(P.torso[0], c.w)} ${pct(P.torso[1], c.h)}` }}>
        <Layer src={giantTorsoImg} c={c} />
        <Layer src={giantHeadImg} c={c} origin={P.head} class="giant-head" />
        <Layer src={giantRightArmImg} c={c} origin={P.right} class={`giant-club ${flip("club", attackSeq)}`} />
        <Layer src={giantLeftArmImg} c={c} origin={P.left} class="giant-left" />
      </div>
    </>
  );
}

export function FallenFigure({ type, lane, x, reachedWall }: { type: SiegeMonsterType; lane: number; x: number; reachedWall: boolean }) {
  const christmas = useChristmasSiege();
  const c = monsterCanvas(type, christmas);
  const p = boardPoint(lane, x);
  return (
    <div class={`siege-fig fallen ${reachedWall ? "at-wall" : "tipped"}`} style={placeStyle(c, p)} aria-hidden="true">
      <div class="siege-fig-inner">{type === "giant" ? <Giant attackSeq={0} /> : <Layer src={monsterPose(type, false)} c={c} />}</div>
      <DustPuff />
    </div>
  );
}

export function DustPuff({ at }: { at?: { lane: number; x: number } }) {
  if (!at) return <ArtImage class="siege-dust" src={dustImg} alt="" />;
  const p = boardPoint(at.lane, at.x);
  const w = 160 * p.scale;
  const h = 120 * p.scale;
  return (
    <ArtImage
      class="siege-dust loose"
      src={dustImg}
      alt=""
      style={{
        left: pct(p.px - w / 2, BOARD_SIZE_PX.w),
        top: pct(p.py - h, BOARD_SIZE_PX.h),
        width: pct(w, BOARD_SIZE_PX.w),
        height: pct(h, BOARD_SIZE_PX.h),
        zIndex: Math.round(p.py) + 1,
      }}
    />
  );
}

export function ArrowShot({ lane, from, to }: { lane: number; from: number; to: number }) {
  const a = boardPoint(lane, from);
  const b = boardPoint(lane, to);
  const lift = 70 * a.scale;
  const w = 64 * a.scale;
  const h = 16 * a.scale;
  return (
    <ArtImage
      class="siege-arrow"
      src={arrowImg}
      alt=""
      style={{
        left: pct(a.px, BOARD_SIZE_PX.w),
        top: pct(a.py - lift, BOARD_SIZE_PX.h),
        width: pct(w, BOARD_SIZE_PX.w),
        height: pct(h, BOARD_SIZE_PX.h),
        zIndex: 1500,
        "--dx": `${((b.px - a.px - w) / w) * 100}%`,
      }}
    />
  );
}

export function Confetti() {
  const colors = ["#1f4fa8", "#f5f1e6", "#d6a531", "#2f7d3a", "#b23a2e"];
  return (
    <div class="siege-confetti" aria-hidden="true">
      {Array.from({ length: 60 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            "--d": `${(i % 12) * 0.17}s`,
            "--s": `${2.6 + (i % 5) * 0.4}s`,
            "--r": `${(i * 53) % 360}deg`,
          }}
        />
      ))}
    </div>
  );
}

export function RisingBanners() {
  return (
    <div class="siege-rising-banners" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <ArtImage key={i} src={bannerClothImg} alt="" style={{ "--i": String(i) }} />
      ))}
    </div>
  );
}

const DEFENDER_ICON: Record<SiegeDefenderType, string> = {
  archer: phoneArcherIconImg,
  knight: phoneKnightIconImg,
  wall: phoneWallIconImg,
};

const ICON_PAIRS = {
  classic: { coin: [coinImg, phoneCoinImg], heart: [heartImg, phoneHeartImg] },
  christmas: { coin: [christmasCoinImg, christmasPhoneCoinImg], heart: [christmasHeartImg, christmasPhoneHeartImg] },
} as const;

export function SiegeIcon({ kind, class: cls = "" }: { kind: "coin" | "heart" | SiegeDefenderType; class?: string }) {
  const christmas = useChristmasSiege();
  const src = kind === "coin" || kind === "heart" ? pickArt(...ICON_PAIRS[christmas ? "christmas" : "classic"][kind]) : DEFENDER_ICON[kind];
  return <ArtImage class={`siege-icon ${cls}`} src={src} alt="" draggable={false} />;
}

export const DEFENDER_EMOJI: Record<SiegeDefenderType, string> = { archer: "🏹", knight: "⚔️", wall: "🧱" };
