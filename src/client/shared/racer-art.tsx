import { useEffect, useRef, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type { SeasonTheme } from "../../shared/themed-modes.ts";
import { modeTheme } from "../../shared/themed-modes.ts";
import { Avatar } from "./avatar-art.tsx";
import carImg from "./racer/car.webp";
import carCrashedImg from "./racer/car-crashed.webp";
import christmasCar from "./racer/christmas/car.webp";
import christmasCrash from "./racer/christmas/car-crashed.webp";
import santaFlyby from "./racer/christmas/santa-flyby.webp";
import christmasSkyline from "./racer/christmas/skyline.webp";
import christmasTree from "./racer/christmas/tree.webp";
import palmImg from "./racer/palm.webp";
import skylineImg from "./racer/skyline.webp";

// why: lengths in racer units (--racer-u in theme.css) are % of the scene's height.
const SKYLINE_HEIGHT_U = 40;
const SKYLINE_SOURCE_PX = { w: 960, h: 101 };
const SKYLINE_TILE_U = (SKYLINE_HEIGHT_U * SKYLINE_SOURCE_PX.w) / SKYLINE_SOURCE_PX.h;
const DASH_AND_GAP_U = 30;
const REFERENCE_SCENE_PX = 1000;
const ROAD_PX_PER_S_PER_MPH = 9;
const SKYLINE_RATE = 0.04;
const PALM_RATE = 0.55;
// why: the time constant for the shown speed to close the gap to the real one.
const EASE_S = 1.5;
const PALM_LEFTS_PCT = [7, 35, 78];
const BOB_MPH = 2;
const BOB_FAST_MPH = 60;
export const SPACE_MPH = 200;
const SLIDE_MS = 1600;
const CAR_HEIGHT_U = 85;
const CAR_SPRITE_HEIGHT_PX = 160;
// why: a longer gap means the tab was hidden, and the scene shouldn't leap ahead.
const MAX_FRAME_STEP_S = 0.1;
const STAR_COUNT = 70;
const STAR_RATE = 0.25;
const TRAIL_BANDS = 6;
const TRAIL_MIN_S = 0.15;
const TRAIL_MAX_S = 0.8;
const TRAIL_FULL_MPH = 400;
const SANTA_FIRST_S = 3;
const SANTA_INTERVAL_S = 30;
const SANTA_PASS_S = 8;

export function santaFlybyProgress(spaceSeconds: number): number | null {
  if (spaceSeconds < SANTA_FIRST_S) return null;
  const elapsed = (spaceSeconds - SANTA_FIRST_S) % SANTA_INTERVAL_S;
  return elapsed < SANTA_PASS_S ? elapsed / SANTA_PASS_S : null;
}
// why: keep in step with the eject animations in theme.css.
const EJECT_ROAD_MS = 2200;
const EJECT_SPACE_MS = 2600;
const EJECT_GAP_MS = 140;
const EJECT_SPREAD_MS = 1400;
const STAR_COLORS = ["#ffffff", "#ffffff", "#cfe3ff", "#9fc4ff", "#ffc23d", "#ff8a1f"];

export function starTrailSeconds(mph: number): number {
  const k = Math.max(0, Math.min(1, (mph - SPACE_MPH) / (TRAIL_FULL_MPH - SPACE_MPH)));
  return TRAIL_MIN_S + (TRAIL_MAX_S - TRAIL_MIN_S) * k;
}

interface Star {
  xShare: number;
  yShare: number;
  depth: number;
  color: string;
}

const FARTHEST_STAR_DEPTH = 0.3;

function newStar(xShare: number): Star {
  const depth = FARTHEST_STAR_DEPTH + (1 - FARTHEST_STAR_DEPTH) * Math.random();
  return { xShare, yShare: Math.random(), depth, color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]! };
}

interface RacerSceneProps {
  theme?: SeasonTheme;
  // why: mph; the scene eases toward it, so it may jump.
  speed: number;
  // why: overrides speed: the scene coasts to a stop.
  crashed: boolean;
  onLand?: () => void;
  // why: each new `key` plays it once.
  ejected?: { key: string | number; riders: { avatar: AvatarChoice; name: string }[] };
  class?: string;
}

interface Ejection {
  key: string | number;
  // why: frozen at the start, so a car that drops back to the road mid-flight doesn't change the animation.
  mode: "road" | "space";
  riders: { avatar: AvatarChoice; name: string; delay: number; spin: number; lift: number }[];
}

export function RacerScene({ speed, crashed, onLand, ejected, theme, class: cls }: RacerSceneProps) {
  const christmas = modeTheme("racer", theme) === "christmas";
  const target = crashed ? 0 : Math.max(0, speed);
  const root = useRef<HTMLDivElement>(null);
  const skyline = useRef<HTMLDivElement>(null);
  const palms = useRef<HTMLDivElement>(null);
  const dashes = useRef<HTMLDivElement>(null);
  const car = useRef<HTMLDivElement>(null);
  const stars = useRef<HTMLCanvasElement>(null);
  const santa = useRef<HTMLDivElement>(null);
  // why: starting at the real speed means a scene that appears mid-race is already moving.
  const motion = useRef({ target, shown: target, kick: () => {}, onLand, christmas });
  motion.current.onLand = onLand;
  motion.current.christmas = christmas;
  const [ejection, setEjection] = useState<Ejection | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const m = motion.current;
    let width = 0;
    let skylineW = 1;
    let dashW = 1;
    let skylineX = 0;
    let palmX = 0;
    let dashX = 0;
    let raf = 0;
    let last = 0;
    // why: the space state lives in data attributes, which re-renders leave alone.
    let space = m.shown > SPACE_MPH;
    let landing = 0;
    let starsShown = false;
    let spaceSeconds = 0;
    el.dataset.space = space ? "on" : "off";
    el.style.setProperty("--racer-slide", `${SLIDE_MS}ms`);
    // why: waiting two frames stops the first frame animating the slide.
    let readyRaf = requestAnimationFrame(() => {
      readyRaf = requestAnimationFrame(() => (el.dataset.ready = ""));
    });
    const sky: Star[] = Array.from({ length: STAR_COUNT }, () => newStar(Math.random()));
    const ctx = stars.current?.getContext("2d") ?? null;

    const updateSpace = () => {
      const up = m.shown > SPACE_MPH;
      if (up === space) return;
      space = up;
      spaceSeconds = 0;
      el.dataset.space = up ? "on" : "off";
      clearTimeout(landing);
      landing = 0;
      if (!up)
        landing = window.setTimeout(
          () => {
            landing = 0;
            drawStars();
            m.onLand?.();
          },
          still.matches ? 0 : SLIDE_MS,
        );
    };

    const drawStars = () => {
      const c = stars.current;
      if (!ctx || !c) return;
      const on = space || landing !== 0;
      if (!on && !starsShown) return;
      ctx.clearRect(0, 0, c.width, c.height);
      starsShown = on;
      if (!on) return;
      // why: a trail is as long as the star travels while it lasts, so it reads as fading over time.
      const trail = still.matches ? 0 : starTrailSeconds(m.shown);
      for (const s of sky) {
        const x = Math.floor(s.xShare * c.width);
        const y = Math.floor(s.yShare * c.height);
        const len = starWidthSharePerS(s) * trail * c.width;
        const size = s.depth > 0.85 ? 2 : 1;
        ctx.fillStyle = s.color;
        for (let i = TRAIL_BANDS - 1; i >= 0; i--) {
          const from = Math.floor(x - (len * (i + 1)) / TRAIL_BANDS);
          const to = Math.floor(x - (len * i) / TRAIL_BANDS);
          if (to <= from) continue;
          ctx.globalAlpha = s.depth * 0.8 * Math.exp((-3 * (i + 0.5)) / TRAIL_BANDS);
          ctx.fillRect(from, y, to - from, size);
        }
        ctx.globalAlpha = 0.4 + 0.6 * s.depth;
        ctx.fillRect(x, y, size, size);
      }
      ctx.globalAlpha = 1;
    };

    const starWidthSharePerS = (s: Star) => ((m.shown * ROAD_PX_PER_S_PER_MPH) / REFERENCE_SCENE_PX) * STAR_RATE * s.depth;

    const isTrailOffRightEdge = (star: Star, trailLength: number) => star.xShare - trailLength > 1;

    const moveStars = (dt: number) => {
      if (!space && !landing) return;
      const trail = starTrailSeconds(m.shown);
      for (const s of sky) {
        const v = starWidthSharePerS(s);
        s.xShare += v * dt;
        if (isTrailOffRightEdge(s, v * trail)) Object.assign(s, newStar(-Math.random() * 0.2));
      }
    };

    const place = () => {
      if (skyline.current) skyline.current.style.backgroundPositionX = `${Math.round(skylineX)}px`;
      if (palms.current) palms.current.style.transform = `translate3d(${Math.round(palmX)}px,0,0)`;
      if (dashes.current) dashes.current.style.backgroundPositionX = `${Math.round(dashX)}px`;
      car.current?.classList.toggle("moving", m.shown > BOB_MPH);
      car.current?.classList.toggle("fast", m.shown > BOB_FAST_MPH);
      if (santa.current) {
        const progress = space && m.christmas && !still.matches ? santaFlybyProgress(spaceSeconds) : null;
        santa.current.hidden = progress === null;
        if (progress !== null) santa.current.style.setProperty("--racer-flyby-progress", String(progress));
      }
      drawStars();
    };

    const resized = new ResizeObserver(() => {
      const u = el.clientHeight / 100;
      width = el.clientWidth;
      skylineW = Math.max(1, Math.round(SKYLINE_TILE_U * u));
      dashW = Math.max(1, Math.round(DASH_AND_GAP_U * u));
      el.style.setProperty("--racer-u", `${u}px`);
      el.style.setProperty("--racer-w", `${width}px`);
      el.style.setProperty("--racer-skyline-w", `${skylineW}px`);
      el.style.setProperty("--racer-dash-w", `${dashW}px`);
      // why: stars are drawn at the car sprite's pixel size and scaled up, so they are pixel art too.
      if (stars.current) {
        const px = Math.max(1, (u * CAR_HEIGHT_U) / CAR_SPRITE_HEIGHT_PX);
        stars.current.width = Math.max(1, Math.ceil(width / px));
        stars.current.height = Math.max(1, Math.ceil(el.clientHeight / px));
        starsShown = true;
      }
      place();
    });
    resized.observe(el);

    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const tick = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(MAX_FRAME_STEP_S, (now - last) / 1000) : 0;
      last = now;
      m.shown += (m.target - m.shown) * (1 - Math.exp(-dt / EASE_S));
      if (Math.abs(m.target - m.shown) < 0.05) m.shown = m.target;
      const road = m.shown * ROAD_PX_PER_S_PER_MPH * (width / REFERENCE_SCENE_PX) * dt;
      skylineX = (skylineX + road * SKYLINE_RATE) % skylineW;
      palmX = (palmX + road * PALM_RATE) % Math.max(1, width);
      dashX = (dashX + road) % dashW;
      moveStars(dt);
      updateSpace();
      spaceSeconds = space && m.christmas ? spaceSeconds + dt : 0;
      place();
      const atRest = m.shown === 0 && m.target === 0;
      if (atRest) last = 0;
      else raf = requestAnimationFrame(tick);
    };
    m.kick = () => {
      if (still.matches) {
        m.shown = m.target;
        updateSpace();
        place();
        return;
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const motionChanged = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      m.kick();
    };
    still.addEventListener("change", motionChanged);
    m.kick();

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(readyRaf);
      clearTimeout(landing);
      resized.disconnect();
      still.removeEventListener("change", motionChanged);
      m.kick = () => {};
    };
  }, []);

  useEffect(() => {
    motion.current.target = target;
    motion.current.kick();
  }, [target]);

  useEffect(() => {
    if (!ejected?.riders.length) return;
    const n = ejected.riders.length;
    const gap = Math.min(EJECT_GAP_MS, EJECT_SPREAD_MS / n);
    setEjection({
      key: ejected.key,
      mode: root.current?.dataset.space === "on" ? "space" : "road",
      riders: ejected.riders.map(({ avatar, name }, i) => ({
        avatar,
        name,
        delay: Math.round(i * gap),
        spin: Math.random() < 0.5 ? -1 : 1,
        lift: 0.7 + 0.6 * Math.random(),
      })),
    });
  }, [ejected?.key]);

  useEffect(() => {
    if (!ejection) return;
    const last = Math.max(...ejection.riders.map((r) => r.delay));
    const t = setTimeout(() => setEjection(null), last + (ejection.mode === "space" ? EJECT_SPACE_MS : EJECT_ROAD_MS) + 100);
    return () => clearTimeout(t);
  }, [ejection]);

  const palmRow = PALM_LEFTS_PCT.map((left) => (
    <img key={left} class="racer-scene-palm" src={christmas ? christmasTree : palmImg} alt="" style={{ left: `${left}%` }} />
  ));
  return (
    <div ref={root} class={`racer-scene ${crashed ? "crashed" : ""} ${cls ?? ""}`} data-theme={modeTheme("racer", theme)} aria-hidden="true">
      <canvas ref={stars} class="racer-scene-stars" />
      <div class="racer-scene-world">
        <div class="racer-scene-sky" />
        <div class="racer-scene-sun" />
        {christmas && <div class="racer-scene-snow" />}
        <div ref={skyline} class="racer-scene-skyline" style={{ backgroundImage: `url(${christmas ? christmasSkyline : skylineImg})` }} />
        {/* why: two copies side by side, so one has slid in when the other slides out on the right. */}
        <div ref={palms} class="racer-scene-palms">
          <div class="racer-scene-palm-row">{palmRow}</div>
          <div class="racer-scene-palm-row">{palmRow}</div>
        </div>
        <div class="racer-scene-road">
          <div ref={dashes} class="racer-scene-dashes" />
        </div>
      </div>
      {christmas && (
        <div ref={santa} class="racer-scene-santa" hidden>
          <img src={santaFlyby} alt="" />
        </div>
      )}
      <div ref={car} class="racer-scene-car">
        <img src={christmas ? (crashed ? christmasCrash : christmasCar) : crashed ? carCrashedImg : carImg} alt="" />
        {crashed && (
          <div class="racer-scene-smoke">
            <i />
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      {ejection && (
        <div key={ejection.key} class="racer-scene-ejects" data-mode={ejection.mode}>
          {ejection.riders.map((r, i) => (
            <div key={i} class="racer-scene-eject" style={{ animationDelay: `${r.delay}ms`, "--racer-spin": r.spin, "--racer-lift": r.lift }}>
              <div style={{ animationDelay: `${r.delay}ms` }}>
                <div style={{ animationDelay: `${r.delay}ms` }}>
                  <Avatar choice={r.avatar} />
                </div>
                {/* why: outside the tumbling layer, so the name flies with the avatar but stays upright. */}
                <span class="racer-scene-eject-name">{r.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
