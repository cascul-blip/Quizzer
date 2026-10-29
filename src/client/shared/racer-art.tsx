/**
 * Racer's scene: a side scroller in retro pixel art. The car faces left and stays put; the
 * world (skyline, palms, road markings) scrolls past it to the right, faster the faster it
 * drives. Above SPACE_MPH the car takes off: the world slides down out of view and stars
 * streak past instead, their trails lasting longer the faster it goes. Players who get a
 * question wrong fall out of the back: on the road they bounce away down it, in space they
 * drift off. Shared by the projector and the phones.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { Avatar } from "./avatar-art.tsx";
import carCrashedImg from "./racer/car-crashed.webp";
import carImg from "./racer/car.webp";
import palmImg from "./racer/palm.webp";
import skylineImg from "./racer/skyline.webp";

// Generated art (scripts/racer-art.py). Lengths below are in % of the scene's height, the
// unit theme.css calls --racer-u.
/** skyline.webp is 960x101 and drawn 40 high; one tile is this wide. */
const SKYLINE_TILE = (40 * 960) / 101;
/** One dash of the centre line plus the gap after it. */
const DASH_TILE = 30;
/** Road pixels per second per mph, in a scene 1000 px wide. */
const ROAD_RATE = 9;
/** How fast each layer moves compared with the road. */
const SKYLINE_RATE = 0.04;
const PALM_RATE = 0.55;
/** Seconds for the shown speed to close most of the gap to the real one. */
const EASE_S = 1.5;
/** Where the palms stand, in % of the scene's width; the pattern repeats every scene width. */
const PALMS = [7, 35, 78];
/** Above this many mph the car bobs, and above the second it bobs quicker. */
const BOB_MPH = 2;
const BOB_FAST_MPH = 60;
/** Above this many mph the car is in space. */
export const SPACE_MPH = 200;
/** How long the world takes to slide out of view, or back. */
const SLIDE_MS = 1600;
const STAR_COUNT = 70;
/** How fast the nearest stars move compared with the road. */
const STAR_RATE = 0.25;
/** Each star's trail is drawn as this many bands, each fainter than the one before. */
const TRAIL_BANDS = 6;
/** Trail lifetime, in seconds, at SPACE_MPH and at TRAIL_FULL_MPH (and above). */
const TRAIL_MIN_S = 0.15;
const TRAIL_MAX_S = 0.8;
const TRAIL_FULL_MPH = 400;
/** How long one thrown-out avatar takes to leave, on the road and in space (keep in step with theme.css). */
const EJECT_ROAD_MS = 2200;
const EJECT_SPACE_MS = 2600;
/** Avatars leave one after another, this far apart, but all of them within EJECT_SPREAD_MS. */
const EJECT_GAP_MS = 140;
const EJECT_SPREAD_MS = 1400;
const STAR_COLORS = ["#ffffff", "#ffffff", "#cfe3ff", "#9fc4ff", "#ffc23d", "#ff8a1f"];

/** How long a star's trail lasts at this speed: longer the faster the car goes. */
export function starTrailSeconds(mph: number): number {
  const k = Math.max(0, Math.min(1, (mph - SPACE_MPH) / (TRAIL_FULL_MPH - SPACE_MPH)));
  return TRAIL_MIN_S + (TRAIL_MAX_S - TRAIL_MIN_S) * k;
}

interface Star {
  /** Position as a share of the scene's width and height. */
  x: number;
  y: number;
  /** 0.3 (far: slow and dim) to 1 (near). */
  depth: number;
  color: string;
}

function newStar(x: number): Star {
  const depth = 0.3 + 0.7 * Math.random();
  return { x, y: Math.random(), depth, color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]! };
}

interface RacerSceneProps {
  /** Miles per hour. The scene eases toward it, so it may jump. */
  speed: number;
  /** Wrecked: the car smokes and the scene coasts to a stop, whatever the speed. */
  crashed: boolean;
  /** Called once the car is back on the road after a trip to space (the world has slid back up). */
  onLand?: () => void;
  /** Avatars thrown out of the back of the car; each new `key` plays it once. */
  ejected?: { key: string | number; avatars: AvatarChoice[] };
  class?: string;
}

interface Ejection {
  key: string | number;
  /** Frozen when it starts, so a car that drops back to the road mid-flight doesn't change the animation. */
  mode: "road" | "space";
  riders: { avatar: AvatarChoice; delay: number; spin: number; lift: number }[];
}

/** Fills its container; everything is sized from the container's height. */
export function RacerScene({ speed, crashed, onLand, ejected, class: cls }: RacerSceneProps) {
  const target = crashed ? 0 : Math.max(0, speed);
  const root = useRef<HTMLDivElement>(null);
  const skyline = useRef<HTMLDivElement>(null);
  const palms = useRef<HTMLDivElement>(null);
  const dashes = useRef<HTMLDivElement>(null);
  const car = useRef<HTMLDivElement>(null);
  const stars = useRef<HTMLCanvasElement>(null);
  // The shown speed starts at the real one: a scene that appears mid-race is already moving.
  const motion = useRef({ target, shown: target, kick: () => {}, onLand });
  motion.current.onLand = onLand;
  const [ejection, setEjection] = useState<Ejection | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const m = motion.current;
    // Scene width, and the width of one skyline tile and one dash tile, in whole pixels.
    let width = 0;
    let skylineW = 1;
    let dashW = 1;
    // How far each layer has scrolled, in pixels, wrapped to its own tile.
    let skylineX = 0;
    let palmX = 0;
    let dashX = 0;
    let raf = 0;
    let last = 0;
    // Space: on while the car is up there, landing while the world slides back. The state lives
    // in data attributes, which re-renders leave alone. A scene that appears in space starts there.
    let space = m.shown > SPACE_MPH;
    let landing = 0;
    let starsShown = false;
    el.dataset.space = space ? "on" : "off";
    el.style.setProperty("--racer-slide", `${SLIDE_MS}ms`);
    // Slide only from the second frame on, so the first one doesn't animate.
    let readyRaf = requestAnimationFrame(() => {
      readyRaf = requestAnimationFrame(() => (el.dataset.ready = ""));
    });
    const sky: Star[] = Array.from({ length: STAR_COUNT }, () => newStar(Math.random()));
    const ctx = stars.current?.getContext("2d") ?? null;

    const updateSpace = () => {
      const up = m.shown > SPACE_MPH;
      if (up === space) return;
      space = up;
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
      // Trails are as long as a star travels while its trail lasts, so a constant speed shows
      // what fading over time looks like; with reduced motion the stars are plain dots.
      const trail = still.matches ? 0 : starTrailSeconds(m.shown);
      for (const s of sky) {
        const x = Math.floor(s.x * c.width);
        const y = Math.floor(s.y * c.height);
        const len = starSpeed(s) * trail * c.width;
        const size = s.depth > 0.85 ? 2 : 1;
        ctx.fillStyle = s.color;
        for (let i = TRAIL_BANDS - 1; i >= 0; i--) {
          const from = Math.floor(x - (len * (i + 1)) / TRAIL_BANDS);
          const to = Math.floor(x - (len * i) / TRAIL_BANDS);
          if (to <= from) continue;
          // Band i shows where the star was i/TRAIL_BANDS of the trail's life ago.
          ctx.globalAlpha = s.depth * 0.8 * Math.exp((-3 * (i + 0.5)) / TRAIL_BANDS);
          ctx.fillRect(from, y, to - from, size);
        }
        ctx.globalAlpha = 0.4 + 0.6 * s.depth;
        ctx.fillRect(x, y, size, size);
      }
      ctx.globalAlpha = 1;
    };

    /** Share of the scene's width a star crosses per second. */
    const starSpeed = (s: Star) => ((m.shown * ROAD_RATE) / 1000) * STAR_RATE * s.depth;

    const moveStars = (dt: number) => {
      if (!space && !landing) return;
      const trail = starTrailSeconds(m.shown);
      for (const s of sky) {
        const v = starSpeed(s);
        s.x += v * dt;
        // Gone once its whole trail is off the right edge: back in on the left at a new height.
        if (s.x - v * trail > 1) Object.assign(s, newStar(-Math.random() * 0.2));
      }
    };

    const place = () => {
      if (skyline.current) skyline.current.style.backgroundPositionX = `${Math.round(skylineX)}px`;
      if (palms.current) palms.current.style.transform = `translate3d(${Math.round(palmX)}px,0,0)`;
      if (dashes.current) dashes.current.style.backgroundPositionX = `${Math.round(dashX)}px`;
      car.current?.classList.toggle("moving", m.shown > BOB_MPH);
      car.current?.classList.toggle("fast", m.shown > BOB_FAST_MPH);
      drawStars();
    };

    const resized = new ResizeObserver(() => {
      const u = el.clientHeight / 100;
      width = el.clientWidth;
      skylineW = Math.max(1, Math.round(SKYLINE_TILE * u));
      dashW = Math.max(1, Math.round(DASH_TILE * u));
      el.style.setProperty("--racer-u", `${u}px`);
      el.style.setProperty("--racer-w", `${width}px`);
      el.style.setProperty("--racer-skyline-w", `${skylineW}px`);
      el.style.setProperty("--racer-dash-w", `${dashW}px`);
      // The stars are drawn at the car sprite's pixel size and scaled up, so they are pixel art too.
      if (stars.current) {
        const px = Math.max(1, (u * 85) / 160);
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
      // A long gap means the tab was hidden: don't leap ahead.
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      m.shown += (m.target - m.shown) * (1 - Math.exp(-dt / EASE_S));
      if (Math.abs(m.target - m.shown) < 0.05) m.shown = m.target;
      const road = m.shown * ROAD_RATE * (width / 1000) * dt;
      skylineX = (skylineX + road * SKYLINE_RATE) % skylineW;
      palmX = (palmX + road * PALM_RATE) % Math.max(1, width);
      dashX = (dashX + road) % dashW;
      moveStars(dt);
      updateSpace();
      place();
      // At rest there is nothing to draw until the speed changes.
      if (m.shown === 0 && m.target === 0) last = 0;
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

  // Throw out a new batch of avatars; whoever is still in the air from the last one is cleared.
  useEffect(() => {
    if (!ejected?.avatars.length) return;
    const n = ejected.avatars.length;
    const gap = Math.min(EJECT_GAP_MS, EJECT_SPREAD_MS / n);
    setEjection({
      key: ejected.key,
      mode: root.current?.dataset.space === "on" ? "space" : "road",
      riders: ejected.avatars.map((avatar, i) => ({
        avatar,
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

  const palmRow = PALMS.map((left) => <img key={left} class="racer-scene-palm" src={palmImg} alt="" style={{ left: `${left}%` }} />);
  return (
    <div ref={root} class={`racer-scene ${crashed ? "crashed" : ""} ${cls ?? ""}`} aria-hidden="true">
      <canvas ref={stars} class="racer-scene-stars" />
      {/* Everything but the car: it slides down out of view while the car is in space. */}
      <div class="racer-scene-world">
        <div class="racer-scene-sky" />
        <div class="racer-scene-sun" />
        <div ref={skyline} class="racer-scene-skyline" style={{ backgroundImage: `url(${skylineImg})` }} />
        {/* Two copies side by side, one scene wide each: as one slides out on the right, the other has slid in. */}
        <div ref={palms} class="racer-scene-palms">
          <div class="racer-scene-palm-row">{palmRow}</div>
          <div class="racer-scene-palm-row">{palmRow}</div>
        </div>
        <div class="racer-scene-road">
          <div ref={dashes} class="racer-scene-dashes" />
        </div>
      </div>
      <div ref={car} class="racer-scene-car">
        <img src={crashed ? carCrashedImg : carImg} alt="" />
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
        // Keyed so a new batch restarts the animations.
        <div key={ejection.key} class="racer-scene-ejects" data-mode={ejection.mode}>
          {ejection.riders.map((r, i) => (
            <div key={i} class="racer-scene-eject" style={{ animationDelay: `${r.delay}ms`, "--racer-spin": r.spin, "--racer-lift": r.lift }}>
              <div style={{ animationDelay: `${r.delay}ms` }}>
                <div style={{ animationDelay: `${r.delay}ms` }}>
                  <Avatar choice={r.avatar} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
