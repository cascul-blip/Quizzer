/**
 * Skyscraper art for Tallest Tower, drawn in SVG so it stays crisp on a
 * projector, weighs a few KB and works offline. Shared by host and phones.
 */
import { useEffect, useRef, useState } from "preact/hooks";

// ---------- color + randomness helpers ----------

/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb color; amount is -1…1. */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const mix = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const clamp = (c: number) => Math.max(0, Math.min(255, c));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => clamp(mix(c)));
  return `#${((1 << 24) | (r! << 16) | (g! << 8) | b!).toString(16).slice(1)}`;
}

/** Deterministic 0…1 hash so windows keep their lights across re-renders. */
export function hash01(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= p + 0x9e3779b9;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Whether window i (0–3) of a block is lit: about 60% are. */
export const isLit = (team: number, col: number, row: number, i: number) => hash01(team, col, row, i) < 0.6;

// ---------- sky ----------

export const SKY_STAGES = [
  { name: "day", top: "#4aa3ff", bottom: "#c4e8ff" },
  { name: "afternoon", top: "#3a7fd6", bottom: "#ffe1a6" },
  { name: "sunset", top: "#5b3a9a", bottom: "#ff9656" },
  { name: "dusk", top: "#24185a", bottom: "#a8457f" },
  { name: "night", top: "#060920", bottom: "#231c55" },
] as const;

/** Sky changes every 5 floors of the tallest tower: day → afternoon → sunset → dusk → night. */
export function skyStage(floors: number): number {
  return Math.max(0, Math.min(SKY_STAGES.length - 1, Math.floor(floors / 5)));
}

/**
 * First row shown in a phone's build view: follow the top of the tower, but
 * while an egg is out keep the egg (with a row beneath it) in view.
 */
export function viewBaseRow(tallest: number, visibleRows: number, eggRow: number | null): number {
  const topBase = tallest + 1 - visibleRows;
  if (eggRow === null) return Math.max(0, topBase);
  return Math.max(0, Math.min(Math.max(topBase, eggRow + 2 - visibleRows), eggRow - 1));
}

/** Meters shown on the height scale. */
export const METERS_PER_FLOOR = 4;

// ---------- "only animate blocks that appear after the first render" ----------

/**
 * Returns isFresh(key): true for keys first seen after the initial render.
 * Blocks already standing when a screen loads or reconnects don't replay
 * their landing animation; the flag sticks so an animation isn't cut short.
 */
export function useFreshKeys(): (key: string) => boolean {
  const seen = useRef(new Map<string, boolean>());
  const ready = useRef(false);
  useEffect(() => {
    ready.current = true;
  }, []);
  return (key) => {
    let fresh = seen.current.get(key);
    if (fresh === undefined) {
      fresh = ready.current;
      seen.current.set(key, fresh);
    }
    return fresh;
  };
}

/**
 * Show `item` for `ms` whenever `seq` changes to a new value after the first
 * render. Events already in the state when a screen loads are not replayed.
 */
export function useEventFlash<T>(item: T | null, seq: number | null | undefined, ms: number): T | null {
  const seen = useRef<number | null | undefined>(undefined);
  const [shown, setShown] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (seen.current === undefined) {
      seen.current = seq ?? null;
      return;
    }
    if (seq == null || seq === seen.current) return;
    seen.current = seq;
    setShown(item);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), ms);
  }, [seq]);
  return shown;
}

/** Floor number that was just completed (for a one-off sparkle), or null. */
export function useNewFloor(floors: number): number | null {
  const prev = useRef(floors);
  const last = useRef<number | null>(null);
  if (floors > prev.current) last.current = floors;
  prev.current = floors;
  return last.current;
}

// ---------- building pieces ----------

export interface BlockProps {
  x: number;
  y: number;
  size: number;
  color: string;
  team: number;
  col: number;
  row: number;
  /** Part of a completed floor: draws the ledge. */
  fullFloor: boolean;
  /** Animate as a newly landed block. */
  fresh?: boolean;
}

const GLASS_LIT = "#ffe08a";
const GLASS_DARK = "#1d2a52";

/** One cell of the 3-wide tower, drawn as a slice of a skyscraper. */
export function BuildingBlock({ x, y, size: s, color, team, col, row, fullFloor, fresh }: BlockProps) {
  const edge = shade(color, -0.28);
  const light = shade(color, 0.35);
  let face;
  if (row === 0 && col === 1) {
    // Lobby: glass double doors under a sign.
    face = (
      <>
        <rect x={x + s * 0.2} y={y + s * 0.14} width={s * 0.6} height={s * 0.12} rx={s * 0.02} fill={light} />
        <rect x={x + s * 0.26} y={y + s * 0.34} width={s * 0.48} height={s * 0.66} fill="#bfe3ff" />
        <rect x={x + s * 0.49} y={y + s * 0.34} width={s * 0.02} height={s * 0.66} fill={edge} />
        <rect x={x + s * 0.26} y={y + s * 0.34} width={s * 0.48} height={s * 0.04} fill={edge} />
      </>
    );
  } else if (row === 0) {
    // Shop front with a striped awning.
    face = (
      <>
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={x + s * (0.08 + i * 0.21)} y={y + s * 0.26} width={s * 0.21} height={s * 0.14} fill={i % 2 ? "#ffffff" : light} />
        ))}
        <rect x={x + s * 0.14} y={y + s * 0.46} width={s * 0.62} height={s * 0.38} fill={isLit(team, col, row, 0) ? GLASS_LIT : "#bfe3ff"} />
        <rect x={x + s * 0.14} y={y + s * 0.84} width={s * 0.62} height={s * 0.06} fill={edge} />
      </>
    );
  } else {
    // Office floor: a 2×2 grid of windows, some lit.
    face = [0, 1, 2, 3].map((i) => (
      <rect
        key={i}
        x={x + s * (i % 2 ? 0.52 : 0.14)}
        y={y + s * (i < 2 ? 0.2 : 0.56)}
        width={s * 0.26}
        height={s * 0.26}
        rx={s * 0.02}
        fill={isLit(team, col, row, i) ? GLASS_LIT : GLASS_DARK}
      />
    ));
  }
  return (
    <g class={`bb ${fresh ? "land" : ""}`}>
      <rect x={x} y={y} width={s} height={s} fill={color} />
      <rect x={x + s * 0.9} y={y} width={s * 0.1} height={s} fill={edge} />
      {face}
      {fullFloor && (
        <>
          <rect x={x - s * 0.02} y={y} width={s * 1.04} height={s * 0.08} fill="rgba(255,255,255,0.7)" />
          <rect x={x} y={y + s * 0.08} width={s} height={s * 0.03} fill="rgba(0,0,0,0.18)" />
        </>
      )}
    </g>
  );
}

/** A puff of dust at a landing point (x = center, y = bottom). */
export function DustPuff({ x, y, size: s }: { x: number; y: number; size: number }) {
  return (
    <g class="puff" aria-hidden="true">
      <circle cx={x - s * 0.45} cy={y} r={s * 0.16} />
      <circle cx={x} cy={y + s * 0.02} r={s * 0.2} />
      <circle cx={x + s * 0.45} cy={y} r={s * 0.16} />
    </g>
  );
}

/** Sparkles along a newly completed floor. */
export function FloorSparkle({ x, y, width, size: s }: { x: number; y: number; width: number; size: number }) {
  const stars = Array.from({ length: 7 }, (_, i) => {
    const cx = x + (width * (i + 0.5)) / 7;
    const r = s * (0.12 + hash01(i, 7) * 0.1);
    const d = `M${cx},${y - r} L${cx + r * 0.3},${y - r * 0.3} L${cx + r},${y} L${cx + r * 0.3},${y + r * 0.3} L${cx},${y + r} L${cx - r * 0.3},${y + r * 0.3} L${cx - r},${y} L${cx - r * 0.3},${y - r * 0.3} Z`;
    return <path key={i} d={d} style={{ animationDelay: `${i * 40}ms` }} />;
  });
  return (
    <g class="sparkle" aria-hidden="true">
      {stars}
    </g>
  );
}

/** Tower crane standing on a roof at (x = mast center, y = roof top), jib spanning x0…x1. */
export function Crane({ x, y, x0, x1, size: s }: { x: number; y: number; x0: number; x1: number; size: number }) {
  const mastTop = y - s * 1.55;
  const w = s * 0.16;
  const rungs = Array.from({ length: 6 }, (_, i) => {
    const ry = y - (s * 1.5 * (i + 1)) / 6;
    return <line key={i} x1={x - w / 2} y1={ry} x2={x + w / 2} y2={ry + s * 0.22} />;
  });
  return (
    <g class="crane" aria-hidden="true">
      <rect x={x - w / 2} y={mastTop} width={w} height={y - mastTop} class="crane-steel" />
      <g class="crane-lattice">{rungs}</g>
      <g class="crane-jib" style={{ transformOrigin: `${x}px ${mastTop}px` }}>
        <rect x={x0} y={mastTop - s * 0.1} width={x1 - x0} height={s * 0.1} class="crane-steel" />
        <rect x={x0} y={mastTop - s * 0.02} width={s * 0.35} height={s * 0.22} class="crane-weight" />
        <line x1={x} y1={mastTop - s * 0.35} x2={x1} y2={mastTop - s * 0.06} class="crane-cable" />
        <line x1={x} y1={mastTop - s * 0.35} x2={x0} y2={mastTop - s * 0.06} class="crane-cable" />
        <line x1={x1 - s * 0.35} y1={mastTop} x2={x1 - s * 0.35} y2={mastTop + s * 0.7} class="crane-cable" />
        <path d={`M${x1 - s * 0.43},${mastTop + s * 0.7} h${s * 0.16} v${s * 0.08} a${s * 0.08},${s * 0.08} 0 1 1 -${s * 0.16},0 z`} class="crane-steel" />
      </g>
      <rect x={x - s * 0.18} y={mastTop - s * 0.02} width={s * 0.28} height={s * 0.2} rx={s * 0.03} class="crane-cab" />
    </g>
  );
}

/** Flagpole with a team flag, standing on (x, y). */
export function RoofFlag({ x, y, size: s, color }: { x: number; y: number; size: number; color: string }) {
  return (
    <g class="roof-flag" aria-hidden="true">
      <rect x={x - s * 0.03} y={y - s * 1.1} width={s * 0.06} height={s * 1.1} fill="#e6e6ee" />
      <path class="flag-cloth" d={`M${x + s * 0.03},${y - s * 1.08} l${s * 0.6},${s * 0.16} l-${s * 0.6},${s * 0.16} z`} fill={color} stroke="#fff" stroke-width={s * 0.02} />
    </g>
  );
}

/** A small round tree standing on (x, y). */
export function Tree({ x, y, size: s, seed }: { x: number; y: number; size: number; seed: number }) {
  const h = s * (0.8 + hash01(seed) * 0.4);
  return (
    <g class="tree" aria-hidden="true">
      <rect x={x - s * 0.05} y={y - h * 0.45} width={s * 0.1} height={h * 0.45} fill="#6b4a2b" />
      <circle cx={x} cy={y - h * 0.62} r={h * 0.3} fill="#2f8f46" />
      <circle cx={x - h * 0.14} cy={y - h * 0.52} r={h * 0.2} fill="#3aa655" />
    </g>
  );
}

/** Deterministic city skyline silhouette for a viewBox of width 1000 × height 100. */
export function SkylineSvg() {
  const buildings = [];
  let x = 0;
  for (let i = 0; x < 1000; i++) {
    const w = 25 + hash01(i, 1) * 45;
    const h = 25 + hash01(i, 2) * 70;
    buildings.push(<rect key={i} x={x} y={100 - h} width={w - 2} height={h} />);
    if (hash01(i, 3) < 0.35) buildings.push(<rect key={`a${i}`} x={x + w / 2 - 1} y={100 - h - 8} width={2} height={8} />);
    x += w;
  }
  return (
    <svg class="skyline" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
      {buildings}
    </svg>
  );
}

// ---------- monster ----------

export const COLUMN_NAMES = ["left", "center", "right"] as const;

/** The monster egg waiting on a cell (x, y = the cell's top-left, s = cell size). */
export function EggCell({ x, y, size: s }: { x: number; y: number; size: number }) {
  return (
    <g class="egg-cell" aria-hidden="true">
      <rect x={x + s * 0.04} y={y + s * 0.04} width={s * 0.92} height={s * 0.92} rx={s * 0.08} class="egg-slot" />
      <g class="egg" style={{ transformOrigin: `${x + s / 2}px ${y + s * 0.92}px` }}>
        <ellipse cx={x + s / 2} cy={y + s * 0.56} rx={s * 0.3} ry={s * 0.37} class="egg-glow" />
        <ellipse cx={x + s / 2} cy={y + s * 0.56} rx={s * 0.26} ry={s * 0.33} fill="#fff4dc" stroke="#6b3fa0" stroke-width={s * 0.03} />
        <circle cx={x + s * 0.42} cy={y + s * 0.46} r={s * 0.06} fill="#8e5cd6" />
        <circle cx={x + s * 0.58} cy={y + s * 0.62} r={s * 0.07} fill="#8e5cd6" />
        <circle cx={x + s * 0.44} cy={y + s * 0.72} r={s * 0.04} fill="#8e5cd6" />
        <path d={`M${x + s * 0.3},${y + s * 0.52} l${s * 0.08},${-s * 0.06} l${s * 0.07},${s * 0.07} l${s * 0.08},${-s * 0.06}`} fill="none" stroke="#6b3fa0" stroke-width={s * 0.025} />
      </g>
    </g>
  );
}

/** The tyrant monster (viewBox 0 0 200 220), facing left. Parts are classed for animation. */
export function MonsterSvg() {
  return (
    <svg class="monster-svg" viewBox="0 0 200 220" aria-hidden="true">
      {/* tail */}
      <path d="M150,150 Q195,150 196,110 Q185,135 150,128 Z" fill="#6a2fb0" />
      {/* legs */}
      <g class="m-leg-back">
        <rect x="118" y="165" width="26" height="42" rx="10" fill="#5b2799" />
        <path d="M112,204 h40 v10 h-40 z" fill="#4a1f80" />
      </g>
      <g class="m-leg-front">
        <rect x="72" y="165" width="28" height="44" rx="10" fill="#6a2fb0" />
        <path d="M64,206 h42 v10 h-42 z" fill="#4a1f80" />
        <path d="M64,216 l6,-8 l6,8 l6,-8 l6,8" fill="#fff" />
      </g>
      {/* body */}
      <ellipse cx="112" cy="140" rx="52" ry="50" fill="#7b3cc8" />
      <ellipse cx="100" cy="150" rx="30" ry="34" fill="#c6a2f2" />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${86},${128 + i * 13} q14,5 28,0`} stroke="#a47ddc" stroke-width="2.5" fill="none" />
      ))}
      {/* back spikes */}
      <path d="M130,92 l12,-16 l4,20 l12,-12 l2,20 l12,-8 l-2,22 z" fill="#3fd18b" />
      {/* arm (swings on smash) */}
      <g class="m-arm" style={{ transformOrigin: "88px 128px" }}>
        <path d="M88,124 Q58,120 44,136 l10,8 Q66,134 90,140 z" fill="#6a2fb0" />
        <path d="M44,136 l-10,-4 l6,8 l-8,2 l10,4 l-4,6 l12,-4 z" fill="#fff" />
      </g>
      {/* head */}
      <g class="m-head" style={{ transformOrigin: "95px 90px" }}>
        <path d="M60,40 Q70,18 100,20 Q134,22 138,54 Q140,82 118,92 L64,92 Q42,86 40,66 Q40,48 60,40 Z" fill="#7b3cc8" />
        <path d="M64,24 l-12,-18 l22,10 z M104,20 l4,-20 l12,18 z" fill="#f2e6c9" />
        <ellipse cx="78" cy="46" rx="11" ry="9" fill="#fff" />
        <circle cx="75" cy="47" r="5.5" fill="#d7263d" />
        <circle cx="74" cy="46" r="2.2" fill="#1b0b2e" />
        <path d="M64,34 l26,8" stroke="#3a1568" stroke-width="4" stroke-linecap="round" />
        {/* jaw (opens to roar) */}
        <g class="m-jaw" style={{ transformOrigin: "118px 70px" }}>
          <path d="M42,70 Q70,72 118,70 L116,92 Q80,104 50,92 Z" fill="#5b2799" />
          <path d="M50,74 l6,10 l6,-10 l6,10 l6,-10 l6,10 l6,-10 l6,10 l6,-10" fill="#fff" />
          <path d="M60,90 q20,8 40,0" stroke="#d7263d" stroke-width="5" fill="none" stroke-linecap="round" />
        </g>
        <path d="M42,64 l6,-8 l6,8 l6,-8 l6,8 l6,-8 l6,8" fill="#fff" />
      </g>
    </svg>
  );
}
