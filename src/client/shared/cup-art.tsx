/**
 * Cup of Death: a round wooden table in a western saloon, seen from above at an
 * angle, with every living player seated around it behind their cups. The room
 * and the table are pictures (scripts/cup-saloon.py); everything on them is SVG. Also the
 * dice and the bubbling cups the phones show.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { CUP_DEFAULT_CUPS, CUP_DIE_SIDES, type CupDrinkView } from "../../shared/protocol.ts";
import { ACCESSORY_ART, AVATAR_ART } from "./avatar-art.tsx";
import saloonImg from "./cup/saloon.webp";
import tableImg from "./cup/table.webp";

export const SALOON_W = 1200;
export const SALOON_H = 800;
/** Table centre and radii; the seats sit on a wider ring around it. */
const CX = 600;
const CY = 440;
const TABLE_RX = 330;
const TABLE_RY = 140;
const SEAT_RX = 440;
const SEAT_RY = 228;
/** Where the cups stand, as a share of the way from the table centre to the seat. */
const CUP_RING = 0.62;
/** The backdrop runs this far past the sides of the view box, so wide screens show more saloon instead of black bars. */
const BLEED = 700;
/** The room picture (scripts/cup-saloon.py): its height in the scene and where its top edge goes, which puts the floor's back edge just behind the far seats. */
const ROOM_H = 960;
const ROOM_Y = -150;
const ROOM_W = ROOM_H * (1344 / 768);
/** The table picture: width / height, and its tabletop ellipse as fractions of the picture (printed by scripts/cup-saloon.py). */
const TABLE_ASPECT = 1.5177;
const TOP_FX = 0.4995;
const TOP_FY = 0.2692;
const TOP_FRX = 0.4995;
const TOP_FRY = 0.2692;

export interface SeatPlayer {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  cups: number;
  target: number;
  progress: number;
  safe: boolean;
  drinker: boolean;
  picked: boolean;
  connected: boolean;
}

export type SaloonMode = "idle" | "roll" | "quiz" | "drink" | "reveal";

// ---------- dice ----------

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [27, 27],
    [50, 50],
    [73, 73],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [27, 27],
    [73, 27],
    [50, 50],
    [27, 73],
    [73, 73],
  ],
  6: [
    [28, 25],
    [72, 25],
    [28, 50],
    [72, 50],
    [28, 75],
    [72, 75],
  ],
};

/** One die face in a 100×100 box. */
function DieFace({ value }: { value: number }) {
  return (
    <>
      <rect x="4" y="6" width="92" height="92" rx="18" fill="#c9b892" />
      <rect x="4" y="2" width="92" height="92" rx="18" fill="#fbf4e2" stroke="#3b2412" stroke-width="3" />
      {(PIPS[value] ?? []).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y - 2} r="9" fill={value === 1 ? "#b3121f" : "#2a1709"} />
      ))}
    </>
  );
}

/** A die showing `value` (an <svg> of its own). */
export function Die({ value, class: cls }: { value: number; class?: string }) {
  return (
    <svg class={`die ${cls ?? ""}`} viewBox="0 0 100 100" role="img" aria-label={`Dice: ${value}`}>
      <DieFace value={value} />
    </svg>
  );
}

/** A random face that changes every 90 ms (never the same twice running) while `spinning`. */
function useTumblingFace(spinning: boolean): number {
  const [face, setFace] = useState(() => 1 + Math.floor(Math.random() * CUP_DIE_SIDES));
  useEffect(() => {
    if (!spinning) return;
    const spin = setInterval(() => setFace((f) => 1 + ((f + Math.floor(Math.random() * (CUP_DIE_SIDES - 1))) % CUP_DIE_SIDES)), 90);
    return () => clearInterval(spin);
  }, [spinning]);
  return face;
}

/** The face a seat badge shows: random faces while the dice roll, the real one once they land. */
function BadgeDieFace({ value, rolling }: { value: number; rolling: boolean }) {
  const face = useTumblingFace(rolling);
  return <DieFace value={rolling ? face : value} />;
}

/** A die that tumbles through random faces for `rollMs`, then lands on `value`. */
export function RollingDie({ value, rollMs, class: cls, onLand }: { value: number; rollMs: number; class?: string; onLand?: () => void }) {
  const [landed, setLanded] = useState(rollMs <= 0);
  const face = useTumblingFace(!landed);
  useEffect(() => {
    if (rollMs <= 0) return;
    const stop = setTimeout(() => {
      setLanded(true);
      onLand?.();
    }, rollMs);
    return () => clearTimeout(stop);
  }, []);
  return <Die value={landed ? value : face} class={`${cls ?? ""} ${landed ? "landed" : "rolling"}`} />;
}

// ---------- cups ----------

/** A tin cup of bubbling green liquid, `w` wide, standing with its base centred on (0, 0). */
function CupShape({ w, bubbles = true }: { w: number; bubbles?: boolean }) {
  const h = w * 1.15;
  const top = w / 2;
  const bottom = w * 0.4;
  const rimRy = w * 0.18;
  return (
    <>
      <ellipse cx="0" cy="0" rx={bottom * 1.15} ry={rimRy * 0.8} fill="rgba(0,0,0,0.35)" />
      <path d={`M${-top},${-h} L${-bottom},0 A${bottom},${rimRy * 0.7} 0 0 0 ${bottom},0 L${top},${-h} Z`} fill="url(#cup-tin)" stroke="#3d3f44" stroke-width={Math.max(1, w * 0.04)} />
      <path d={`M${-top * 0.55},${-h * 0.92} L${-bottom * 0.6},${-h * 0.12}`} stroke="rgba(255,255,255,0.55)" stroke-width={w * 0.07} stroke-linecap="round" />
      <ellipse cx="0" cy={-h} rx={top} ry={rimRy} fill="#e4e6ea" stroke="#3d3f44" stroke-width={Math.max(1, w * 0.04)} />
      <ellipse class="cup-liquid" cx="0" cy={-h + rimRy * 0.12} rx={top * 0.82} ry={rimRy * 0.7} fill="url(#cup-brew)" />
      {bubbles && (
        <g class="cup-bubbles">
          {[-0.4, 0.05, 0.38].map((dx, i) => (
            <circle key={i} cx={top * dx} cy={-h} r={w * (0.07 + i * 0.015)} style={{ animationDelay: `${(i * 0.37 + w * 0.013) % 1.2}s` }} />
          ))}
        </g>
      )}
    </>
  );
}

/** Gradients the cups need; put once inside any <svg> that draws cups. */
function CupDefs() {
  return (
    <>
      <linearGradient id="cup-tin" x1="0" x2="1">
        <stop offset="0" stop-color="#8d929a" />
        <stop offset="0.35" stop-color="#d7dade" />
        <stop offset="1" stop-color="#6c7078" />
      </linearGradient>
      <radialGradient id="cup-brew">
        <stop offset="0" stop-color="#d8ff7a" />
        <stop offset="0.6" stop-color="#7fdc2c" />
        <stop offset="1" stop-color="#3f8f12" />
      </radialGradient>
    </>
  );
}

/** One big cup as its own <svg>, for the phone's cup picker. */
export function CupArt({ class: cls }: { class?: string }) {
  return (
    <svg class={`cup-art ${cls ?? ""}`} viewBox="-60 -110 120 125" aria-hidden="true">
      <defs>
        <CupDefs />
      </defs>
      <CupShape w={80} />
    </svg>
  );
}

// ---------- the saloon ----------

/** The room behind the table, fading into the dark on screens wider than the picture. */
function Backdrop() {
  const x0 = CX - ROOM_W / 2;
  const fade = 160;
  return (
    <g class="saloon-backdrop">
      <rect x={-BLEED} y="-200" width={SALOON_W + 2 * BLEED} height={SALOON_H + 400} fill="#1d0d04" />
      <image href={saloonImg} x={x0} y={ROOM_Y} width={ROOM_W} height={ROOM_H} preserveAspectRatio="none" />
      {/* The sign over the door (blanked in the picture, at 677, 196 of its 1344×768 pixels). */}
      <text class="saloon-sign" x={x0 + (677 / 1344) * ROOM_W} y={ROOM_Y + (196 / 768) * ROOM_H + 9} text-anchor="middle">
        SALOON
      </text>
      <rect x={x0} y={ROOM_Y} width={fade} height={ROOM_H} fill="url(#saloon-fade-l)" />
      <rect x={x0 + ROOM_W - fade} y={ROOM_Y} width={fade} height={ROOM_H} fill="url(#saloon-fade-r)" />
    </g>
  );
}

/** The table picture, stretched so its tabletop lands on the table ellipse. */
function Table({ children }: { children?: ComponentChildren }) {
  const w = TABLE_RX / TOP_FRX;
  const h = TABLE_RY / TOP_FRY;
  const x = CX - TOP_FX * w;
  const y = CY - TOP_FY * h;
  // The tabletop is drawn about this far above the floor; its shadow falls straight down under the lamps.
  const lift = h * 0.62;
  return (
    <g class="saloon-table">
      <ellipse cx={CX} cy={CY + lift} rx={TABLE_RX * 0.95} ry={TABLE_RY * 0.9} fill="url(#saloon-table-shadow)" />
      <image href={tableImg} x={x} y={y} width={w} height={h} preserveAspectRatio="none" />
      <g class="table-center">{children}</g>
    </g>
  );
}

interface Seat {
  p: SeatPlayer;
  x: number;
  y: number;
  size: number;
  /** Direction from the table centre to the seat. */
  angle: number;
}

/** Spread the players evenly around the table, starting at the far side. */
function seats(players: SeatPlayer[]): Seat[] {
  const n = players.length;
  // The ring is about this long; leave room between neighbours.
  const ring = 2 * Math.PI * Math.sqrt((SEAT_RX ** 2 + SEAT_RY ** 2) / 2);
  const base = Math.max(54, Math.min(128, (ring / Math.max(1, n)) * 0.92));
  return players.map((p, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
    const near = (Math.sin(angle) + 1) / 2; // 0 far side … 1 near side
    return { p, angle, x: CX + SEAT_RX * Math.cos(angle), y: CY + SEAT_RY * Math.sin(angle), size: base * (0.82 + 0.18 * near) };
  });
}

const farSide = (s: Seat) => Math.sin(s.angle) < -0.3;

/** The cups in front of one seat: screen positions, left to right. */
function cupSpots(s: Seat, count: number, startCups: number): { x: number; y: number; w: number }[] {
  const bx = CX + (s.x - CX) * CUP_RING;
  const by = CY + (s.y - CY) * CUP_RING + 10;
  let tx = -Math.sin(s.angle) * SEAT_RX;
  let ty = Math.cos(s.angle) * SEAT_RY;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  if (tx < 0 || (tx === 0 && ty < 0)) {
    tx = -tx;
    ty = -ty;
  }
  // More cups to start with: smaller ones, so the row stays in front of its seat.
  const w = Math.max(12, Math.min(36, s.size * 0.3) * Math.min(1, 3.5 / startCups));
  const gap = w * 1.2;
  return Array.from({ length: count }, (_, k) => {
    const off = (k - (count - 1) / 2) * gap;
    return { x: bx + tx * off, y: by + ty * off * 0.6, w };
  });
}

function SeatAvatar({ s, cls, children }: { s: Seat; cls: string; children?: ComponentChildren }) {
  const art = AVATAR_ART[s.p.avatar.avatar] ?? AVATAR_ART.cat;
  const extra = ACCESSORY_ART[s.p.avatar.accessory] ?? ACCESSORY_ART.none;
  const size = s.size;
  return (
    <g class={`seat ${cls}`} style={{ transform: `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)` }}>
      <ellipse class="seat-glow" cx="0" cy={size * 0.42} rx={size * 0.5} ry={size * 0.16} />
      <g class="seat-body" style={{ transformOrigin: `0px ${size * 0.45}px` }}>
        <g transform={`translate(${-size / 2} ${-size / 2}) scale(${size / 100})`}>
          {art()}
          {extra()}
        </g>
      </g>
      {/* On the far side, below the player is the table: the name goes above instead. */}
      <text class="seat-name" x="0" y={farSide(s) ? -size / 2 - 8 : size * 0.5 + 16} text-anchor="middle" font-size={Math.max(13, size * 0.17)}>
        {s.p.nickname.length > 12 ? `${s.p.nickname.slice(0, 11)}…` : s.p.nickname}
      </text>
      {children}
    </g>
  );
}

/** Above a player's head: their die and progress, a SAFE ribbon, or whether they've picked a cup. */
function SeatBadge({ s, mode }: { s: Seat; mode: SaloonMode }) {
  const { p, size } = s;
  const d = Math.max(26, size * 0.34);
  // Near the front of the table, above the head is where the cups are: put it beside the player instead.
  const beside = Math.sin(s.angle) > 0.7;
  return (
    <g transform={beside ? `translate(${size * 0.55 + d * 1.1} ${size * 0.15 + d})` : undefined}>
      <BadgeContent p={p} size={size} d={d} y={-size / 2 - 6 - (farSide(s) ? Math.max(13, size * 0.17) + 6 : 0)} mode={mode} />
    </g>
  );
}

function BadgeContent({ p, size, d, y, mode }: { p: SeatPlayer; size: number; d: number; y: number; mode: SaloonMode }) {
  if (mode === "drink") {
    if (!p.drinker) return <SafeRibbon y={y} size={size} />;
    return (
      <g class={`pick-badge ${p.picked ? "picked" : ""}`} transform={`translate(0 ${y - d * 0.45})`}>
        <circle r={d * 0.5} />
        <text y={d * 0.17} text-anchor="middle" font-size={d * 0.5}>
          {p.picked ? "✓" : "?"}
        </text>
      </g>
    );
  }
  if (mode !== "roll" && mode !== "quiz") return null;
  if (p.target <= 0) return null;
  if (p.safe && mode === "quiz") return <SafeRibbon y={y} size={size} />;
  return (
    <g class="die-badge" transform={`translate(0 ${y - d})`}>
      <g class={mode === "roll" ? "die-tumble" : ""} transform={`translate(${-d * 0.95} 0)`}>
        <g transform={`scale(${d / 100})`}>
          <BadgeDieFace value={p.target} rolling={mode === "roll"} />
        </g>
      </g>
      {mode === "quiz" && (
        <g transform={`translate(${d * 0.12} ${d * 0.12})`}>
          <rect class="progress-chip" width={d * 1.25} height={d * 0.76} rx={d * 0.2} />
          <text x={d * 0.62} y={d * 0.56} text-anchor="middle" font-size={d * 0.48} class="progress-text">
            {p.progress}/{p.target}
          </text>
        </g>
      )}
    </g>
  );
}

function SafeRibbon({ y, size }: { y: number; size: number }) {
  const w = Math.max(56, size * 0.8);
  const h = w * 0.36;
  return (
    <g transform={`translate(0 ${y - h})`}>
      <g class="safe-ribbon">
        <rect x={-w / 2} y={0} width={w} height={h} rx={h * 0.25} />
        <text x="0" y={h * 0.72} text-anchor="middle" font-size={h * 0.66}>
          SAFE
        </text>
      </g>
    </g>
  );
}

/**
 * The saloon table with everyone still alive around it. During the reveal the
 * drinker in the spotlight lifts their cup, then survives or keels over.
 */
export function SaloonScene({
  players,
  mode,
  drinks = [],
  current = -1,
  startCups = CUP_DEFAULT_CUPS,
  rollKey,
  children,
}: {
  players: SeatPlayer[];
  mode: SaloonMode;
  /** Cups each player started with (sizes the cups). */
  startCups?: number;
  /** The reveal's drinks (empty otherwise). Players poisoned in it stay seated until it ends, so they can fall. */
  drinks?: CupDrinkView[];
  current?: number;
  /** Changes each round so the dice tumble again. */
  rollKey?: string;
  /** Drawn in the middle of the table. */
  children?: ComponentChildren;
}) {
  const drinkOf = new Map(drinks.map((d, i) => [d.id, { d, i }]));
  const all = seats(players);
  const far = all.filter((s) => Math.sin(s.angle) < -0.05);
  const near = all.filter((s) => Math.sin(s.angle) >= -0.05).sort((a, b) => a.y - b.y);

  const seatClass = (s: Seat) => {
    const r = drinkOf.get(s.p.id);
    const spotlit = mode === "reveal" && r?.i === current;
    return [
      s.p.connected ? "" : "offline",
      mode === "drink" && s.p.drinker ? "drinker" : "",
      (mode === "quiz" || mode === "drink") && s.p.safe ? "safe" : "",
      spotlit ? "spotlight" : "",
      r?.d.verdict === "poison" ? "dying" : r?.d.verdict === "safe" && spotlit ? "survived" : "",
    ].join(" ");
  };

  const renderSeat = (s: Seat) => {
    const r = drinkOf.get(s.p.id);
    return (
      <SeatAvatar key={s.p.id} s={s} cls={seatClass(s)}>
        <SeatBadge key={`${rollKey}-${s.p.id}`} s={s} mode={mode} />
        {r?.d.verdict === "poison" && (
          <text class="seat-skull" x="0" y={-s.size * 0.62} text-anchor="middle" font-size={s.size * 0.5}>
            ☠
          </text>
        )}
      </SeatAvatar>
    );
  };

  const renderCups = (s: Seat) => {
    const r = mode === "reveal" ? drinkOf.get(s.p.id) : undefined;
    const before = r ? r.d.cupsBefore : s.p.cups;
    const spots = cupSpots(s, before, startCups);
    return spots.map((c, k) => {
      const drunk = r && r.d.cup === k;
      const lifted = drunk && (r.i === current || r.d.verdict !== null);
      // Lift the cup most of the way to the drinker's mouth.
      const tx = lifted ? (s.x - c.x) * 0.72 : 0;
      const ty = lifted ? (s.y - c.y) * 0.72 + s.size * 0.12 : 0;
      const cls = ["table-cup", drunk ? "chosen" : "", lifted ? "lifted" : "", drunk && r.d.verdict === "poison" ? "poisoned" : "", drunk && r.d.verdict === "safe" ? "drained" : ""].join(" ");
      return (
        <g key={`${s.p.id}-${k}`} class={cls} style={{ transform: `translate(${(c.x + tx).toFixed(1)}px, ${(c.y + ty).toFixed(1)}px)` }}>
          <CupShape w={c.w} bubbles={!(drunk && r.d.verdict)} />
          {drunk && r.d.verdict === "poison" && (
            <text x="0" y={-c.w * 1.5} text-anchor="middle" font-size={c.w * 0.9} class="cup-skull">
              ☠
            </text>
          )}
        </g>
      );
    });
  };

  return (
    <svg class={`saloon mode-${mode}`} viewBox={`0 0 ${SALOON_W} ${SALOON_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Players around the saloon table">
      <defs>
        <linearGradient id="saloon-fade-l">
          <stop offset="0" stop-color="#1d0d04" />
          <stop offset="1" stop-color="#1d0d04" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="saloon-fade-r">
          <stop offset="0" stop-color="#1d0d04" stop-opacity="0" />
          <stop offset="1" stop-color="#1d0d04" />
        </linearGradient>
        <radialGradient id="saloon-table-shadow">
          <stop offset="0" stop-color="rgba(20,8,0,0.55)" />
          <stop offset="1" stop-color="rgba(20,8,0,0)" />
        </radialGradient>
        <radialGradient id="saloon-vignette">
          <stop offset="0.55" stop-color="rgba(0,0,0,0)" />
          <stop offset="1" stop-color="rgba(20,8,0,0.6)" />
        </radialGradient>
        <radialGradient id="saloon-pool" cx="0.5" cy="0.55">
          <stop offset="0" stop-color="rgba(255,214,140,0.35)" />
          <stop offset="1" stop-color="rgba(255,214,140,0)" />
        </radialGradient>
        <CupDefs />
      </defs>
      <Backdrop />
      <ellipse cx={CX} cy={CY} rx={TABLE_RX + 230} ry={TABLE_RY + 170} fill="url(#saloon-pool)" />
      <g class="seats far">{far.map(renderSeat)}</g>
      <Table>{children}</Table>
      <g class="cups">{all.map(renderCups)}</g>
      <g class="seats near">{near.map(renderSeat)}</g>
      <rect class="saloon-vignette" x={-BLEED} y="-200" width={SALOON_W + 2 * BLEED} height={SALOON_H + 400} fill="url(#saloon-vignette)" pointer-events="none" />
    </svg>
  );
}

/** Table centre, for text drawn on the table. */
export const TABLE_CENTER = { x: CX, y: CY };
