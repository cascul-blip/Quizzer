/**
 * Showdown art. The painted files live in ./duel/ (phone copies in ./duel/phone/), made by
 * scripts/showdown-art.py from scripts/showdown-art/ (prompts in "Showdown Art Brief.md").
 * Every number (head per pose, muzzle, hat placement, clip sheets and head tracks) comes from
 * ./duel/meta.ts, which the same script writes; ./duel/manifest.md explains them.
 *
 * The Duelist box is the artist's full 1280x720 canvas (16:9): as tall as its container, as wide
 * as 16:9 says. In it the mannequin head is at about (46.9%, 24.6%) and the soles are on the
 * line y = 90% (canvas y 648), as the brief asked. Every body pose and every clip frame is the
 * same trimmed crop of that canvas (DUEL_BOX in meta.ts), placed back at its canvas spot, so a
 * <Duelist> and a <DuelistClip> drawn in the same place line up exactly. Exported positions
 * (DUEL_HEAD, DUEL_MUZZLE, effect defaults) are % of the full canvas box.
 * Layer order inside it: body → avatar → hat → (tip pose) the hand that covers the head.
 * The CSS is in theme.css ("Showdown").
 */
import type { ComponentChildren, CSSProperties } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { Avatar } from "./avatar-art.tsx";
import { isPhoneArt } from "./phone-art.ts";
import {
  DUEL_AVATAR,
  DUEL_BOX,
  DUEL_CLIPS,
  DUEL_EFFECTS,
  DUEL_EFFECT_WIDTH,
  DUEL_FILES,
  DUEL_HATS,
  DUEL_MUZZLE_RAW,
  DUEL_OBJECTS,
  DUEL_PHONE_ART,
  DUEL_POSE_HEAD,
  DUEL_PROJECTOR_ART,
} from "./duel/meta.ts";

export type DuelPose = "idle" | "ready" | "draw" | "fire" | "stagger" | "tip" | "walk1" | "walk2";
export type DuelClip = "draw-fire" | "stagger" | "holster-spin" | "walk";
export type DuelHat = "brown" | "black" | "white" | "sheriff";
export type DuelFacing = "left" | "right";
type Point = readonly [number, number];
type Style = CSSProperties;

/** Used by the art test. */
export { DUEL_FILES, DUEL_PHONE_ART, DUEL_PROJECTOR_ART };

/** A file by id (no ".webp"): the phone copy on phones when there is one. */
export function duelArt(id: string, phone: boolean = isPhoneArt()): string {
  if (phone && DUEL_PHONE_ART[id]) return DUEL_PHONE_ART[id]!;
  return DUEL_PROJECTOR_ART[id] ?? DUEL_PHONE_ART[id] ?? "";
}

/** Files already fetched and decoded; the Image objects are kept so the browser keeps them decoded. */
const ready = new Set<string>();
const held: HTMLImageElement[] = [];

function warm(src: string, then?: () => void): void {
  if (!src || ready.has(src)) return then?.();
  const img = new Image();
  img.src = src;
  held.push(img);
  img
    .decode()
    .catch(() => {})
    .then(() => {
      ready.add(src);
      then?.();
    });
}

/**
 * Fetch and decode the projector art up front (call when the stage mounts), so a pose or clip
 * swapped in mid-reveal shows at once instead of blinking out while its sheet loads.
 */
export function preloadDuelArt(): void {
  for (const src of Object.values(DUEL_PROJECTOR_ART)) warm(src);
}

/** The still each clip starts from, shown until the clip's sheet is ready. */
const CLIP_START: Record<DuelClip, DuelPose> = { "draw-fire": "idle", stagger: "idle", "holster-spin": "fire", walk: "walk1" };

/** The source canvas every duelist is drawn on; the Duelist box has its shape. */
const CANVAS = { w: 1280, h: 720 } as const;
const [BX, BY] = DUEL_BOX.canvas;
/** % of the trimmed art box (meta.ts) -> % of the full canvas box. */
const toCanvasX = (v: number) => ((BX + (v / 100) * DUEL_BOX.w) / CANVAS.w) * 100;
const toCanvasY = (v: number) => ((BY + (v / 100) * DUEL_BOX.h) / CANVAS.h) * 100;
const toCanvasW = (v: number) => (v * DUEL_BOX.w) / CANVAS.w;
const toCanvasH = (v: number) => (v * DUEL_BOX.h) / CANVAS.h;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Width / height of the Duelist box (the full canvas, 16:9). */
export const DUEL_ASPECT = CANVAS.w / CANVAS.h;

/** The sole line, % of the Duelist box height from the top (the feet stand on it). */
export const DUEL_FEET_Y = round2(toCanvasY(100));

/** Where the trimmed art sits inside the Duelist box, % of it. */
const ART_BOX: Style = { left: `${toCanvasX(0)}%`, top: `${toCanvasY(0)}%`, width: `${toCanvasW(100)}%`, height: `${toCanvasH(100)}%` };

/** The revolver's tip in the "fire" pose facing right, in % of the Duelist box. Mirror x for "left": see duelMuzzle. */
export const DUEL_MUZZLE: { x: number; y: number } = { x: round2(toCanvasX(DUEL_MUZZLE_RAW.x)), y: round2(toCanvasY(DUEL_MUZZLE_RAW.y)) };

/** Head centre per pose facing right, % of the Duelist box (r: the mannequin ball's radius, % of the box height). */
export const DUEL_HEAD = Object.fromEntries(
  Object.entries(DUEL_POSE_HEAD).map(([pose, h]) => [pose, { x: round2(toCanvasX(h.x)), y: round2(toCanvasY(h.y)), r: round2(toCanvasH(h.r)) }]),
) as Record<DuelPose, { x: number; y: number; r: number }>;

const mirrorX = (x: number, facing: DuelFacing) => (facing === "left" ? 100 - x : x);

/** The muzzle for a duelist facing this way, % of its box. */
export const duelMuzzle = (facing: DuelFacing): { x: number; y: number } => ({ x: mirrorX(DUEL_MUZZLE.x, facing), y: DUEL_MUZZLE.y });

/** The head centre of a pose for a duelist facing this way, % of its box. */
export const duelHead = (pose: DuelPose, facing: DuelFacing): { x: number; y: number } => ({ x: mirrorX(DUEL_HEAD[pose].x, facing), y: DUEL_HEAD[pose].y });

/**
 * Where a worn hat sits on a pose facing right: its centre and size, % of the Duelist box. Give a
 * FlyingHat's parent exactly this box so the hat takes off at the size and spot it was worn.
 */
export function duelHat(pose: DuelPose): { x: number; y: number; w: number; h: number } {
  const head = DUEL_POSE_HEAD[pose] ?? DUEL_POSE_HEAD.idle;
  const g = DUEL_HATS.brown;
  return { x: toCanvasX(head.x + g.dx + g.w / 2), y: toCanvasY(head.y + g.dy + g.h / 2), w: toCanvasW(g.w), h: toCanvasH(g.h) };
}

/** Arena 1 is High Noon on Main Street; the others cycle the three streets. */
export function duelStreetId(arena: number): string {
  if (arena === 1) return "high-noon";
  const n = Math.max(0, Math.floor(arena) - 2);
  return `street-${(n % 3) + 1}`;
}

const pct = (v: number) => `${v}%`;

// ---- backgrounds ---------------------------------------------------------------------

/** The panel background: fills its (positioned) container, cropped to cover. */
export function DuelStreet({ arena, phone, class: cls = "" }: { arena: number; phone?: boolean; class?: string }) {
  return <img class={`sd-street ${cls}`} src={duelArt(duelStreetId(arena), phone ?? isPhoneArt())} alt="" draggable={false} />;
}

/** The whole town at sunset, for the title and the podium. Fills its (positioned) container. */
export function TownWide({ class: cls = "" }: { class?: string }) {
  return <img class={`sd-town ${cls}`} src={duelArt("town-wide", false)} alt="" draggable={false} />;
}

export function SheriffStar({ class: cls = "" }: { class?: string }) {
  return <img class={`sd-star ${cls}`} src={duelArt("sheriff-star")} alt="" draggable={false} />;
}

/** Phone only: the holstered revolver close-up (e.g. behind the draw button). */
export function PhoneHolster({ class: cls = "" }: { class?: string }) {
  return <img class={`sd-holster ${cls}`} src={duelArt("phone-holster", true)} alt="" draggable={false} />;
}

/** A parchment wanted poster with the avatar inside; children (name, caption) go under it. */
export function WantedPoster({
  avatar,
  children,
  heading = "WANTED",
  class: cls = "",
}: {
  avatar: AvatarChoice;
  children?: ComponentChildren;
  /** Painted above the avatar; null for none. */
  heading?: string | null;
  class?: string;
}) {
  const f = DUEL_FILES["wanted-frame"]!.projector!;
  return (
    <div class={`sd-wanted ${cls}`} style={{ aspectRatio: `${f[0]} / ${f[1]}`, backgroundImage: `url(${duelArt("wanted-frame")})` }}>
      {heading && <div class="sd-wanted-heading">{heading}</div>}
      <div class="sd-wanted-face">
        <Avatar choice={avatar} />
      </div>
      {children !== undefined && <div class="sd-wanted-caption">{children}</div>}
    </div>
  );
}

// ---- the duelist ---------------------------------------------------------------------

/** The avatar's 100x100 box placed so its head centre (50, 56) is on (x, y) % of the duelist box. */
function faceStyle(x: number, y: number): Style {
  return { left: pct(x - DUEL_AVATAR.w / 2), top: pct(y - DUEL_AVATAR.h * DUEL_AVATAR.cy), width: pct(DUEL_AVATAR.w), height: pct(DUEL_AVATAR.h) };
}

function hatStyle(hat: DuelHat, x: number, y: number): Style {
  const g = DUEL_HATS[hat];
  return { left: pct(x + g.dx), top: pct(y + g.dy), width: pct(g.w), height: pct(g.h) };
}

/** Face, hat and (tip) hand at a head point; shared by Duelist and DuelistClip. */
function Head({ avatar, hat, at, phone, hand }: { avatar: AvatarChoice; hat?: DuelHat | null; at: Point; phone: boolean; hand: boolean }) {
  return (
    <>
      <div class="sd-face" style={faceStyle(at[0], at[1])}>
        <Avatar choice={avatar} />
      </div>
      {hat && <img class="sd-hat" src={duelArt(`hat-${hat}`, phone)} style={hatStyle(hat, at[0], at[1])} alt="" draggable={false} />}
      {hand && <img class="sd-layer" src={duelArt("body-tip-hand", phone)} alt="" draggable={false} />}
    </>
  );
}

interface FigureProps {
  facing: DuelFacing;
  class?: string;
  style?: Style;
  /** Drawn over the duelist in its (unmirrored) box, e.g. a MuzzleFlash or FlyingHat. */
  children?: ComponentChildren;
}

function Figure({ facing, class: cls = "", style, children, inner }: FigureProps & { inner: ComponentChildren }) {
  return (
    <div class={`sd-fig sd-face-${facing} ${cls}`} style={{ aspectRatio: `${CANVAS.w} / ${CANVAS.h}`, ...style }}>
      <div class="sd-fig-flip">
        <div class="sd-fig-art" style={ART_BOX}>
          {inner}
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * A gunslinger with the player's avatar for a head. As tall as its container (give the container
 * a height), feet on the bottom edge. "left" faces screen-left (mirrored; the face itself stays
 * the right way round).
 */
export function Duelist({
  avatar,
  pose,
  facing,
  hat = null,
  phone,
  class: cls,
  style,
  children,
}: FigureProps & { avatar: AvatarChoice; pose: DuelPose; hat?: DuelHat | null; phone?: boolean }) {
  const ph = phone ?? isPhoneArt();
  const head = DUEL_POSE_HEAD[pose] ?? DUEL_POSE_HEAD.idle;
  return (
    <Figure
      facing={facing}
      class={`sd-pose-${pose} ${cls ?? ""}`}
      style={style}
      inner={
        <>
          <img class="sd-layer" src={duelArt(`body-${pose}`, ph)} alt="" draggable={false} />
          <Head avatar={avatar} hat={hat} at={[head.x, head.y]} phone={ph} hand={pose === "tip"} />
        </>
      }
    >
      {children}
    </Figure>
  );
}

/** Calls back with the frame to show, 12 fps, from mount or when `run` turns true. */
function useFrames(frames: number, fps: number, run: boolean, loop: boolean, onEnd?: () => void, key?: unknown): number {
  const [frame, setFrame] = useState(0);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  useEffect(() => {
    setFrame(0);
    if (!run) return;
    let raf = 0;
    let done = false;
    const start = performance.now();
    const tick = (now: number) => {
      let f = Math.floor(((now - start) * fps) / 1000);
      if (loop) f %= frames;
      else if (f >= frames) {
        f = frames - 1;
        done = true;
      }
      setFrame(f);
      if (done) endRef.current?.();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, loop, frames, fps, key]);
  return frame;
}

/** One cell of a sheet in a box exactly the cell's size: the sheet is scaled and shifted under an overflow:hidden window. */
function sheetCell(sheetW: number, sheetH: number, x: number, y: number, cellW: number, cellH: number): Style {
  return { width: pct((sheetW / cellW) * 100), height: pct((sheetH / cellH) * 100), left: pct((-x / cellW) * 100), top: pct((-y / cellH) * 100) };
}

/**
 * Projector only: an animated duelist from a clip sprite sheet, the avatar following the clip's
 * head track. Same box as Duelist, so it swaps in for a pose. Shows the first frame while not
 * playing; without `loop` it holds the last frame once done and calls onEnd.
 */
export function DuelistClip({
  avatar,
  clip,
  facing,
  hat = null,
  playing,
  loop = false,
  onEnd,
  class: cls,
  style,
  children,
}: FigureProps & { avatar: AvatarChoice; clip: DuelClip; hat?: DuelHat | null; playing: boolean; loop?: boolean; onEnd?: () => void }) {
  const m = DUEL_CLIPS[clip];
  const frame = useFrames(m.frames, m.fps, playing, loop, onEnd, clip);
  const step = (n: number, cell: number) => n * (cell + 2 * m.gutter) + m.gutter;
  const x = step(frame % m.cols, m.cellW);
  const y = step(Math.floor(frame / m.cols), m.cellH);
  const head = m.head[frame] ?? m.head[0]!;
  const src = duelArt(`clip-${clip}`, false);
  const [loaded, setLoaded] = useState(() => ready.has(src));
  useEffect(() => {
    if (loaded) return;
    let live = true;
    warm(src, () => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [src]);
  return (
    <Figure
      facing={facing}
      class={`sd-clip-${clip} ${cls ?? ""}`}
      style={style}
      inner={
        <>
          {/* Until the sheet is decoded, the clip's first pose stands in, so the body never blinks out. */}
          {!loaded && <img class="sd-layer" src={duelArt(`body-${CLIP_START[clip]}`, false)} alt="" draggable={false} />}
          <div class="sd-sheet" style={loaded ? undefined : { visibility: "hidden" }}>
            <img src={src} decoding="sync" style={sheetCell(m.w, m.h, x, y, m.cellW, m.cellH)} alt="" draggable={false} />
          </div>
          <Head avatar={avatar} hat={hat} at={head} phone={false} hand={false} />
        </>
      }
    >
      {children}
    </Figure>
  );
}

// ---- effects -------------------------------------------------------------------------
// Each plays once when mounted (give it a new key to replay). By default an effect fills its
// positioned parent (the picture contained and centred), so size and place the parent. Or pass
// x/y: the effect's own anchor (flash core, barrel end, ground point) goes on that point, % of
// the parent, `width` wide (default: its size on a Duelist box), e.g. as Duelist children with
// x/y from duelMuzzle(facing).

interface EffectProps {
  /** Anchor point, % of the parent. Without x and y the effect fills the parent. */
  x?: number;
  y?: number;
  /** Drawn width with x/y, % of the parent's width. */
  width?: number;
  /** "left" mirrors it (a left-facing shooter's flash points left). */
  facing?: DuelFacing;
  class?: string;
  style?: Style;
}

function Effect({ id, kind, x, y, width, facing = "right", class: cls = "", style }: EffectProps & { id: string; kind: string; width: number }) {
  const a = DUEL_EFFECTS[id as keyof typeof DUEL_EFFECTS];
  const ax = mirrorX(a.x, facing);
  const img = <img class={facing === "left" ? "sd-mirrored" : ""} src={duelArt(id)} alt="" draggable={false} />;
  if (x === undefined && y === undefined) {
    return (
      <div class={`sd-fx sd-fill ${cls}`} style={style}>
        <div class={`sd-fx-anim sd-${kind}`} style={{ transformOrigin: `${ax}% ${a.y}%` }}>
          {img}
        </div>
      </div>
    );
  }
  return (
    <div class={`sd-fx ${cls}`} style={{ left: pct(x ?? 50), top: pct(y ?? 50), width: pct(width), transform: `translate(${-ax}%, ${-a.y}%)`, ...style }}>
      <div class={`sd-fx-anim sd-${kind}`} style={{ transformOrigin: `${ax}% ${a.y}%` }}>
        {img}
      </div>
    </div>
  );
}

/** The muzzle flash, about a quarter second. */
export function MuzzleFlash({ width, ...rest }: EffectProps) {
  return <Effect id="muzzle-flash" kind="flash" width={width ?? toCanvasW(DUEL_EFFECT_WIDTH["muzzle-flash"])} {...rest} />;
}

/** A puff of smoke from the barrel that drifts up and fades (about 1.4 s). */
export function GunSmoke({ width, ...rest }: EffectProps) {
  return <Effect id="gun-smoke" kind="smoke" width={width ?? toCanvasW(DUEL_EFFECT_WIDTH["gun-smoke"])} {...rest} />;
}

/** Dust kicked up from the ground, about a second. With x/y the anchor is its bottom centre. */
export function DustPuff({ width, ...rest }: EffectProps) {
  return <Effect id="dust-puff" kind="dust" width={width ?? toCanvasW(DUEL_EFFECT_WIDTH["dust-puff"])} {...rest} />;
}

/** A bullet streaking from one point to another (% of the parent panel), about 0.2 s. */
export function BulletStreak({ from, to, class: cls = "", style }: { from: Point; to: Point; class?: string; style?: Style }) {
  const ref = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<{ len: number; angle: number } | null>(null);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const dx = ((to[0] - from[0]) / 100) * w;
    const dy = ((to[1] - from[1]) / 100) * h;
    setGeo({ len: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI });
  }, [from[0], from[1], to[0], to[1]]);
  const f = DUEL_FILES["bullet-streak"]!.projector!;
  return (
    <div
      ref={ref}
      class={`sd-streak ${cls}`}
      style={{ left: pct(from[0]), top: pct(from[1]), width: geo ? `${geo.len}px` : 0, transform: `rotate(${geo?.angle ?? 0}deg)`, ...style }}
    >
      {geo && <img src={duelArt("bullet-streak")} style={{ height: `${Math.max(3, Math.min(14, (geo.len * 0.45 * f[1]) / f[0]))}px` }} alt="" draggable={false} />}
    </div>
  );
}

/** The hat on the head in canvas px (all four hats share one size). */
const HAT_PX = { w: (DUEL_HATS.brown.w / 100) * DUEL_BOX.w, h: (DUEL_HATS.brown.h / 100) * DUEL_BOX.h };

/**
 * A hat shot off the head: it tumbles up and backwards, then falls away (about 3 s). It fills
 * its positioned parent's width at the start: make the parent a box round the hat on the head
 * (it flies out of the parent; nothing is clipped). Stop passing `hat` to the Duelist meanwhile.
 * "right" = the duelist faces right, so the hat flies off to the left. Projector: the brown hat
 * is the filmed clip; other hats (and phones) spin the still the same way.
 */
export function FlyingHat({ hat, facing, phone, onEnd, class: cls = "" }: { hat: DuelHat; facing: DuelFacing; phone?: boolean; onEnd?: () => void; class?: string }) {
  const m = DUEL_OBJECTS["hat-fly"];
  const ph = phone ?? isPhoneArt();
  const frame = useFrames(m.frames, m.fps, true, false, onEnd);
  const [rx, ry] = m.track[frame] ?? m.track[m.track.length - 1]!;
  const [x0, y0] = m.track[0]!;
  // Offset from the start, in % of the hat's own size; mirrored for a left-facing duelist.
  const dx = ((((rx - x0) / 100) * DUEL_BOX.w) / HAT_PX.w) * 100 * (facing === "left" ? -1 : 1);
  const dy = ((((ry - y0) / 100) * DUEL_BOX.h) / HAT_PX.h) * 100;
  const t = frame / (m.frames - 1);
  const fade = Math.min(1, (m.frames - 1 - frame) / 4);
  const unit: Style = { aspectRatio: `${HAT_PX.w} / ${HAT_PX.h}`, transform: `translate(${dx}%, ${dy - 50}%)`, opacity: fade };
  if (hat === "brown" && !ph) {
    const cw = (((m.size[0] / 100) * DUEL_BOX.w) / HAT_PX.w) * 100;
    const ch = (((m.size[1] / 100) * DUEL_BOX.h) / HAT_PX.h) * 100;
    return (
      <div class={`sd-flying-hat ${cls}`}>
        <div class="sd-hat-unit" style={unit}>
          <div class={`sd-hat-cell ${facing === "left" ? "sd-mirrored" : ""}`} style={{ width: pct(cw), height: pct(ch), left: pct(50 - cw / 2), top: pct(50 - ch / 2) }}>
            <img src={duelArt("clip-hat-fly", false)} style={sheetCell(m.w, m.h, frame * m.cellW, 0, m.cellW, m.cellH)} alt="" draggable={false} />
          </div>
        </div>
      </div>
    );
  }
  // The still, spinning backwards and growing a little like the filmed one.
  const spin = (facing === "left" ? 1 : -1) * 520 * t;
  return (
    <div class={`sd-flying-hat ${cls}`}>
      <div class="sd-hat-unit" style={unit}>
        <img
          class={`sd-hat-still ${facing === "left" ? "sd-mirrored" : ""}`}
          src={duelArt(`hat-${hat}`, ph)}
          style={{ rotate: `${spin}deg`, scale: `${1 + 0.35 * t}` }}
          alt=""
          draggable={false}
        />
      </div>
    </div>
  );
}

/**
 * A tumbleweed rolling across the bottom of its parent with a small bounce. Projector: the
 * filmed roll; phones: the still, spinning.
 */
export function Tumbleweed({
  durationMs = 5000,
  from = "left",
  size = 14,
  bottom = 4,
  phone,
  class: cls = "",
}: {
  durationMs?: number;
  /** The side it enters from. */
  from?: DuelFacing;
  /** Height, % of the parent's height. */
  size?: number;
  /** Ground line, % of the parent's height from the bottom. */
  bottom?: number;
  phone?: boolean;
  class?: string;
}) {
  const m = DUEL_OBJECTS.tumbleweed;
  const ph = phone ?? isPhoneArt();
  const style: Style = { height: pct(size), bottom: pct(bottom), aspectRatio: `${m.cellW} / ${m.cellH}`, animationDuration: `${durationMs}ms` };
  return (
    <div class={`sd-tumble sd-from-${from} ${cls}`} style={style}>
      <div class="sd-tumble-hop">
        {ph ? (
          <img class="sd-tumble-still" src={duelArt("tumbleweed", true)} alt="" draggable={false} />
        ) : (
          <div
            class="sd-tumble-roll"
            style={{
              backgroundImage: `url(${duelArt("clip-tumbleweed", false)})`,
              backgroundSize: `${m.frames * 100}% 100%`,
              animationDuration: `${(m.frames / m.fps) * 1000}ms`,
              animationTimingFunction: `steps(${m.frames}, jump-none)`,
            }}
          />
        )}
      </div>
    </div>
  );
}
