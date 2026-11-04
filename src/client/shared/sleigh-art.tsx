/**
 * Santa's Sleigh Run art: one painted snowy town at night seen from straight above (its houses
 * in sleigh-town.ts), the houses waiting for presents, and Santa's sleigh with its reindeer
 * team. Painted images from scripts/sleigh-art.py, placed in sleigh-rules.ts field units (y down)
 * inside SVGs that share one viewBox, so the projector stacks the houses and the sleighs on the town.
 */
import { Component } from "preact";
import { CITY, CX, CY, FIELD_H, FIELD_W, PAD_R, SLEIGH_L } from "../../shared/sleigh-rules.ts";
import { LIT_PATCHES } from "./sleigh/lit.ts";
import candyCanesImg from "./sleigh/candy-canes.webp";
import chimneyDoneImg from "./sleigh/chimney-done.webp";
import chimneyWaitingImg from "./sleigh/chimney-waiting.webp";
import giftBlueImg from "./sleigh/gift-blue.webp";
import giftGoldImg from "./sleigh/gift-gold.webp";
import giftGreenImg from "./sleigh/gift-green.webp";
import giftKeyImg from "./sleigh/gift-key.webp";
import giftKeyPaintImg from "./sleigh/gift-key-paint.webp";
import giftPurpleImg from "./sleigh/gift-purple.webp";
import giftRedImg from "./sleigh/gift-red.webp";
import launchPadImg from "./sleigh/launch-pad.webp";
import magicDustImg from "./sleigh/magic-dust.webp";
import reindeer1 from "./sleigh/reindeer-1.webp";
import reindeer2 from "./sleigh/reindeer-2.webp";
import reindeer3 from "./sleigh/reindeer-3.webp";
import reindeer4 from "./sleigh/reindeer-4.webp";
import rudolph1 from "./sleigh/rudolph-1.webp";
import rudolph2 from "./sleigh/rudolph-2.webp";
import rudolph3 from "./sleigh/rudolph-3.webp";
import rudolph4 from "./sleigh/rudolph-4.webp";
import sleighImg from "./sleigh/sleigh.webp";
import sleighPaintImg from "./sleigh/sleigh-paint.webp";
import snowPuffImg from "./sleigh/snow-puff.webp";
import sparkleBurstImg from "./sleigh/sparkle-burst.webp";
import townImg from "./sleigh/town.webp";
import wallCornerImg from "./sleigh/wall-corner.webp";
import wallStraightImg from "./sleigh/wall-straight.webp";
import wallWreathImg from "./sleigh/wall-wreath.webp";
import { useTinted } from "./tint.ts";

export { default as TAKEOFF_IMG } from "./sleigh/takeoff.webp";
export { default as CELEBRATION_IMG } from "./sleigh/celebration.webp";
export const SPARKLE_IMG = sparkleBurstImg;
export const SNOW_PUFF_IMG = snowPuffImg;

const f1 = (n: number) => n.toFixed(1);

/** Presents bobbing over the houses still waiting, by house id. */
const GIFTS = [giftRedImg, giftGreenImg, giftBlueImg, giftPurpleImg, giftGoldImg];

// ---------- the town ----------

/** The wall's stone band is this thick; wall-straight.webp is 1024×80 with the band 48.5 px tall. */
const WALL_T = 14;
const WALL_TILE_H = (80 * WALL_T) / 48.5;
const WALL_TILE_W = (1024 * WALL_T) / 48.5;
/** wall-corner.webp (256 px): its arms are 85 px thick, their centre lines cross at (200, 55). */
const CORNER_S = (256 * WALL_T) / 85;
const CORNER_AT = { x: (200 / 256) * CORNER_S, y: (55 / 256) * CORNER_S };

/** One straight run of wall from (x, y), `len` long, turned `angle` degrees. */
function WallRun({ x, y, len, angle }: { x: number; y: number; len: number; angle: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <rect x="0" y={f1(-WALL_TILE_H / 2)} width={len} height={f1(WALL_TILE_H)} fill="url(#sl-wall)" />
    </g>
  );
}

/** The low snow-capped stone wall round the town, pillars at the corners and wreaths along it. */
function CityWall() {
  const { x0, y0, x1, y1 } = CITY;
  const wreaths: [number, number][] = [];
  for (let x = x0 + 160; x < x1 - 80; x += 200) wreaths.push([x, y0], [x, y1]);
  for (let y = y0 + 150; y < y1 - 80; y += 200) wreaths.push([x0, y], [x1, y]);
  // The corner picture is the top-right one; the others are it turned.
  const corners: [number, number, number][] = [
    [x1, y0, 0],
    [x1, y1, 90],
    [x0, y1, 180],
    [x0, y0, 270],
  ];
  const w = 12;
  return (
    <g>
      <defs>
        <pattern id="sl-wall" patternUnits="userSpaceOnUse" x="0" y={f1(-WALL_TILE_H / 2)} width={f1(WALL_TILE_W)} height={f1(WALL_TILE_H)}>
          <image href={wallStraightImg} width={f1(WALL_TILE_W)} height={f1(WALL_TILE_H)} preserveAspectRatio="none" />
        </pattern>
      </defs>
      {/* Outside the wall the town carries on, dimmed, so the flying area reads. */}
      <path d={`M0 0H${FIELD_W}V${FIELD_H}H0ZM${x0} ${y0}V${y1}H${x1}V${y0}Z`} fill="rgba(4,8,24,0.45)" fill-rule="evenodd" />
      <WallRun x={x0} y={y0} len={x1 - x0} angle={0} />
      <WallRun x={x1} y={y0} len={y1 - y0} angle={90} />
      <WallRun x={x1} y={y1} len={x1 - x0} angle={180} />
      <WallRun x={x0} y={y1} len={y1 - y0} angle={270} />
      {corners.map(([x, y, a]) => (
        <g key={a} transform={`translate(${x} ${y}) rotate(${a})`}>
          <image href={wallCornerImg} x={f1(-CORNER_AT.x)} y={f1(-CORNER_AT.y)} width={f1(CORNER_S)} height={f1(CORNER_S)} />
        </g>
      ))}
      {wreaths.map(([x, y], i) => (
        <image key={i} href={wallWreathImg} x={x - w / 2} y={y - w / 2} width={w} height={w} />
      ))}
    </g>
  );
}

/** The North Pole launch pad in the middle of town; the painted ice has a blank ring for the words. */
function LaunchPad() {
  const r = PAD_R;
  const textR = r * 0.6;
  return (
    <g>
      <circle cx={CX} cy={CY} r={r + 18} fill="url(#sl-padglow)" />
      <circle cx={CX + 3} cy={CY + 5} r={r} fill="rgba(0,0,0,0.35)" />
      <image href={launchPadImg} x={CX - r} y={CY - r} width={r * 2} height={r * 2} />
      <defs>
        <path id="sl-pad-top" d={`M${CX - textR} ${CY}A${textR} ${textR} 0 0 1 ${CX + textR} ${CY}`} />
      </defs>
      <text class="sleigh-pad-text" font-size="13" letter-spacing="4">
        <textPath href="#sl-pad-top" startOffset="50%" text-anchor="middle">
          NORTH POLE
        </textPath>
      </text>
    </g>
  );
}

/** The whole town's ground, static: the painted town, the wall and the North Pole launch pad. */
export class CityGround extends Component<{ class?: string }> {
  shouldComponentUpdate(next: { class?: string }) {
    return next.class !== this.props.class;
  }
  render() {
    return (
      <svg class={`sleigh-city ${this.props.class ?? ""}`} viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <radialGradient id="sl-padglow">
            <stop offset="0.75" stop-color="#cfe0ff" stop-opacity="0.25" />
            <stop offset="1" stop-color="#cfe0ff" stop-opacity="0" />
          </radialGradient>
        </defs>
        <image href={townImg} width={FIELD_W} height={FIELD_H} preserveAspectRatio="none" />
        <CityWall />
        <LaunchPad />
      </svg>
    );
  }
}

// ---------- houses ----------

/** Gradients the houses share: put once in the svg that holds them. */
export function HouseDefs() {
  return (
    <defs>
      <radialGradient id="sl-chimney">
        <stop offset="0" stop-color="#ffcf5a" stop-opacity="0.95" />
        <stop offset="0.4" stop-color="#ff8a1f" stop-opacity="0.45" />
        <stop offset="1" stop-color="#ff6a00" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="sl-shadow">
        <stop offset="0" stop-color="#02061a" stop-opacity="0.55" />
        <stop offset="1" stop-color="#02061a" stop-opacity="0" />
      </radialGradient>
    </defs>
  );
}

export interface HouseShape {
  id: number;
  spot: number;
  x: number;
  y: number;
  w: number;
  h: number;
  chimney: { x: number; y: number };
  deliveredBy?: string | null;
}

/** A wrapped present in `color` (the gift-key picture tinted), centred on (0, 0), `s` across. */
export function Gift({ s, color }: { s: number; color: string }) {
  const href = useTinted(giftKeyImg, giftKeyPaintImg, color);
  return <image href={href} x={-s / 2} y={-s / 2} width={s} height={s} />;
}

const CHIMNEY = 14;

/**
 * A house of the painted town. Still waiting: its chimney glows, a gold ring marks it and a present bobs over it.
 * Delivered (`color` = the deliverer's): the house switches to its lit picture (string lights
 * and window glow), the fire is out and a present in the deliverer's colour sits on the roof.
 */
export function House({ house, color }: { house: HouseShape; color?: string | null }) {
  const { x, y, w, h, chimney: ch } = house;
  const done = !!color;
  const patch = LIT_PATCHES[house.spot];
  const cx = x + ch.x;
  const cy = y + ch.y;
  return (
    <g class={`sleigh-house ${done ? "is-done" : "is-waiting"}`}>
      {done && patch && <image class="sleigh-lit" href={patch.href} x={patch.x} y={patch.y} width={patch.w} height={patch.h} />}
      <g transform={`translate(${f1(cx)} ${f1(cy)})`}>
        {!done && <circle class="sleigh-chimney-glow" r="46" fill="url(#sl-chimney)" />}
        <image href={done ? chimneyDoneImg : chimneyWaitingImg} x={-CHIMNEY / 2} y={-CHIMNEY / 2} width={CHIMNEY} height={CHIMNEY} />
      </g>
      {done ? (
        // The present, in the deliverer's colour, on the roof beside the chimney.
        <g transform={`translate(${f1(cx + (ch.x < w / 2 ? 15 : -15))} ${f1(cy + (ch.y < h / 2 ? 11 : -11))}) rotate(${((house.id * 23) % 40) - 20})`}>
          <ellipse cx="2" cy="3" rx="9" ry="8" fill="url(#sl-shadow)" />
          <Gift s={15} color={color!} />
        </g>
      ) : (
        // Big enough to spot on a low-resolution projector: a steady gold ring (dark-edged, so it
        // shows on snowy roofs and dark streets alike), a pulse spreading from it and a large present.
        <g transform={`translate(${f1(cx)} ${f1(cy)})`}>
          <circle r="30" fill="none" stroke="rgba(8,14,40,0.75)" stroke-width="8" />
          <circle r="30" fill="none" stroke="#ffd23f" stroke-width="3.5" />
          <circle class="sleigh-gift-ring" r="30" fill="none" stroke="#ffd23f" stroke-width="4" stroke-dasharray="7 5" />
          <ellipse class="sleigh-gift-shadow" cx="3" cy="5" rx="17" ry="10" fill="url(#sl-shadow)" />
          <g class="sleigh-gift-bob">
            <image class="sleigh-gift" href={GIFTS[house.id % GIFTS.length]} x="-19" y="-19" width="38" height="38" />
          </g>
        </g>
      )}
    </g>
  );
}

// ---------- the sleigh ----------

/**
 * The team pictures are 30×15 field units (1024 px = 3 m), nose to the right. A reindeer is
 * 18.4 units nose to tail with antlers 10.7 across; Rudolph's nose is 8.6 ahead of his centre.
 */
const SPRITE_W = 30;
const SPRITE_H = 15;
const DEER = [reindeer1, reindeer2, reindeer3, reindeer4];
const RUDOLPH = [rudolph1, rudolph2, rudolph3, rudolph4];
/** One gallop stride, in seconds. */
const STRIDE_S = 0.44;

/** The four gallop frames, each shown for a quarter of the stride; `offset` starts part-way in. */
function Gallop({ frames, offset }: { frames: string[]; offset: number }) {
  return (
    <>
      {frames.map((href, i) => (
        <image key={i} href={href} x={-SPRITE_W / 2} y={-SPRITE_H / 2} width={SPRITE_W} height={SPRITE_H} opacity={i === 0 ? 1 : 0}>
          <animate attributeName="opacity" values={frames.map((_, k) => (k === i ? 1 : 0)).join(";")} calcMode="discrete" dur={`${STRIDE_S}s`} begin={`${-offset * STRIDE_S}s`} repeatCount="indefinite" />
        </image>
      ))}
    </>
  );
}

/**
 * The reindeer, galloping (two strides out of step, so the pairs don't move as one) and
 * standing; every sleigh uses them. Put once in the svg that holds the sleighs.
 */
export function SleighTeamDefs() {
  const still = (href: string) => <image href={href} x={-SPRITE_W / 2} y={-SPRITE_H / 2} width={SPRITE_W} height={SPRITE_H} />;
  return (
    <defs>
      <radialGradient id="sl-team-shadow">
        <stop offset="0" stop-color="#02061a" stop-opacity="0.5" />
        <stop offset="1" stop-color="#02061a" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="sl-nose">
        <stop offset="0" stop-color="#ff5a5a" stop-opacity="0.9" />
        <stop offset="1" stop-color="#ff2020" stop-opacity="0" />
      </radialGradient>
      <g id="sl-deer-a">
        <Gallop frames={DEER} offset={0} />
      </g>
      <g id="sl-deer-b">
        <Gallop frames={DEER} offset={0.5} />
      </g>
      <g id="sl-rudolph-run">
        <Gallop frames={RUDOLPH} offset={0.25} />
      </g>
      <g id="sl-deer-still">{still(reindeer1)}</g>
      <g id="sl-rudolph-still">{still(rudolph1)}</g>
    </defs>
  );
}

/** Reindeer centres along the team (sleigh-relative), back pair, front pair, Rudolph. */
const BACK = -3;
const FRONT = 14;
const LEAD = 30;
const PAIR_Y = 6.5;
/** The sleigh's centre and the front of its body (where the harness starts). */
const SLEIGH_X = -27;
const SLEIGH_FRONT = -14;
/** The team below is drawn 80 long; scaled up to SLEIGH_L. */
const TEAM_SCALE = SLEIGH_L / 80;

/**
 * Santa's sleigh and team from above, SLEIGH_L long and SLEIGH_W wide, centred on (0, 0) and
 * flying along +x: the sleigh at the back (painted `color`), two pairs of reindeer and Rudolph
 * leading. `turn` (−1…1) swings the team into the turn; `gallop` runs the reindeer; `flying`
 * adds a trail of magic dust. Needs SleighTeamDefs in the same svg.
 */
export function SleighTeam({ color, turn = 0, gallop = false, flying = false }: { color: string; turn?: number; gallop?: boolean; flying?: boolean }) {
  const sleigh = useTinted(sleighImg, sleighPaintImg, color);
  const lean = Math.max(-1, Math.min(1, turn)) * 10;
  const deer = (id: "a" | "b") => (gallop ? `#sl-deer-${id}` : "#sl-deer-still");
  return (
    <g class="sleigh-team" transform={`scale(${TEAM_SCALE})`}>
      {flying && <image class="sleigh-dust" href={magicDustImg} x={SLEIGH_X - 12 - 44} y="-6" width="48" height="12" />}
      <ellipse cx="4" cy="5" rx="44" ry="13" fill="url(#sl-team-shadow)" />
      {/* The team swings into the turn round the front of the sleigh. */}
      <g transform={`rotate(${f1(lean)} ${SLEIGH_FRONT} 0)`}>
        {/* Harness: traces from the sleigh through each pair to Rudolph. */}
        <g stroke="#3a2210" stroke-width="1.1" fill="none">
          <path d={`M${SLEIGH_FRONT} -3L${BACK - 6} ${-PAIR_Y}L${FRONT + 8} ${-PAIR_Y}L${LEAD - 4} -1.5M${SLEIGH_FRONT} 3L${BACK - 6} ${PAIR_Y}L${FRONT + 8} ${PAIR_Y}L${LEAD - 4} 1.5`} />
          <path d={`M${SLEIGH_FRONT} 0H${LEAD - 6}`} stroke-dasharray="2 3" stroke="#f2c14e" stroke-width="1" />
        </g>
        <use href={deer("a")} x={BACK} y={-PAIR_Y} />
        <use href={deer("b")} x={BACK} y={PAIR_Y} />
        <use href={deer("b")} x={FRONT} y={-PAIR_Y} />
        <use href={deer("a")} x={FRONT} y={PAIR_Y} />
        <use href={gallop ? "#sl-rudolph-run" : "#sl-rudolph-still"} x={LEAD} y="0" />
        <circle class="sleigh-nose-glow" cx={LEAD + 8.6} cy="0.2" r="7" fill="url(#sl-nose)" />
      </g>
      <image href={sleigh} x={SLEIGH_X - SPRITE_W / 2} y={-SPRITE_H / 2} width={SPRITE_W} height={SPRITE_H} />
    </g>
  );
}

// ---------- extras ----------

/** Two crossed candy canes tied with a bow and holly, for the "get ready" screen. */
export function CandyCanes({ class: cls }: { class?: string }) {
  return <img class={`sleigh-canes ${cls ?? ""}`} src={candyCanesImg} alt="" />;
}

/** Falling snow over the scene: three repeating layers of flakes drifting down at different speeds. */
export function Snowfall({ class: cls }: { class?: string }) {
  return (
    <div class={`sleigh-snowfall ${cls ?? ""}`} aria-hidden="true">
      <i class="s1" />
      <i class="s2" />
      <i class="s3" />
    </div>
  );
}
