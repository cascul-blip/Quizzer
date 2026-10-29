/**
 * Submarine Squad art. The submarine, the anglerfish and the seabed are painted
 * pictures (scripts/sea-art.py). Dive symbols stay SVG: players have to match them.
 */
import { useEffect, useRef } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { GLYPH_SIZES, GLYPH_SLOTS, parseGlyph, type GlyphShape } from "../../shared/glyphs.ts";
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

// ---------- how deep it looks ----------

interface Look {
  top: [number, number, number];
  bottom: [number, number, number];
  /** Surface light, fading out as the water goes dark. */
  rays: number;
  /** Brightness of everything the headlights are not touching. */
  ambient: number;
  /** How much of the fully lit scenery shows through the headlight mask. */
  beam: number;
  /** Brightness of the fish's skin. */
  fish: number;
  /** The eye overlay. The painted eye shows on its own while this is near 0. */
  eye: number;
  /** A bright copy of the teeth, so they glint once the skin has gone black. */
  glint: number;
}

/** One entry per level. Level 5 and everything past it stay on the last entry. */
const LOOKS: Look[] = [
  { top: [126, 200, 227], bottom: [47, 126, 181], rays: 0.5, ambient: 1, beam: 0.16, fish: 1, eye: 0, glint: 0 },
  { top: [30, 111, 168], bottom: [12, 61, 102], rays: 0.2, ambient: 0.68, beam: 0.55, fish: 0.76, eye: 0.28, glint: 0.16 },
  { top: [12, 44, 92], bottom: [6, 24, 51], rays: 0.03, ambient: 0.34, beam: 0.82, fish: 0.48, eye: 0.5, glint: 0.42 },
  { top: [3, 8, 16], bottom: [0, 0, 0], rays: 0, ambient: 0, beam: 1, fish: 0.18, eye: 0.62, glint: 0.88 },
  { top: [0, 0, 0], bottom: [0, 0, 0], rays: 0, ambient: 0, beam: 1, fish: 0.08, eye: 0.48, glint: 1 },
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

/** Water, headlights and fish shading for a level. `blend` fades toward the next level during a dive. */
export function seaLook(level: number, blend = 0): SeaLook {
  const i = Math.max(0, Math.min(LOOKS.length - 1, Math.floor(level) - 1));
  const j = Math.min(LOOKS.length - 1, i + 1);
  const t = i === j ? 0 : Math.max(0, Math.min(1, blend));
  const a = LOOKS[i]!;
  const b = LOOKS[j]!;
  const top = mix(a.top, b.top, t);
  const bottom = mix(a.bottom, b.bottom, t);
  return {
    background: `linear-gradient(rgb(${top.join(",")}), rgb(${bottom.join(",")}))`,
    rays: lerp(a.rays, b.rays, t),
    ambient: lerp(a.ambient, b.ambient, t),
    beam: lerp(a.beam, b.beam, t),
    fish: lerp(a.fish, b.fish, t),
    eye: lerp(a.eye, b.eye, t),
    glint: lerp(a.glint, b.glint, t),
  };
}

/** Phone and podium water. Keyed off the level, so a big class's dive taps can't skip ahead to black. */
export function oceanGradient(level: number, blend = 0): string {
  return seaLook(level, blend).background;
}

// ---------- anglerfish ----------

/** Hinge, lure bulb and eye, as percentages of the fish picture (scripts/sea-art.py prints these). */
const HINGE = { x: 64, y: 75.1 };
const LURE = { x: 89, y: 20.9 };
const EYE = { x: 69.9, y: 34.7 };

/**
 * Anglerfish facing right. `openness` 0…1 swings the lower jaw from nearly shut
 * to wide open. The lure stays lit at every depth; `fish`/`eye`/`glint` are the
 * depth treatment from `seaLook`.
 */
export function Anglerfish({ openness, fish = 1, eye = 0, glint = 0 }: { openness: number; fish?: number; eye?: number; glint?: number }) {
  // The painted mouth is already a little open, and that composite is seamless.
  // Opening swings the jaw down from there. Closing past the painting leaves a dark gap.
  const angle = Math.max(0, Math.min(1, openness)) * 32;
  const origin = `${HINGE.x}% ${HINGE.y}%`;
  return (
    <div class="anglerfish">
      <img class="fish-body" src={bodyImg} alt="" style={{ filter: `brightness(${fish})` }} />
      <img class="fish-jaw" src={jawImg} alt="" style={{ filter: `brightness(${fish})`, transform: `rotate(${angle}deg)`, transformOrigin: origin }} />
      <img class="fish-glint" src={bodyImg} alt="" style={{ opacity: glint }} />
      <img class="fish-glint fish-jaw" src={jawImg} alt="" style={{ opacity: glint, transform: `rotate(${angle}deg)`, transformOrigin: origin }} />
      <div class="fish-eye" style={{ left: `${EYE.x}%`, top: `${EYE.y}%`, opacity: eye }} />
      <div class="lure-glow" style={{ left: `${LURE.x}%`, top: `${LURE.y}%` }} />
    </div>
  );
}

// ---------- submarine ----------

/** Someone looking out of a porthole; `key` restarts the peek animation. */
export interface PortholeFace {
  key: string;
  choice: AvatarChoice;
}

/** Porthole centres, as percentages of the hull picture. */
const PORTS = [
  { x: 33.6, y: 69.7 },
  { x: 46.2, y: 70.2 },
  { x: 59.4, y: 70.8 },
];

/** Research submarine facing right. `faces[i]` peeks out of porthole i. */
export function Submarine({ faces = [] }: { faces?: (PortholeFace | null)[] }) {
  return (
    <div class="submarine">
      <div class="head-beam" />
      <span class="lamp-glow" style={{ left: "84.4%", top: "71.6%" }} />
      <span class="lamp-glow lamp-glow-front" style={{ left: "97.5%", top: "69.8%" }} />
      <img class="sub-prop" src={propImg} alt="" />
      <img class="sub-hull" src={hullImg} alt="" />
      {PORTS.map((p, i) => {
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

// ---------- the scrolling seabed ----------

interface Sprite {
  src: string;
  /** Position along one loop of the floor, 0–100. */
  x: number;
  /** Height in vh. */
  h: number;
  flip?: boolean;
}

interface Band {
  floor: string;
  /** How tall the strip is drawn, in vh. */
  floorH: number;
  /** How many copies of the floor fill one loop. Keeps the repeat on the loop boundary. */
  repeats?: number;
  props: Sprite[];
  far: Sprite[];
}

/** One loop of the seabed, wide enough that a landmark isn't on screen twice. */
const LOOP = "240vw";

const BANDS: Band[] = [
  {
    floor: floor1,
    floorH: 17,
    repeats: 9,
    props: [
      { src: kelpImg, x: 6, h: 18 },
      { src: kelpImg, x: 14, h: 14, flip: true },
      { src: ringImg, x: 22, h: 8 },
      { src: kelpImg, x: 32, h: 20 },
      { src: kelpImg, x: 44, h: 13, flip: true },
      { src: kelpImg, x: 56, h: 17 },
      { src: ringImg, x: 68, h: 7 },
      { src: kelpImg, x: 80, h: 15, flip: true },
      { src: kelpImg, x: 92, h: 19 },
    ],
    far: [],
  },
  {
    floor: floor2,
    floorH: 16,
    props: [
      { src: kelpImg, x: 8, h: 13 },
      { src: boatImg, x: 24, h: 15 },
      { src: kelpImg, x: 40, h: 11, flip: true },
      { src: kelpImg, x: 62, h: 14 },
      { src: boatImg, x: 84, h: 13 },
    ],
    far: [{ src: hulkImg, x: 52, h: 12 }],
  },
  {
    floor: floor3,
    floorH: 15,
    props: [
      { src: boatImg, x: 10, h: 11 },
      { src: pirateImg, x: 36, h: 32 },
      { src: kelpImg, x: 68, h: 12 },
    ],
    far: [{ src: hulkImg, x: 78, h: 13 }],
  },
  {
    floor: floor4,
    floorH: 20,
    props: [],
    far: [
      { src: caveImg, x: 16, h: 32 },
      { src: hulkImg, x: 34, h: 16 },
      { src: caveImg, x: 62, h: 36 },
      { src: hulkImg, x: 88, h: 18 },
    ],
  },
  {
    floor: floor5,
    floorH: 22,
    props: [
      { src: linerImg, x: 32, h: 26 },
      { src: hulkImg, x: 58, h: 14 },
      { src: linerImg, x: 84, h: 30 },
    ],
    far: [
      { src: caveImg, x: 20, h: 30 },
      { src: hulkImg, x: 46, h: 12 },
      { src: caveImg, x: 74, h: 34 },
    ],
  },
];

function Tiles({ band, sprites, showFloor }: { band: Band; sprites: Sprite[]; showFloor: boolean }) {
  return (
    <>
      {[0, 1].map((copy) => (
        <div key={copy} class="floor-tile" style={{ width: LOOP, height: `${band.floorH}vh` }}>
          {showFloor && (
            <div
              class="floor-fill"
              style={{
                backgroundImage: `url("${band.floor}")`,
                backgroundSize: band.repeats ? `calc(100% / ${band.repeats}) 100%` : undefined,
              }}
            />
          )}
          {sprites.map((s, n) => (
            <img key={n} class={`sea-prop${s.flip ? " flip" : ""}`} src={s.src} alt="" draggable={false} style={{ left: `${s.x}%`, height: `${s.h}vh` }} />
          ))}
        </div>
      ))}
    </>
  );
}

function BandView({ band, fade }: { band: Band; fade: number }) {
  return (
    <div class="sea-band" style={{ opacity: fade, "--h": `${band.floorH}vh` }}>
      <div class="far-track" data-rate="0.36">
        <Tiles band={band} sprites={band.far} showFloor={false} />
      </div>
      <div class="floor-track" data-rate="1">
        <Tiles band={band} sprites={band.props} showFloor={true} />
      </div>
    </div>
  );
}

/**
 * The seabed scrolling past the submarine. Two copies stay in step: a dim
 * ambient one, and a fully lit one revealed only inside the headlight mask.
 * `paceRef` is pixels-per-second as a fraction of the scene width (the host
 * writes it every render; the scroll itself does not re-render).
 */
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
        if (w > 0) track.style.transform = `translate3d(${-(x * (Number(track.dataset.rate) || 1) % w)}px,0,0)`;
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

// ---------- dive symbols ----------

/** Every dive symbol is drawn in this one color, so only the shapes matter. */
const GLYPH_INK = "#1f2a44";

/** One abstract primitive, drawn in a local box from -50 to 50. `sw` = outline width in local units. */
function primitive(shape: GlyphShape, sw: number) {
  const fill = { fill: GLYPH_INK };
  const line = { fill: "none", stroke: GLYPH_INK, "stroke-width": sw, "stroke-linejoin": "round" as const, "stroke-linecap": "round" as const };
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(46 * Math.cos(a)).toFixed(1)},${(46 * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  const star = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 20 : 48;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  switch (shape) {
    case "disc":
      return <circle r="46" {...fill} />;
    case "ring":
      return <circle r={46 - sw / 2} {...line} />;
    case "tri":
      return <polygon points="0,-46 46,38 -46,38" {...fill} />;
    case "triO":
      return <polygon points="0,-42 42,36 -42,36" {...line} />;
    case "sq":
      return <rect x="-40" y="-40" width="80" height="80" rx="4" {...fill} />;
    case "sqO":
      return <rect x={-42 + sw / 2} y={-42 + sw / 2} width={84 - sw} height={84 - sw} rx="4" {...line} />;
    case "dia":
      return <polygon points="0,-48 48,0 0,48 -48,0" {...fill} />;
    case "hexO":
      return <polygon points={hex} {...line} />;
    case "plus":
      return <path d="M-13,-46 h26 v33 h33 v26 h-33 v33 h-26 v-33 h-33 v-26 h33 z" {...fill} />;
    case "ex":
      return <path d="M-13,-46 h26 v33 h33 v26 h-33 v33 h-26 v-33 h-33 v-26 h33 z" transform="rotate(45) scale(0.92)" {...fill} />;
    case "bar":
      return <rect x="-46" y="-11" width="92" height="22" rx="4" {...fill} />;
    case "bars":
      return (
        <>
          <rect x="-46" y="-30" width="92" height="20" rx="4" {...fill} />
          <rect x="-46" y="10" width="92" height="20" rx="4" {...fill} />
        </>
      );
    case "arc":
      return <path d="M-40,12 A40,40 0 0 1 40,12" {...line} stroke-width={sw * 1.4} />;
    case "wave":
      return <path d="M-46,0 C-34,-30 -12,-30 0,0 S34,30 46,0" {...line} stroke-width={sw * 1.4} />;
    case "zig":
      return <polyline points="-46,16 -23,-16 0,16 23,-16 46,16" {...line} stroke-width={sw * 1.4} />;
    case "chev":
      return <polyline points="-40,22 0,-22 40,22" {...line} stroke-width={sw * 1.6} />;
    case "cres":
      // Outer circle r46 at the origin minus an inner circle r40 at (18, 0).
      return <path d="M23.3,-39.6 A46,46 0 1 0 23.3,39.6 A40,40 0 1 1 23.3,-39.6 Z" {...fill} />;
    case "star":
      return <polygon points={star} {...fill} />;
    case "dots":
      return (
        <>
          <circle cx="-32" r="13" {...fill} />
          <circle cx="0" r="13" {...fill} />
          <circle cx="32" r="13" {...fill} />
        </>
      );
    case "drop":
      return <path d="M0,-48 C22,-18 38,0 38,16 A38,34 0 0 1 -38,16 C-38,0 -22,-18 0,-48 Z" {...fill} />;
  }
}

/** One abstract dive symbol (e.g. "g:ring.c.l.0|zig.c.n.90") in a single color. */
export function GlyphSymbol({ id }: { id: string }) {
  const glyph = parseGlyph(id);
  if (!glyph) return null;
  return (
    <svg class="sea-symbol" viewBox="0 0 100 100" role="img" aria-label="symbol">
      {glyph.map((p, i) => {
        const [x, y] = GLYPH_SLOTS[p.slot];
        const d = GLYPH_SIZES[p.size];
        const scale = d / 100;
        // Keep line weight about the same on the tile whatever the part's size.
        const sw = (3 + d * 0.07) / scale;
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${p.rot}) scale(${scale})`}>
            {primitive(p.shape, sw)}
          </g>
        );
      })}
    </svg>
  );
}
