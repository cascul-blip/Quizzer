import { useEffect, useRef } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { Avatar } from "./avatar-art.tsx";
import boatImg from "./sea/boat.webp";
import caveImg from "./sea/cave.webp";
import bodyImg from "./sea/fish-body.webp";
import jawImg from "./sea/fish-jaw.webp";
import floor1 from "./sea/floor-1.webp";
import floor2 from "./sea/floor-2.webp";
import floor3 from "./sea/floor-3.webp";
import floor4 from "./sea/floor-4.webp";
import floor5 from "./sea/floor-5.webp";
import hulkImg from "./sea/hulk.webp";
import kelpImg from "./sea/kelp.webp";
import linerImg from "./sea/liner.webp";
import pirateImg from "./sea/pirate.webp";
import ringImg from "./sea/ring.webp";
import hullImg from "./sea/sub-hull.webp";
import propImg from "./sea/sub-prop.webp";

interface Look {
  top: [number, number, number];
  bottom: [number, number, number];
  sunrayOpacity: number;
  ambientBrightness: number;
  headlightOpacity: number;
  fishBrightness: number;
  eyeGlowOpacity: number;
  teethGlintOpacity: number;
}

const LOOKS: Look[] = [
  {
    top: [126, 200, 227],
    bottom: [47, 126, 181],
    sunrayOpacity: 0.5,
    ambientBrightness: 1,
    headlightOpacity: 0.16,
    fishBrightness: 1,
    eyeGlowOpacity: 0,
    teethGlintOpacity: 0,
  },
  {
    top: [30, 111, 168],
    bottom: [12, 61, 102],
    sunrayOpacity: 0.2,
    ambientBrightness: 0.68,
    headlightOpacity: 0.55,
    fishBrightness: 0.76,
    eyeGlowOpacity: 0.28,
    teethGlintOpacity: 0.16,
  },
  {
    top: [12, 44, 92],
    bottom: [6, 24, 51],
    sunrayOpacity: 0.03,
    ambientBrightness: 0.34,
    headlightOpacity: 0.82,
    fishBrightness: 0.48,
    eyeGlowOpacity: 0.5,
    teethGlintOpacity: 0.42,
  },
  {
    top: [3, 8, 16],
    bottom: [0, 0, 0],
    sunrayOpacity: 0,
    ambientBrightness: 0,
    headlightOpacity: 1,
    fishBrightness: 0.18,
    eyeGlowOpacity: 0.62,
    teethGlintOpacity: 0.88,
  },
  {
    top: [0, 0, 0],
    bottom: [0, 0, 0],
    sunrayOpacity: 0,
    ambientBrightness: 0,
    headlightOpacity: 1,
    fishBrightness: 0.08,
    eyeGlowOpacity: 0.48,
    teethGlintOpacity: 1,
  },
];

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i]! - v) * t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface SeaLook {
  background: string;
  rays: number;
  ambient: number;
  beam: number;
  fish: number;
  eye: number;
  glint: number;
}

export function seaLook(level: number, nextLevelBlend = 0): SeaLook {
  const i = Math.max(0, Math.min(LOOKS.length - 1, Math.floor(level) - 1));
  const j = Math.min(LOOKS.length - 1, i + 1);
  const t = i === j ? 0 : Math.max(0, Math.min(1, nextLevelBlend));
  const a = LOOKS[i]!;
  const b = LOOKS[j]!;
  const top = mix(a.top, b.top, t);
  const bottom = mix(a.bottom, b.bottom, t);
  return {
    background: `linear-gradient(rgb(${top.join(",")}), rgb(${bottom.join(",")}))`,
    rays: lerp(a.sunrayOpacity, b.sunrayOpacity, t),
    ambient: lerp(a.ambientBrightness, b.ambientBrightness, t),
    beam: lerp(a.headlightOpacity, b.headlightOpacity, t),
    fish: lerp(a.fishBrightness, b.fishBrightness, t),
    eye: lerp(a.eyeGlowOpacity, b.eyeGlowOpacity, t),
    glint: lerp(a.teethGlintOpacity, b.teethGlintOpacity, t),
  };
}

/** why: keyed off the level, so a big class's dive taps can't skip ahead to black. */
export function oceanGradient(level: number, blend = 0): string {
  return seaLook(level, blend).background;
}

/** why: use the landmarks from scripts/sea-art.py so the jaw and lure line up with the painted fish. */
const JAW_HINGE_PCT = { x: 64, y: 75.1 };
const ANGLER_LURE_PCT = { x: 89, y: 20.9 };
const ANGLER_EYE_PCT = { x: 69.9, y: 34.7 };

export function Anglerfish({ openness, fish = 1, eye = 0, glint = 0 }: { openness: number; fish?: number; eye?: number; glint?: number }) {
  // why: the painted mouth is already a little open; closing past it leaves a dark gap.
  const MAX_JAW_OPEN_DEG = 32;
  const angle = Math.max(0, Math.min(1, openness)) * MAX_JAW_OPEN_DEG;
  const origin = `${JAW_HINGE_PCT.x}% ${JAW_HINGE_PCT.y}%`;
  return (
    <div class="anglerfish">
      <img class="fish-body" src={bodyImg} alt="" style={{ filter: `brightness(${fish})` }} />
      <img class="fish-jaw" src={jawImg} alt="" style={{ filter: `brightness(${fish})`, transform: `rotate(${angle}deg)`, transformOrigin: origin }} />
      <img class="fish-glint" src={bodyImg} alt="" style={{ opacity: glint }} />
      <img class="fish-glint fish-jaw" src={jawImg} alt="" style={{ opacity: glint, transform: `rotate(${angle}deg)`, transformOrigin: origin }} />
      <div class="fish-eye" style={{ left: `${ANGLER_EYE_PCT.x}%`, top: `${ANGLER_EYE_PCT.y}%`, opacity: eye }} />
      <div class="lure-glow" style={{ left: `${ANGLER_LURE_PCT.x}%`, top: `${ANGLER_LURE_PCT.y}%` }} />
    </div>
  );
}

export interface PortholeFace {
  /** why: change the key to replay the peek for the same face. */
  key: string;
  choice: AvatarChoice;
}

const PORTHOLE_CENTRES_PCT = [
  { x: 33.6, y: 69.7 },
  { x: 46.2, y: 70.2 },
  { x: 59.4, y: 70.8 },
];

export function Submarine({ faces = [] }: { faces?: (PortholeFace | null)[] }) {
  return (
    <div class="submarine">
      <div class="head-beam" />
      <span class="lamp-glow" style={{ left: "84.4%", top: "71.6%" }} />
      <span class="lamp-glow lamp-glow-front" style={{ left: "97.5%", top: "69.8%" }} />
      <img class="sub-prop" src={propImg} alt="" />
      <img class="sub-hull" src={hullImg} alt="" />
      {PORTHOLE_CENTRES_PCT.map((p, i) => {
        const face = faces[i];
        return (
          <div key={i} class="port" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            {face && (
              <div class="peek" key={face.key}>
                <Avatar choice={face.choice} />
              </div>
            )}
            <span class="glass" />
          </div>
        );
      })}
    </div>
  );
}

interface Sprite {
  src: string;
  loopXPct: number;
  heightVh: number;
  flip?: boolean;
}

interface Band {
  floor: string;
  floorHeightVh: number;
  floorRepeatsPerLoop?: number;
  props: Sprite[];
  far: Sprite[];
}

/** why: wide enough that a landmark isn't on screen twice. */
const LOOP_WIDTH = "240vw";

const BANDS: Band[] = [
  {
    floor: floor1,
    floorHeightVh: 17,
    floorRepeatsPerLoop: 9,
    props: [
      { src: kelpImg, loopXPct: 6, heightVh: 18 },
      { src: kelpImg, loopXPct: 14, heightVh: 14, flip: true },
      { src: ringImg, loopXPct: 22, heightVh: 8 },
      { src: kelpImg, loopXPct: 32, heightVh: 20 },
      { src: kelpImg, loopXPct: 44, heightVh: 13, flip: true },
      { src: kelpImg, loopXPct: 56, heightVh: 17 },
      { src: ringImg, loopXPct: 68, heightVh: 7 },
      { src: kelpImg, loopXPct: 80, heightVh: 15, flip: true },
      { src: kelpImg, loopXPct: 92, heightVh: 19 },
    ],
    far: [],
  },
  {
    floor: floor2,
    floorHeightVh: 16,
    props: [
      { src: kelpImg, loopXPct: 8, heightVh: 13 },
      { src: boatImg, loopXPct: 24, heightVh: 15 },
      { src: kelpImg, loopXPct: 40, heightVh: 11, flip: true },
      { src: kelpImg, loopXPct: 62, heightVh: 14 },
      { src: boatImg, loopXPct: 84, heightVh: 13 },
    ],
    far: [{ src: hulkImg, loopXPct: 52, heightVh: 12 }],
  },
  {
    floor: floor3,
    floorHeightVh: 15,
    props: [
      { src: boatImg, loopXPct: 10, heightVh: 11 },
      { src: pirateImg, loopXPct: 36, heightVh: 32 },
      { src: kelpImg, loopXPct: 68, heightVh: 12 },
    ],
    far: [{ src: hulkImg, loopXPct: 78, heightVh: 13 }],
  },
  {
    floor: floor4,
    floorHeightVh: 20,
    props: [],
    far: [
      { src: caveImg, loopXPct: 16, heightVh: 32 },
      { src: hulkImg, loopXPct: 34, heightVh: 16 },
      { src: caveImg, loopXPct: 62, heightVh: 36 },
      { src: hulkImg, loopXPct: 88, heightVh: 18 },
    ],
  },
  {
    floor: floor5,
    floorHeightVh: 22,
    props: [
      { src: linerImg, loopXPct: 32, heightVh: 26 },
      { src: hulkImg, loopXPct: 58, heightVh: 14 },
      { src: linerImg, loopXPct: 84, heightVh: 30 },
    ],
    far: [
      { src: caveImg, loopXPct: 20, heightVh: 30 },
      { src: hulkImg, loopXPct: 46, heightVh: 12 },
      { src: caveImg, loopXPct: 74, heightVh: 34 },
    ],
  },
];

function Tiles({ band, sprites, showFloor }: { band: Band; sprites: Sprite[]; showFloor: boolean }) {
  return (
    <>
      {[0, 1].map((copy) => (
        <div key={copy} class="floor-tile" style={{ width: LOOP_WIDTH, height: `${band.floorHeightVh}vh` }}>
          {showFloor && (
            <div
              class="floor-fill"
              style={{
                backgroundImage: `url("${band.floor}")`,
                backgroundSize: band.floorRepeatsPerLoop ? `calc(100% / ${band.floorRepeatsPerLoop}) 100%` : undefined,
              }}
            />
          )}
          {sprites.map((s, n) => (
            <img
              key={n}
              class={`sea-prop${s.flip ? " flip" : ""}`}
              src={s.src}
              alt=""
              draggable={false}
              style={{ left: `${s.loopXPct}%`, height: `${s.heightVh}vh` }}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function BandView({ band, fade }: { band: Band; fade: number }) {
  return (
    <div class="sea-band" style={{ opacity: fade, "--h": `${band.floorHeightVh}vh` }}>
      <div class="far-track" data-rate="0.36">
        <Tiles band={band} sprites={band.far} showFloor={false} />
      </div>
      <div class="floor-track" data-rate="1">
        <Tiles band={band} sprites={band.props} showFloor={true} />
      </div>
    </div>
  );
}

/** why: the mutable pace lets the scenery follow the chase without rendering a new scene each frame. */
export function SeaBackdrop({ level, blend, paceRef }: { level: number; blend: number; paceRef: { current: number } }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rootEl = root.current;
    if (!rootEl) return;
    let x = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      x += paceRef.current * dt * (rootEl.clientWidth || 1000) * 0.14;
      for (const track of rootEl.querySelectorAll<HTMLElement>("[data-rate]")) {
        const tile = track.querySelector<HTMLElement>(".floor-tile");
        const w = tile?.offsetWidth ?? 0;
        if (w > 0) track.style.transform = `translate3d(${-((x * (Number(track.dataset.rate) || 1)) % w)}px,0,0)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paceRef]);

  const i = Math.max(0, Math.min(BANDS.length - 1, Math.floor(level) - 1));
  const next = blend > 0.01 && i < BANDS.length - 1 ? i + 1 : -1;
  return (
    <div class="sea-world" ref={root} aria-hidden="true">
      <div class="sea-copy ambient">
        <BandView band={BANDS[i]!} fade={1} />
        {next >= 0 && <BandView band={BANDS[next]!} fade={blend} />}
      </div>
      <div class="sea-copy lit">
        <BandView band={BANDS[i]!} fade={1} />
        {next >= 0 && <BandView band={BANDS[next]!} fade={blend} />}
      </div>
    </div>
  );
}
