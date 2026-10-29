/**
 * Kingdom Siege art: a hand-painted tabletop diorama with a castle wall on the left and 5
 * lanes of meadow, painted miniatures for the defenders and monsters, and the effects drawn
 * in code (warning arrows, lane flashes, hit flashes, the Lv 3 glow, dust, confetti).
 *
 * The pictures are painted: scripts/siege-art.py turns the sources in scripts/siege-art/
 * into the WebPs in ./siege/ and the phone copies in ./siege/phone/. Every position below
 * comes from ./siege/manifest.md (squares, anchors, cut-out pivots, layer order); change
 * them there first. Phones only load the defender icons, the coin and the heart.
 */
import type { ComponentChildren, JSX } from "preact";
import type { HostSiegeDefender, HostSiegeMonster } from "../../shared/protocol.ts";
import type { SiegeDefenderType, SiegeMonsterType } from "../../shared/siege-rules.ts";
import archerDrawImg from "./siege/archer-draw.webp";
import archerReadyImg from "./siege/archer-ready.webp";
import arrowImg from "./siege/arrow.webp";
import bannerClothImg from "./siege/banner-cloth.webp";
import boardImg from "./siege/board.webp";
import castleCrackedImg from "./siege/castle-wall-cracked.webp";
import castleFallenImg from "./siege/castle-wall-fallen.webp";
import castleImg from "./siege/castle-wall.webp";
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
import stoneWallCrackedImg from "./siege/stone-wall-cracked.webp";
import stoneWallImg from "./siege/stone-wall.webp";
import trollSmashImg from "./siege/troll-smash.webp";
import trollWalkImg from "./siege/troll-walk.webp";
import wolfLeapImg from "./siege/wolf-leap.webp";
import wolfRunImg from "./siege/wolf-run.webp";
import { pickArt } from "./phone-art.ts";

// ---------- the numbers from ./siege/manifest.md ----------

/** board.webp, in px. Everything on the board is placed in these pixels and drawn in % of them. */
const BOARD = { w: 1344, h: 768 };
/** The castle wall layers sit at (0, 0) over the board's left edge. */
const CASTLE = { w: 360, h: 768 };
/** Each lane's y range and its 8 squares' x ranges (square 1 next to the wall, square 8 the entry), in board px. */
const LANES: readonly { y0: number; y1: number; x: readonly (readonly [number, number])[] }[] = [
  { y0: 67, y1: 151, x: [[248, 376], [376, 505], [505, 633], [633, 762], [762, 890], [890, 1018], [1018, 1147], [1147, 1275]] },
  { y0: 169, y1: 261, x: [[248, 380], [380, 512], [512, 645], [645, 777], [777, 909], [909, 1041], [1041, 1174], [1174, 1306]] },
  { y0: 279, y1: 381, x: [[248, 384], [384, 521], [521, 657], [657, 794], [794, 930], [930, 1067], [1067, 1203], [1203, 1339]] },
  { y0: 399, y1: 512, x: [[248, 385], [385, 522], [522, 659], [659, 796], [796, 933], [933, 1070], [1070, 1207], [1207, 1344]] },
  { y0: 530, y1: 655, x: [[248, 385], [385, 522], [522, 659], [659, 796], [796, 933], [933, 1070], [1070, 1207], [1207, 1344]] },
];
/** Figures are drawn at lane height / FIGURE_LANE_PX, with the anchor this share of the lane height below the square centre. */
const FIGURE_LANE_PX = 130;
const ANCHOR_DROP = 0.12;

interface Canvas {
  w: number;
  h: number;
  /** The centre of the base, in the figure's own px. */
  ax: number;
  ay: number;
}

const FIGURES: Record<"archer" | "knight" | "wall" | SiegeMonsterType, Canvas> = {
  archer: { w: 180, h: 220, ax: 82, ay: 188 },
  knight: { w: 200, h: 240, ax: 99, ay: 205 },
  wall: { w: 200, h: 180, ax: 91, ay: 135 },
  goblin: { w: 150, h: 180, ax: 91, ay: 155 },
  wolf: { w: 220, h: 160, ax: 113, ay: 123 },
  troll: { w: 280, h: 300, ax: 162, ay: 252 },
  giant: { w: 420, h: 520, ax: 226, ay: 440 },
};

/** Cut-out pieces, back to front, with their pivots in the figure's px. */
const KNIGHT_PIVOT = { body: [99, 136], head: [107, 83], sword: [84, 83], shield: [125, 84] } as const;
const GIANT_PIVOT = { torso: [228, 290], head: [226, 119], right: [148, 143], left: [299, 98] } as const;

/** Level details: where each one's foot (or bottom-middle) goes on its figure's canvas. */
const PENNANT = { w: 64, h: 96 };
const ARCHER_PENNANT = { foot: [12, 95], ready: [151, 92], draw: [115, 4] } as const;
const KNIGHT_PENNANT = { foot: [10, 95], at: [114, 118] } as const;
const WALL_COURSE = { w: 130, h: 53, foot: [65, 39], at: [96, 52] } as const;
const WALL_SPIKES = { w: 110, h: 79, foot: [55, 62], at: [96, 32] } as const;

/** The banner boxes on the castle layers (for the victory flourish), and the wall's face. */
export const CASTLE_FACE_X = 242;
export const BANNER_BOXES = [
  [193, 201, 222, 313],
  [194, 396, 222, 512],
  [194, 586, 224, 698],
] as const;

// ---------- placing things on the board ----------

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/** A square's centre x on a lane, for any position in squares (k = square k's centre, 0.5 = the wall face). */
function laneX(lane: number, x: number): number {
  const squares = LANES[lane]!.x;
  const centre = (k: number) => (squares[k - 1]![0] + squares[k - 1]![1]) / 2;
  if (x <= 1) return squares[0]![0] + (centre(1) - squares[0]![0]) * Math.max(0, (x - 0.5) * 2);
  if (x >= 8) return centre(8) + (squares[7]![1] - centre(8)) * Math.min(1, (x - 8) * 2);
  const k = Math.floor(x);
  return centre(k) + (centre(k + 1) - centre(k)) * (x - k);
}

/** Where a figure's base centre goes, and how big it is drawn. */
function boardPoint(lane: number, x: number): { px: number; py: number; scale: number } {
  const l = LANES[Math.max(0, Math.min(LANES.length - 1, lane))]!;
  const h = l.y1 - l.y0;
  return { px: laneX(lane, x), py: (l.y0 + l.y1) / 2 + ANCHOR_DROP * h, scale: h / FIGURE_LANE_PX };
}

/** The style that puts a figure canvas on the board with its anchor at (px, py). Lower figures draw on top. */
function placeStyle(c: Canvas, p: { px: number; py: number; scale: number }): JSX.CSSProperties {
  const w = c.w * p.scale;
  const h = c.h * p.scale;
  return {
    left: pct(p.px - c.ax * p.scale, BOARD.w),
    top: pct(p.py - c.ay * p.scale, BOARD.h),
    width: pct(w, BOARD.w),
    height: pct(h, BOARD.h),
    zIndex: Math.round(p.py),
    "--ox": `${(c.ax / c.w) * 100}%`,
    "--oy": `${(c.ay / c.h) * 100}%`,
  };
}

/** A layer on a figure canvas (full size unless given), placed in the canvas's own px. */
function Layer({ src, c, box, origin, class: cls = "", style }: { src: string; c: Canvas; box?: [number, number, number, number]; origin?: readonly [number, number]; class?: string; style?: JSX.CSSProperties }) {
  const [x, y, w, h] = box ?? [0, 0, c.w, c.h];
  return (
    <img
      class={`siege-layer ${cls}`}
      src={src}
      alt=""
      draggable={false}
      style={{
        left: pct(x, c.w),
        top: pct(y, c.h),
        width: pct(w, c.w),
        height: pct(h, c.h),
        ...(origin ? { transformOrigin: `${pct(origin[0] - x, w)} ${pct(origin[1] - y, h)}` } : {}),
        ...style,
      }}
    />
  );
}

/** A detail whose foot point lands on a point of the canvas. */
function footBox(detail: { w: number; h: number }, foot: readonly [number, number], at: readonly [number, number]): [number, number, number, number] {
  return [at[0] - foot[0], at[1] - foot[1], detail.w, detail.h];
}

/** Alternating animation names restart a CSS animation each time a counter changes. */
const flip = (name: string, seq: number) => (seq > 0 ? `${name}-${seq % 2 ? "a" : "b"}` : "");

// ---------- the board ----------

export function SiegeBoard({ hearts, castle = "auto", children, class: cls = "" }: { hearts: number; castle?: "auto" | "crumble" | "fallen"; children?: ComponentChildren; class?: string }) {
  const layer = castle === "fallen" ? castleFallenImg : hearts <= 5 ? castleCrackedImg : castleImg;
  return (
    <div class={`siege-board ${cls}`} style={{ aspectRatio: `${BOARD.w} / ${BOARD.h}` }}>
      <img class="siege-board-img" src={boardImg} alt="" draggable={false} />
      <div class={`siege-castle ${castle}`} style={{ width: pct(CASTLE.w, BOARD.w) }}>
        {castle === "crumble" ? (
          <>
            <img class="castle-fallen-under" src={castleFallenImg} alt="" draggable={false} />
            <img class="castle-crumbling" src={castleCrackedImg} alt="" draggable={false} />
          </>
        ) : (
          <img src={layer} alt="" draggable={false} />
        )}
      </div>
      {castle === "crumble" && (
        <div class="castle-dust" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <img key={i} src={dustImg} alt="" style={{ "--i": String(i), top: `${12 + i * 12}%` }} />
          ))}
        </div>
      )}
      <div class="siege-figures">{children}</div>
    </div>
  );
}

/** A lane's rectangle on the board (buildable squares and the entry square). */
function laneRect(lane: number): JSX.CSSProperties {
  const l = LANES[lane]!;
  return { left: pct(l.x[0]![0], BOARD.w), top: pct(l.y0, BOARD.h), width: pct(l.x[7]![1] - l.x[0]![0], BOARD.w), height: pct(l.y1 - l.y0, BOARD.h) };
}

/** A lane flashing red: danger (a monster near the wall) or the giant's horn. */
export function LaneFlash({ lane, kind }: { lane: number; kind: "danger" | "giant" }) {
  return <div class={`siege-lane-flash ${kind}`} style={laneRect(lane)} aria-hidden="true" />;
}

/** A small arrow at the lane's right edge: a monster is coming onto this lane. */
export function WarningArrow({ lane }: { lane: number }) {
  const l = LANES[lane]!;
  const right = Math.min(BOARD.w - 6, l.x[7]![1]);
  return (
    <div class="siege-warning" style={{ left: pct(right - 46, BOARD.w), top: pct((l.y0 + l.y1) / 2 - 22, BOARD.h), zIndex: 2000 }} aria-hidden="true">
      ◀
    </div>
  );
}

/** A thin health bar at a hurt figure's feet. */
function healthBar(health: number, max: number) {
  if (health >= max) return null;
  return (
    <span class="siege-hp" aria-hidden="true">
      <i style={{ width: `${Math.max(0, (health / max) * 100)}%` }} />
    </span>
  );
}

// ---------- defenders ----------

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
      {level >= 2 && <Layer src={lv2PennantArcherImg} c={c} box={footBox(PENNANT, ARCHER_PENNANT.foot, drawing ? ARCHER_PENNANT.draw : ARCHER_PENNANT.ready)} class="pennant" />}
    </>
  );
}

/** The knight's cut-out: legs, (Lv 2 banner behind his back), body, head, sword arm, shield arm. Each strike swings the sword arm and leans the body. */
function Knight({ level, attackSeq }: { level: number; attackSeq: number }) {
  const c = FIGURES.knight;
  const P = KNIGHT_PIVOT;
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

// ---------- monsters ----------

/** A monster at position x (in squares). Walking ones bob; attacking ones switch pose on each hit. */
export function MonsterFigure({ m, x, posed }: { m: HostSiegeMonster; x: number; posed: boolean }) {
  const c = FIGURES[m.type];
  const p = boardPoint(m.lane, x);
  const walking = m.state === "walk";
  return (
    <div class={`siege-fig monster ${m.type} state-${m.state}`} style={placeStyle(c, p)}>
      <div class={`siege-move ${walking ? "bob" : ""} ${m.type === "giant" ? "" : flip("lunge", m.attackSeq)}`}>
        <div class={`siege-fig-inner ${flip("hit", m.hitSeq)}`}>
          {m.type === "giant" ? <Giant attackSeq={m.attackSeq} /> : <Layer src={monsterPose(m.type, m.state === "leap" || (m.state === "attack" && posed))} c={c} />}
        </div>
      </div>
      {healthBar(m.health, m.maxHealth)}
    </div>
  );
}

function monsterPose(type: Exclude<SiegeMonsterType, "giant">, action: boolean): string {
  if (type === "goblin") return action ? goblinAttackImg : goblinWalkImg;
  if (type === "wolf") return action ? wolfLeapImg : wolfRunImg;
  return action ? trollSmashImg : trollWalkImg;
}

/** The giant's cut-out: legs, torso, head, right arm with the club, left arm. Each stomp swings the club down. */
function Giant({ attackSeq }: { attackSeq: number }) {
  const c = FIGURES.giant;
  const P = GIANT_PIVOT;
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

/** A defeated monster tips over on its base and fades; one that reached the wall fades into a puff of dust. */
export function FallenFigure({ type, lane, x, reachedWall }: { type: SiegeMonsterType; lane: number; x: number; reachedWall: boolean }) {
  const c = FIGURES[type];
  const p = boardPoint(lane, x);
  return (
    <div class={`siege-fig fallen ${reachedWall ? "at-wall" : "tipped"}`} style={placeStyle(c, p)} aria-hidden="true">
      <div class="siege-fig-inner">{type === "giant" ? <Giant attackSeq={0} /> : <Layer src={monsterPose(type, false)} c={c} />}</div>
      <DustPuff />
    </div>
  );
}

/** Dust from a defeat, a destroyed defender or a stomp: grows and fades. Bottom-middle on the ground. */
export function DustPuff({ at }: { at?: { lane: number; x: number } }) {
  if (!at) return <img class="siege-dust" src={dustImg} alt="" />;
  const p = boardPoint(at.lane, at.x);
  const w = 160 * p.scale;
  const h = 120 * p.scale;
  return <img class="siege-dust loose" src={dustImg} alt="" style={{ left: pct(p.px - w / 2, BOARD.w), top: pct(p.py - h, BOARD.h), width: pct(w, BOARD.w), height: pct(h, BOARD.h), zIndex: Math.round(p.py) + 1 }} />;
}

/** An arrow flying from an archer to where it lands. */
export function ArrowShot({ lane, from, to }: { lane: number; from: number; to: number }) {
  const a = boardPoint(lane, from);
  const b = boardPoint(lane, to);
  const lift = 70 * a.scale;
  const w = 64 * a.scale;
  const h = 16 * a.scale;
  return (
    <img
      class="siege-arrow"
      src={arrowImg}
      alt=""
      style={{
        left: pct(a.px, BOARD.w),
        top: pct(a.py - lift, BOARD.h),
        width: pct(w, BOARD.w),
        height: pct(h, BOARD.h),
        zIndex: 1500,
        "--dx": `${((b.px - a.px - w) / w) * 100}%`,
      }}
    />
  );
}

// ---------- the endings ----------

/** Confetti for "The kingdom stands!". */
export function Confetti() {
  const colors = ["#1f4fa8", "#f5f1e6", "#d6a531", "#2f7d3a", "#b23a2e"];
  return (
    <div class="siege-confetti" aria-hidden="true">
      {Array.from({ length: 60 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], "--d": `${(i % 12) * 0.17}s`, "--s": `${2.6 + (i % 5) * 0.4}s`, "--r": `${(i * 53) % 360}deg` }} />
      ))}
    </div>
  );
}

/** The cross banners rising for the victory (the spare banner cloth). */
export function RisingBanners() {
  return (
    <div class="siege-rising-banners" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <img key={i} src={bannerClothImg} alt="" style={{ "--i": String(i) }} />
      ))}
    </div>
  );
}

// ---------- icons (projector and phone) ----------

const DEFENDER_ICON: Record<SiegeDefenderType, string> = {
  archer: phoneArcherIconImg,
  knight: phoneKnightIconImg,
  wall: phoneWallIconImg,
};

export function SiegeIcon({ kind, class: cls = "" }: { kind: "coin" | "heart" | SiegeDefenderType; class?: string }) {
  const src = kind === "coin" ? pickArt(coinImg, phoneCoinImg) : kind === "heart" ? pickArt(heartImg, phoneHeartImg) : DEFENDER_ICON[kind];
  return <img class={`siege-icon ${cls}`} src={src} alt="" draggable={false} />;
}

export const DEFENDER_EMOJI: Record<SiegeDefenderType, string> = { archer: "🏹", knight: "⚔️", wall: "🧱" };
