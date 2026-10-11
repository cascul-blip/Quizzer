/**
 * Racer's scene: a side scroller in retro pixel art. The car faces left and stays put; the
 * world (skyline, palms, road markings) scrolls past it to the right, faster the faster it
 * drives. Shared by the projector and the phones.
 */
import { useEffect, useRef } from "preact/hooks";
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

export interface RacerSceneProps {
  /** Miles per hour. The scene eases toward it, so it may jump. */
  speed: number;
  /** Wrecked: the car smokes and the scene coasts to a stop, whatever the speed. */
  crashed: boolean;
  class?: string;
}

/** Fills its container; everything is sized from the container's height. */
export function RacerScene({ speed, crashed, class: cls }: RacerSceneProps) {
  const target = crashed ? 0 : Math.max(0, speed);
  const root = useRef<HTMLDivElement>(null);
  const skyline = useRef<HTMLDivElement>(null);
  const palms = useRef<HTMLDivElement>(null);
  const dashes = useRef<HTMLDivElement>(null);
  const car = useRef<HTMLDivElement>(null);
  // The shown speed starts at the real one: a scene that appears mid-race is already moving.
  const motion = useRef({ target, shown: target, kick: () => {} });

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

    const place = () => {
      if (skyline.current) skyline.current.style.backgroundPositionX = `${Math.round(skylineX)}px`;
      if (palms.current) palms.current.style.transform = `translate3d(${Math.round(palmX)}px,0,0)`;
      if (dashes.current) dashes.current.style.backgroundPositionX = `${Math.round(dashX)}px`;
      car.current?.classList.toggle("moving", m.shown > BOB_MPH);
      car.current?.classList.toggle("fast", m.shown > BOB_FAST_MPH);
    };

    const resized = new ResizeObserver(() => {
      const u = el.clientHeight / 100;
      width = el.clientWidth;
      skylineW = Math.max(1, Math.round(SKYLINE_TILE * u));
      dashW = Math.max(1, Math.round(DASH_TILE * u));
      el.style.setProperty("--racer-u", `${u}px`);
      el.style.setProperty("--racer-skyline-w", `${skylineW}px`);
      el.style.setProperty("--racer-dash-w", `${dashW}px`);
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
      place();
      // At rest there is nothing to draw until the speed changes.
      if (m.shown === 0 && m.target === 0) last = 0;
      else raf = requestAnimationFrame(tick);
    };
    m.kick = () => {
      if (still.matches) {
        m.shown = m.target;
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
      resized.disconnect();
      still.removeEventListener("change", motionChanged);
      m.kick = () => {};
    };
  }, []);

  useEffect(() => {
    motion.current.target = target;
    motion.current.kick();
  }, [target]);

  const palmRow = PALMS.map((left) => <img key={left} class="racer-scene-palm" src={palmImg} alt="" style={{ left: `${left}%` }} />);
  return (
    <div ref={root} class={`racer-scene ${crashed ? "crashed" : ""} ${cls ?? ""}`} aria-hidden="true">
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
    </div>
  );
}
