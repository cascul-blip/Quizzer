// why: every number here comes from ./duel/meta.ts, written by scripts/showdown-art.py; ./duel/manifest.md
// explains them. Exported positions are % of the full 1280x720 canvas box, so poses and clips line up.
import type { ComponentChildren, CSSProperties } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { Avatar } from "./avatar-art.tsx";
import {
  DUEL_AVATAR,
  DUEL_BOX,
  DUEL_CLIPS,
  DUEL_EFFECT_WIDTH,
  DUEL_EFFECTS,
  DUEL_FILES,
  DUEL_HATS,
  DUEL_MUZZLE_RAW,
  DUEL_OBJECTS,
  DUEL_PHONE_ART,
  DUEL_POSE_HEAD,
  DUEL_PROJECTOR_ART,
} from "./duel/meta.ts";
import { isPhoneArt } from "./phone-art.ts";

export type DuelPose = "idle" | "ready" | "draw" | "fire" | "stagger" | "tip" | "walk1" | "walk2";
export type DuelClip = "draw-fire" | "stagger" | "holster-spin" | "walk";
export type DuelHat = "brown" | "black" | "white" | "sheriff";
export type DuelFacing = "left" | "right";
type Point = readonly [number, number];
type Style = CSSProperties;

export { DUEL_FILES, DUEL_PHONE_ART, DUEL_PROJECTOR_ART };

export function duelArt(id: string, phone: boolean = isPhoneArt()): string {
  if (phone && DUEL_PHONE_ART[id]) return DUEL_PHONE_ART[id]!;
  return DUEL_PROJECTOR_ART[id] ?? DUEL_PHONE_ART[id] ?? "";
}

const decodedArt = new Set<string>();
// why: holding the Image objects keeps the browser from dropping their decoded pixels.
const heldImages: HTMLImageElement[] = [];

function warm(src: string, then?: () => void): void {
  if (!src || decodedArt.has(src)) return then?.();
  const img = new Image();
  img.src = src;
  heldImages.push(img);
  img
    .decode()
    .catch(() => {})
    .then(() => {
      decodedArt.add(src);
      then?.();
    });
}

// why: decoding up front (when the stage mounts) stops a pose swapped in mid-reveal blinking out while it loads.
export function preloadDuelArt(): void {
  for (const src of Object.values(DUEL_PROJECTOR_ART)) warm(src);
}

const CLIP_FIRST_POSE: Record<DuelClip, DuelPose> = { "draw-fire": "idle", stagger: "idle", "holster-spin": "fire", walk: "walk1" };

const SOURCE_CANVAS_PX = { w: 1280, h: 720 } as const;
const [BX, BY] = DUEL_BOX.canvas;
const trimmedPctToCanvasX = (v: number) => ((BX + (v / 100) * DUEL_BOX.w) / SOURCE_CANVAS_PX.w) * 100;
const trimmedPctToCanvasY = (v: number) => ((BY + (v / 100) * DUEL_BOX.h) / SOURCE_CANVAS_PX.h) * 100;
const trimmedPctToCanvasW = (v: number) => (v * DUEL_BOX.w) / SOURCE_CANVAS_PX.w;
const trimmedPctToCanvasH = (v: number) => (v * DUEL_BOX.h) / SOURCE_CANVAS_PX.h;
const round2 = (v: number) => Math.round(v * 100) / 100;

export const DUEL_ASPECT = SOURCE_CANVAS_PX.w / SOURCE_CANVAS_PX.h;

// why: % of the Duelist box height from the top.
export const DUEL_FEET_Y = round2(trimmedPctToCanvasY(100));

const TRIMMED_ART_BOX_PCT: Style = {
  left: `${trimmedPctToCanvasX(0)}%`,
  top: `${trimmedPctToCanvasY(0)}%`,
  width: `${trimmedPctToCanvasW(100)}%`,
  height: `${trimmedPctToCanvasH(100)}%`,
};

// why: "fire" pose facing right, % of the Duelist box; duelMuzzle mirrors it for "left".
export const DUEL_MUZZLE: { x: number; y: number } = { x: round2(trimmedPctToCanvasX(DUEL_MUZZLE_RAW.x)), y: round2(trimmedPctToCanvasY(DUEL_MUZZLE_RAW.y)) };

// why: facing right, % of the Duelist box; r is the head ball's radius as % of the box height.
export const DUEL_HEAD = Object.fromEntries(
  Object.entries(DUEL_POSE_HEAD).map(([pose, h]) => [
    pose,
    { x: round2(trimmedPctToCanvasX(h.x)), y: round2(trimmedPctToCanvasY(h.y)), r: round2(trimmedPctToCanvasH(h.r)) },
  ]),
) as Record<DuelPose, { x: number; y: number; r: number }>;

const mirrorX = (x: number, facing: DuelFacing) => (facing === "left" ? 100 - x : x);

export const duelMuzzle = (facing: DuelFacing): { x: number; y: number } => ({ x: mirrorX(DUEL_MUZZLE.x, facing), y: DUEL_MUZZLE.y });

export const duelHead = (pose: DuelPose, facing: DuelFacing): { x: number; y: number } => ({ x: mirrorX(DUEL_HEAD[pose].x, facing), y: DUEL_HEAD[pose].y });

// why: give a FlyingHat's parent exactly this box so the hat takes off at the size and spot it was worn.
export function duelHat(pose: DuelPose): { x: number; y: number; w: number; h: number } {
  const head = DUEL_POSE_HEAD[pose] ?? DUEL_POSE_HEAD.idle;
  const g = DUEL_HATS.brown;
  return {
    x: trimmedPctToCanvasX(head.x + g.dx + g.w / 2),
    y: trimmedPctToCanvasY(head.y + g.dy + g.h / 2),
    w: trimmedPctToCanvasW(g.w),
    h: trimmedPctToCanvasH(g.h),
  };
}

const HIGH_NOON_ARENA = 1;
const STREET_COUNT = 3;

export function duelStreetId(arena: number): string {
  if (arena === HIGH_NOON_ARENA) return "high-noon";
  const streetIndex = Math.max(0, Math.floor(arena) - HIGH_NOON_ARENA - 1);
  return `street-${(streetIndex % STREET_COUNT) + 1}`;
}

const pct = (v: number) => `${v}%`;

export function DuelStreet({ arena, phone, class: cls = "" }: { arena: number; phone?: boolean; class?: string }) {
  return <img class={`sd-street ${cls}`} src={duelArt(duelStreetId(arena), phone ?? isPhoneArt())} alt="" draggable={false} />;
}

export function TownWide({ class: cls = "" }: { class?: string }) {
  return <img class={`sd-town ${cls}`} src={duelArt("town-wide", false)} alt="" draggable={false} />;
}

export function SheriffStar({ class: cls = "" }: { class?: string }) {
  return <img class={`sd-star ${cls}`} src={duelArt("sheriff-star")} alt="" draggable={false} />;
}

export function PhoneHolster({ class: cls = "" }: { class?: string }) {
  return <img class={`sd-holster ${cls}`} src={duelArt("phone-holster", true)} alt="" draggable={false} />;
}

export function WantedPoster({
  avatar,
  children,
  winter = false,
  heading = "WANTED",
  class: cls = "",
}: {
  avatar: AvatarChoice;
  children?: ComponentChildren;
  winter?: boolean;
  heading?: string | null;
  class?: string;
}) {
  const f = DUEL_FILES["wanted-frame"]!.projector!;
  return (
    <div
      class={`sd-wanted ${winter ? "snowball-poster" : ""} ${cls}`}
      style={{ aspectRatio: `${f[0]} / ${f[1]}`, backgroundImage: winter ? undefined : `url(${duelArt("wanted-frame")})` }}
    >
      {heading && <div class="sd-wanted-heading">{heading}</div>}
      <div class="sd-wanted-face">
        <Avatar choice={avatar} />
      </div>
      {children !== undefined && <div class="sd-wanted-caption">{children}</div>}
    </div>
  );
}

function faceCentredOn(x: number, y: number): Style {
  return { left: pct(x - DUEL_AVATAR.w / 2), top: pct(y - DUEL_AVATAR.h * DUEL_AVATAR.cy), width: pct(DUEL_AVATAR.w), height: pct(DUEL_AVATAR.h) };
}

function hatStyle(hat: DuelHat, x: number, y: number): Style {
  const g = DUEL_HATS[hat];
  return { left: pct(x + g.dx), top: pct(y + g.dy), width: pct(g.w), height: pct(g.h) };
}

function Head({ avatar, hat, at, phone, hand }: { avatar: AvatarChoice; hat?: DuelHat | null; at: Point; phone: boolean; hand: boolean }) {
  return (
    <>
      <div class="sd-face" style={faceCentredOn(at[0], at[1])}>
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
  // why: drawn in the unmirrored box, so a MuzzleFlash or FlyingHat places itself.
  children?: ComponentChildren;
}

function Figure({ facing, class: cls = "", style, children, inner }: FigureProps & { inner: ComponentChildren }) {
  return (
    <div class={`sd-fig sd-face-${facing} ${cls}`} style={{ aspectRatio: `${SOURCE_CANVAS_PX.w} / ${SOURCE_CANVAS_PX.h}`, ...style }}>
      <div class="sd-fig-flip">
        <div class="sd-fig-art" style={TRIMMED_ART_BOX_PCT}>
          {inner}
        </div>
      </div>
      {children}
    </div>
  );
}

// why: as tall as its container, so the container needs a height; "left" mirrors the body but not the face.
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

// why: the parent must be overflow:hidden and the size of one cell.
function sheetCell(sheetW: number, sheetH: number, x: number, y: number, cellW: number, cellH: number): Style {
  return { width: pct((sheetW / cellW) * 100), height: pct((sheetH / cellH) * 100), left: pct((-x / cellW) * 100), top: pct((-y / cellH) * 100) };
}

// why: same box as Duelist so it swaps in for a pose; without `loop` it holds its last frame and calls onEnd.
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
  const [loaded, setLoaded] = useState(() => decodedArt.has(src));
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
          {!loaded && <img class="sd-layer" src={duelArt(`body-${CLIP_FIRST_POSE[clip]}`, false)} alt="" draggable={false} />}
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

// why: an effect plays once on mount (new key to replay); without x/y it fills its positioned parent.

interface EffectProps {
  // why: the effect's anchor (flash core, barrel end, ground point), % of the parent.
  x?: number;
  y?: number;
  widthPct?: number;
  facing?: DuelFacing;
  class?: string;
  style?: Style;
}

function Effect({ id, kind, x, y, widthPct, facing = "right", class: cls = "", style }: EffectProps & { id: string; kind: string; widthPct: number }) {
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
    <div class={`sd-fx ${cls}`} style={{ left: pct(x ?? 50), top: pct(y ?? 50), width: pct(widthPct), transform: `translate(${-ax}%, ${-a.y}%)`, ...style }}>
      <div class={`sd-fx-anim sd-${kind}`} style={{ transformOrigin: `${ax}% ${a.y}%` }}>
        {img}
      </div>
    </div>
  );
}

export function MuzzleFlash({ widthPct, ...rest }: EffectProps) {
  return <Effect id="muzzle-flash" kind="flash" widthPct={widthPct ?? trimmedPctToCanvasW(DUEL_EFFECT_WIDTH["muzzle-flash"])} {...rest} />;
}

export function GunSmoke({ widthPct, ...rest }: EffectProps) {
  return <Effect id="gun-smoke" kind="smoke" widthPct={widthPct ?? trimmedPctToCanvasW(DUEL_EFFECT_WIDTH["gun-smoke"])} {...rest} />;
}

// why: with x/y the anchor is its bottom centre.
export function DustPuff({ widthPct, ...rest }: EffectProps) {
  return <Effect id="dust-puff" kind="dust" widthPct={widthPct ?? trimmedPctToCanvasW(DUEL_EFFECT_WIDTH["dust-puff"])} {...rest} />;
}

const STREAK_MIN_HEIGHT_PX = 3;
const STREAK_MAX_HEIGHT_PX = 14;
const STREAK_LENGTH_SCALE = 0.45;

export function BulletStreak({ from: fromPct, to: toPct, class: cls = "", style }: { from: Point; to: Point; class?: string; style?: Style }) {
  const ref = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<{ len: number; angle: number } | null>(null);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const dx = ((toPct[0] - fromPct[0]) / 100) * w;
    const dy = ((toPct[1] - fromPct[1]) / 100) * h;
    setGeo({ len: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI });
  }, [fromPct[0], fromPct[1], toPct[0], toPct[1]]);
  const f = DUEL_FILES["bullet-streak"]!.projector!;
  return (
    <div
      ref={ref}
      class={`sd-streak ${cls}`}
      style={{ left: pct(fromPct[0]), top: pct(fromPct[1]), width: geo ? `${geo.len}px` : 0, transform: `rotate(${geo?.angle ?? 0}deg)`, ...style }}
    >
      {geo && (
        <img
          src={duelArt("bullet-streak")}
          style={{ height: `${Math.max(STREAK_MIN_HEIGHT_PX, Math.min(STREAK_MAX_HEIGHT_PX, (geo.len * STREAK_LENGTH_SCALE * f[1]) / f[0]))}px` }}
          alt=""
          draggable={false}
        />
      )}
    </div>
  );
}

// why: all four hats share the brown hat's size.
const WORN_HAT_PX = { w: (DUEL_HATS.brown.w / 100) * DUEL_BOX.w, h: (DUEL_HATS.brown.h / 100) * DUEL_BOX.h };

const HAT_FADE_FRAMES = 4;
const STILL_HAT_SPIN_DEG = 520;
const STILL_HAT_GROWTH = 0.35;

// why: the parent must be a box round the worn hat (see duelHat), and the Duelist must stop wearing `hat` meanwhile.
// Only the brown hat has a filmed clip; other hats and phones spin the still.
export function FlyingHat({
  hat,
  facing,
  phone,
  onEnd,
  class: cls = "",
}: {
  hat: DuelHat;
  facing: DuelFacing;
  phone?: boolean;
  onEnd?: () => void;
  class?: string;
}) {
  const m = DUEL_OBJECTS["hat-fly"];
  const ph = phone ?? isPhoneArt();
  const frame = useFrames(m.frames, m.fps, true, false, onEnd);
  const [rx, ry] = m.track[frame] ?? m.track[m.track.length - 1]!;
  const [x0, y0] = m.track[0]!;
  const dxHatPct = ((((rx - x0) / 100) * DUEL_BOX.w) / WORN_HAT_PX.w) * 100 * (facing === "left" ? -1 : 1);
  const dyHatPct = ((((ry - y0) / 100) * DUEL_BOX.h) / WORN_HAT_PX.h) * 100;
  const t = frame / (m.frames - 1);
  const fade = Math.min(1, (m.frames - 1 - frame) / HAT_FADE_FRAMES);
  const unit: Style = { aspectRatio: `${WORN_HAT_PX.w} / ${WORN_HAT_PX.h}`, transform: `translate(${dxHatPct}%, ${dyHatPct - 50}%)`, opacity: fade };
  if (hat === "brown" && !ph) {
    const cw = (((m.size[0] / 100) * DUEL_BOX.w) / WORN_HAT_PX.w) * 100;
    const ch = (((m.size[1] / 100) * DUEL_BOX.h) / WORN_HAT_PX.h) * 100;
    return (
      <div class={`sd-flying-hat ${cls}`}>
        <div class="sd-hat-unit" style={unit}>
          <div
            class={`sd-hat-cell ${facing === "left" ? "sd-mirrored" : ""}`}
            style={{ width: pct(cw), height: pct(ch), left: pct(50 - cw / 2), top: pct(50 - ch / 2) }}
          >
            <img src={duelArt("clip-hat-fly", false)} style={sheetCell(m.w, m.h, frame * m.cellW, 0, m.cellW, m.cellH)} alt="" draggable={false} />
          </div>
        </div>
      </div>
    );
  }
  const spinDeg = (facing === "left" ? 1 : -1) * STILL_HAT_SPIN_DEG * t;
  return (
    <div class={`sd-flying-hat ${cls}`}>
      <div class="sd-hat-unit" style={unit}>
        <img
          class={`sd-hat-still ${facing === "left" ? "sd-mirrored" : ""}`}
          src={duelArt(`hat-${hat}`, ph)}
          style={{ rotate: `${spinDeg}deg`, scale: `${1 + STILL_HAT_GROWTH * t}` }}
          alt=""
          draggable={false}
        />
      </div>
    </div>
  );
}

export function Tumbleweed({
  durationMs = 5000,
  from = "left",
  heightPct = 14,
  groundPct = 4,
  phone,
  class: cls = "",
}: {
  durationMs?: number;
  from?: DuelFacing;
  heightPct?: number;
  // why: % of the parent's height from the bottom.
  groundPct?: number;
  phone?: boolean;
  class?: string;
}) {
  const m = DUEL_OBJECTS.tumbleweed;
  const ph = phone ?? isPhoneArt();
  const style: Style = { height: pct(heightPct), bottom: pct(groundPct), aspectRatio: `${m.cellW} / ${m.cellH}`, animationDuration: `${durationMs}ms` };
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
