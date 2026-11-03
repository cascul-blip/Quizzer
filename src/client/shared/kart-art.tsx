/**
 * Kart Rally art: an Indy-style oval seen from straight above, and the open-wheel cars
 * that race round it. Everything is inline SVG in kart-rules.ts field units (y down), so
 * the projector can stack the cars on top of the track with the same viewBox.
 */
import { Component } from "preact";
import { CAR_L, CAR_W, CX, CY, FIELD_H, FIELD_W, LAP, STRAIGHT, TRACK_W, TURN_R, trackPoint } from "../../shared/kart-rules.ts";

const HALF = STRAIGHT / 2;
const EDGE = TRACK_W / 2;
/** Grey apron inside the racing surface, then the inside wall. */
const APRON = 12;
const INNER_WALL = EDGE + APRON + 2;

/** Small deterministic PRNG, so the crowd and the trees are the same on every render. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f1 = (n: number) => n.toFixed(1);

/** The stadium outline `offset` from the centre line (positive = outwards). */
function stadium(offset: number): string {
  const r = TURN_R + offset;
  const l = CX - HALF;
  const rt = CX + HALF;
  return `M${l} ${CY + r}H${rt}A${r} ${r} 0 0 0 ${rt} ${CY - r}H${l}A${r} ${r} 0 0 0 ${l} ${CY + r}Z`;
}

/** A path through trackPoint(s, offset(s)) for s in [from, to]. */
function alongTrack(from: number, to: number, offset: (s: number) => number, step = 8): string {
  const pts: string[] = [];
  for (let s = from; s <= to + 0.001; s += step) {
    const p = trackPoint(s, offset(s));
    pts.push(`${f1(p.x)} ${f1(p.y)}`);
  }
  return `M${pts.join("L")}`;
}

/** Where the turns' middles are along the track. */
const TURN_MID = [HALF + (Math.PI * TURN_R) / 2, HALF + (Math.PI * TURN_R) / 2 + LAP / 2];

/** The groove: out wide on the straights, clipping the inside at the middle of each turn. */
const racingOffset = (s: number) => -24 * Math.cos((2 * Math.PI * (s - TURN_MID[0]!)) / (LAP / 2));

const CROWD = ["#e63946", "#f1faee", "#ffd23f", "#1d6fe0", "#2a9d3f", "#ff7a1a", "#ffffff", "#222831", "#8e44ad", "#f4a6b8", "#00a6b4", "#c9a227"];

function Grandstand({ x, y, w, h, top, seed }: { x: number; y: number; w: number; h: number; top: boolean; seed: number }) {
  const r = rng(seed);
  const rows = 6;
  const roof = 16;
  const seatsY = top ? y + roof : y;
  const rowH = (h - roof) / rows;
  const bays = 8;
  const bayW = w / bays;
  const dots = [];
  const rowRects = [];
  for (let i = 0; i < rows; i++) {
    const ry = seatsY + i * rowH;
    rowRects.push(<rect key={i} x={x} y={f1(ry)} width={w} height={f1(rowH - 1.2)} fill={i % 2 ? "#4a5263" : "#535c6f"} />);
    // Fuller near the track.
    const nearTrack = top ? i / (rows - 1) : 1 - i / (rows - 1);
    for (let b = 0; b < bays; b++) {
      const bx = x + b * bayW + 6;
      for (let dx = 0; dx < bayW - 12; dx += 6.2) {
        if (r() > 0.55 + nearTrack * 0.4) continue;
        dots.push(<circle cx={f1(bx + dx + r() * 2)} cy={f1(ry + rowH / 2 + (r() - 0.5) * 2)} r={f1(2 + r() * 0.6)} fill={CROWD[Math.floor(r() * CROWD.length)]} />);
      }
    }
  }
  const roofY = top ? y : y + h - roof;
  return (
    <g>
      <rect x={x - 4} y={y - 2} width={w + 8} height={h + 4} rx="3" fill="#2c313b" />
      {rowRects}
      {/* Stairs between the bays. */}
      {Array.from({ length: bays - 1 }, (_, b) => (
        <rect key={b} x={f1(x + (b + 1) * bayW - 3)} y={seatsY} width="6" height={h - roof} fill="#8a909c" />
      ))}
      <g>{dots}</g>
      {/* Roof over the back rows, with its shadow falling on the seats. */}
      <rect x={x - 6} y={top ? roofY + roof : roofY - 7} width={w + 12} height="7" fill="rgba(0,0,0,0.28)" />
      <rect x={x - 6} y={roofY} width={w + 12} height={roof} fill="#c9ced6" />
      <rect x={x - 6} y={top ? roofY : roofY + roof - 4} width={w + 12} height="4" fill="#9aa1ad" />
      {Array.from({ length: 23 }, (_, i) => (
        <line key={i} x1={f1(x + (i * (w + 12)) / 22 - 6)} x2={f1(x + (i * (w + 12)) / 22 - 6)} y1={roofY} y2={roofY + roof} stroke="#b2b8c2" stroke-width="1.2" />
      ))}
    </g>
  );
}

function Trees({ seed, spots }: { seed: number; spots: [number, number, number, number][] }) {
  const r = rng(seed);
  const out = [];
  for (const [x0, y0, x1, y1] of spots) {
    const n = Math.round(((x1 - x0) * (y1 - y0)) / 1400);
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * (x1 - x0);
      const y = y0 + r() * (y1 - y0);
      const rad = 9 + r() * 8;
      out.push(
        <g key={out.length}>
          <circle cx={f1(x + 4)} cy={f1(y + 5)} r={f1(rad)} fill="rgba(0,0,0,0.3)" />
          <circle cx={f1(x)} cy={f1(y)} r={f1(rad)} fill={r() > 0.5 ? "#2f5d2a" : "#3a6b2f"} />
          <circle cx={f1(x - rad * 0.3)} cy={f1(y - rad * 0.3)} r={f1(rad * 0.55)} fill="#4f8a3c" opacity="0.7" />
        </g>,
      );
    }
  }
  return <g>{out}</g>;
}

/** Faint black arcs where cars have slid wide or locked up. */
function TyreMarks() {
  const r = rng(7);
  const marks = [];
  for (let i = 0; i < 14; i++) {
    const s0 = r() * LAP;
    const len = 60 + r() * 120;
    const o0 = (r() - 0.5) * 70;
    const drift = (r() - 0.5) * 40;
    for (const side of [-9, 9]) {
      marks.push(<path key={`${i}${side}`} d={alongTrack(s0, s0 + len, (s) => o0 + side + (drift * (s - s0)) / len, 10)} />);
    }
  }
  return (
    <g fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="2.6" stroke-linecap="round">
      {marks}
    </g>
  );
}

function Checkers({ x, y, cols, rows, size }: { x: number; y: number; cols: number; rows: number; size: number }) {
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((r + c) % 2 === 0) cells.push(<rect key={`${r}-${c}`} x={x + c * size} y={y + r * size} width={size} height={size} fill="#111" />);
  return (
    <g>
      <rect x={x} y={y} width={cols * size} height={rows * size} fill="#f4f4f4" />
      {cells}
    </g>
  );
}

function PitLane() {
  const y0 = CY + TURN_R - INNER_WALL; // inside wall on the bottom straight
  const laneTop = y0 - 52;
  const laneBot = y0 - 8;
  const x0 = CX - 300;
  const x1 = CX + 300;
  const boxes = [];
  for (let x = x0 + 20; x <= x1 - 20; x += 40) boxes.push(<line key={x} x1={x} x2={x} y1={laneTop + 2} y2={laneTop + 20} stroke="#fff" stroke-opacity="0.75" stroke-width="1.5" />);
  const garages = [];
  for (let x = x0 + 10; x < x1 - 10; x += 40) garages.push(<rect key={x} x={x + 1} y={laneTop - 34} width="38" height="30" fill={x % 80 ? "#d4d8de" : "#c6cbd2"} />);
  return (
    <g>
      {/* Lane, with tapered entry and exit. */}
      <path d={`M${x0 - 110} ${laneBot + 6}L${x0} ${laneTop}H${x1}L${x1 + 110} ${laneBot + 6}Z`} fill="#45484e" />
      <path d={`M${x0 - 110} ${laneBot + 6}L${x0} ${laneTop}H${x1}L${x1 + 110} ${laneBot + 6}Z`} fill="url(#kt-grain)" opacity="0.5" />
      <line x1={x0} x2={x1} y1={laneTop + 22} y2={laneTop + 22} stroke="#fff" stroke-width="1.5" stroke-dasharray="10 8" opacity="0.6" />
      {boxes}
      {/* Pit wall. */}
      <rect x={x0 - 60} y={laneBot} width={x1 - x0 + 120} height="4" fill="#e3e5e9" />
      <rect x={x0 - 60} y={laneBot + 4} width={x1 - x0 + 120} height="2" fill="rgba(0,0,0,0.35)" />
      {/* Garages. */}
      <rect x={x0 + 6} y={laneTop - 30} width={x1 - x0 - 6} height="30" fill="rgba(0,0,0,0.3)" />
      {garages}
      <rect x={x0 + 10} y={laneTop - 4} width={x1 - x0 - 20} height="3" fill="#8f96a1" />
    </g>
  );
}

function Track() {
  const outer = stadium(EDGE);
  const inner = stadium(-EDGE);
  const ring = `${outer}${inner}`;
  const apronRing = `${inner}${stadium(-EDGE - APRON)}`;
  const leftC = CX - HALF;
  const rightC = CX + HALF;
  const curbR = TURN_R - EDGE - 3;
  const curbs = [
    `M${rightC} ${CY + curbR}A${curbR} ${curbR} 0 0 0 ${rightC} ${CY - curbR}`,
    `M${leftC} ${CY - curbR}A${curbR} ${curbR} 0 0 0 ${leftC} ${CY + curbR}`,
  ];
  const sfX = CX - 8;
  const sfY = CY + TURN_R - EDGE;
  return (
    <>
      <defs>
        <linearGradient id="kt-asphalt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#40434a" />
          <stop offset="0.5" stop-color="#36393f" />
          <stop offset="1" stop-color="#3c3f45" />
        </linearGradient>
        <filter id="kt-noise" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.2 -0.45" />
        </filter>
        <filter id="kt-mottle" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="8" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.1  0 0 0 0 0.25  0 0 0 0 0.05  0 0 0 0.9 -0.3" />
        </filter>
        <filter id="kt-blur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <pattern id="kt-grain" width="23" height="23" patternUnits="userSpaceOnUse">
          {Array.from({ length: 18 }, (_, i) => {
            const r = rng(100 + i);
            return <rect key={i} x={f1(r() * 23)} y={f1(r() * 23)} width="1.2" height="1.2" fill={r() > 0.5 ? "#6b6f77" : "#24262a"} />;
          })}
        </pattern>
        <pattern id="kt-stripes-out" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <rect width="80" height="80" fill="#3d6e33" />
          <rect width="40" height="80" fill="#467a3a" />
        </pattern>
        <pattern id="kt-stripes-in" width="64" height="64" patternUnits="userSpaceOnUse">
          <rect width="64" height="64" fill="#4c8a3b" />
          <rect width="64" height="32" fill="#579744" />
        </pattern>
        <clipPath id="kt-ring">
          <path d={ring} clip-rule="evenodd" fill-rule="evenodd" />
        </clipPath>
        <clipPath id="kt-infield">
          <path d={stadium(-INNER_WALL)} />
        </clipPath>
      </defs>

      {/* Outside the oval: striped lawns, a service road and trees. */}
      <rect x="0" y="0" width={FIELD_W} height={FIELD_H} fill="url(#kt-stripes-out)" />
      <rect x="0" y="0" width={FIELD_W} height={FIELD_H} filter="url(#kt-mottle)" />
      <path d={stadium(EDGE + 30)} fill="none" stroke="#7d7f7a" stroke-width="14" opacity="0.85" />
      <Trees
        seed={11}
        spots={[
          [6, 6, 210, 96],
          [1390, 6, 1594, 96],
          [6, 804, 210, 894],
          [1390, 804, 1594, 894],
          [4, 260, 40, 640],
          [1560, 260, 1596, 640],
        ]}
      />
      <Grandstand x={240} y={4} w={FIELD_W - 480} h={86} top seed={21} />
      <Grandstand x={240} y={FIELD_H - 90} w={FIELD_W - 480} h={86} top={false} seed={22} />

      {/* Outside wall (SAFER barrier) and catch fence. */}
      <path d={stadium(EDGE + 12)} fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="10" />
      <path d={stadium(EDGE + 5)} fill="none" stroke="#e4e6ea" stroke-width="9" />
      <path d={stadium(EDGE + 1)} fill="none" stroke="#9a9fa8" stroke-width="2" />
      <path d={stadium(EDGE + 10)} fill="none" stroke="#c5c9cf" stroke-width="1.2" stroke-dasharray="3 3" />

      {/* The racing surface: asphalt, grain, the rubbered-in groove and tyre marks. */}
      <path d={ring} fill-rule="evenodd" fill="url(#kt-asphalt)" />
      <g clip-path="url(#kt-ring)">
        <rect x="0" y="0" width={FIELD_W} height={FIELD_H} fill="url(#kt-grain)" opacity="0.7" />
        <rect x="0" y="0" width={FIELD_W} height={FIELD_H} filter="url(#kt-noise)" opacity="0.13" />
        <path d={alongTrack(0, LAP, racingOffset, 6)} fill="none" stroke="#000" stroke-opacity="0.28" stroke-width="30" filter="url(#kt-blur)" />
        <TyreMarks />
        {/* Grid boxes behind the start line. */}
        {[0, 1, 2, 3].map((row) =>
          [-30, 0, 30].map((o) => {
            const p = trackPoint(-40 - row * 70, o);
            return <path key={`${row}${o}`} d={`M${f1(p.x + 18)} ${f1(p.y - 12)}H${f1(p.x - 22)}`} stroke="#fff" stroke-opacity="0.45" stroke-width="2" />;
          }),
        )}
      </g>
      {/* Apron and the white lines along both edges. */}
      <path d={apronRing} fill-rule="evenodd" fill="#7b7e84" />
      <path d={stadium(EDGE - 4)} fill="none" stroke="#f2f2f2" stroke-width="2.6" opacity="0.9" />
      <path d={stadium(-EDGE + 3)} fill="none" stroke="#f2f2f2" stroke-width="2.6" opacity="0.9" />
      <path d={stadium(-EDGE - APRON + 2)} fill="none" stroke="#f5d23a" stroke-width="2" opacity="0.8" />
      {/* Red and white curbs on the inside of the turns. */}
      {curbs.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="#f4f4f4" stroke-width="8" />
          <path d={d} fill="none" stroke="#d62828" stroke-width="8" stroke-dasharray="11 11" />
        </g>
      ))}
      {/* Inside wall. */}
      <path d={stadium(-INNER_WALL)} fill="none" stroke="#e4e6ea" stroke-width="4" />

      {/* Infield: mown grass, the pits and the logo. */}
      <path d={stadium(-INNER_WALL - 2)} fill="url(#kt-stripes-in)" />
      <g clip-path="url(#kt-infield)">
        <rect x="0" y="0" width={FIELD_W} height={FIELD_H} filter="url(#kt-mottle)" opacity="0.8" />
        <Trees seed={33} spots={[[CX - HALF - 170, CY - 120, CX - HALF - 70, CY + 120], [CX + HALF + 70, CY - 120, CX + HALF + 170, CY + 120]]} />
      </g>
      <PitLane />
      <g transform={`translate(${CX} ${CY - 40}) skewX(-12)`} font-family="'Arial Black', Impact, 'Helvetica Neue', Arial, sans-serif" font-weight="900" text-anchor="middle">
        <rect x="-330" y="-86" width="660" height="150" rx="10" fill="rgba(255,255,255,0.08)" />
        <text y="22" font-size="118" fill="#1a2a12" opacity="0.35" transform="translate(6 7)">
          KART RALLY
        </text>
        <text y="22" font-size="118" fill="#f6f6f6">
          KART RALLY
        </text>
        <rect x="-300" y="38" width="600" height="12" fill="#d62828" />
        <rect x="-300" y="-76" width="600" height="6" fill="#d62828" />
        <Checkers x={-300} y={52} cols={60} rows={1} size={10} />
      </g>

      {/* Start/finish line across the bottom straight, and "yard of bricks" wording. */}
      <Checkers x={sfX} y={sfY} cols={2} rows={12} size={TRACK_W / 12} />
      <rect x={sfX - 3} y={sfY} width="2" height={TRACK_W} fill="#fff" />
      <rect x={sfX + 2 * (TRACK_W / 12) + 1} y={sfY} width="2" height={TRACK_W} fill="#fff" />
    </>
  );
}

/** The whole oval, static: renders once and never again (it is the heaviest part of the scene). */
export class KartTrack extends Component<{ class?: string }> {
  shouldComponentUpdate() {
    return false;
  }
  render() {
    return (
      <svg class={`kart-track ${this.props.class ?? ""}`} viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <Track />
      </svg>
    );
  }
}

const L2 = CAR_L / 2;
const W2 = CAR_W / 2;

function Tyre({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="2" fill="#151515" />
      <rect x={x + 1.2} y={y + 0.8} width={w - 2.4} height={h * 0.32} rx="1" fill="#3a3a3a" />
    </g>
  );
}

/**
 * A top-down open-wheel car, CAR_L long and CAR_W wide, centred on (0, 0) and pointing
 * along +x. `wheel` (−1…1) turns the front tyres; positive steers right (clockwise on screen).
 */
export function KartCar({ color, wheel = 0 }: { color: string; wheel?: number }) {
  const steer = Math.max(-1, Math.min(1, wheel)) * 25;
  // Tyre size and the axles.
  const tw = 11;
  const th = 6.5;
  const fx = 13;
  const rx = -15;
  const ty = W2 - th / 2;
  return (
    <g class="kart-car">
      {/* Shadow. */}
      <rect x={-L2 + 2} y={-W2 + 3} width={CAR_L} height={CAR_W} rx="8" fill="rgba(0,0,0,0.35)" />
      {/* Suspension. */}
      <g stroke="#1b1b1b" stroke-width="1.3">
        <path d={`M${fx - 3} -3L${fx} ${-ty}M${fx + 3} -2.5L${fx} ${-ty}M${fx - 3} 3L${fx} ${ty}M${fx + 3} 2.5L${fx} ${ty}`} />
        <path d={`M${rx - 3} -5L${rx} ${-ty}M${rx + 4} -5L${rx} ${-ty}M${rx - 3} 5L${rx} ${ty}M${rx + 4} 5L${rx} ${ty}`} />
      </g>
      {/* Rear tyres. */}
      <Tyre x={rx - tw / 2 - 0.5} y={-W2} w={tw + 1} h={th + 0.5} />
      <Tyre x={rx - tw / 2 - 0.5} y={W2 - th - 0.5} w={tw + 1} h={th + 0.5} />
      {/* Front tyres, turned with the wheel. */}
      <g transform={`rotate(${f1(steer)} ${fx} ${-ty})`}>
        <Tyre x={fx - tw / 2} y={-W2 + 0.5} w={tw} h={th} />
      </g>
      <g transform={`rotate(${f1(steer)} ${fx} ${ty})`}>
        <Tyre x={fx - tw / 2} y={W2 - th - 0.5} w={tw} h={th} />
      </g>
      {/* Rear wing. */}
      <rect x={-L2} y={-W2 + 1.5} width="6" height={CAR_W - 3} rx="1" fill="#1d1d1d" />
      <rect x={-L2 + 1} y={-W2 + 2.5} width="4" height={CAR_W - 5} rx="0.8" fill={color} />
      <rect x={-L2 + 1} y={-W2 + 2.5} width="4" height={(CAR_W - 5) / 2} fill="#fff" opacity="0.18" />
      {/* Body: sidepods, engine cover, tub and nose. */}
      <path d={`M-19 -3.5L-8 -8.5Q2 -9 4 -6L8 -3.6L22 -2.4Q24.5 -1.8 25 0Q24.5 1.8 22 2.4L8 3.6L4 6Q2 9 -8 8.5L-19 3.5Z`} fill={color} stroke="rgba(0,0,0,0.55)" stroke-width="0.9" />
      {/* Light from above-left: highlight on one side, shade on the other. */}
      <path d={`M-19 -3.5L-8 -8.5Q2 -9 4 -6L8 -3.6L22 -2.4Q24.5 -1.8 25 0H-19Z`} fill="#fff" opacity="0.2" />
      <path d={`M-19 3.5L-8 8.5Q2 9 4 6L8 3.6L22 2.4Q24.5 1.8 25 0H-19Z`} fill="#000" opacity="0.18" />
      {/* Sidepod intakes and a centre stripe. */}
      <path d="M2 -7.6L4.5 -5.4L0 -5.6Z M2 7.6L4.5 5.4L0 5.6Z" fill="#111" opacity="0.8" />
      <rect x="-17" y="-0.9" width="41" height="1.8" fill="#fff" opacity="0.55" />
      {/* Front wing. */}
      <path d={`M19.5 ${-W2 + 1}H24.5Q25.5 ${-W2 + 1} 25.5 ${-W2 + 2.5}V${W2 - 2.5}Q25.5 ${W2 - 1} 24.5 ${W2 - 1}H19.5Z`} fill="#1d1d1d" />
      <rect x="21" y={-W2 + 2} width="3.5" height={CAR_W - 4} rx="0.8" fill={color} />
      <rect x="20.5" y={-W2 + 1} width="5" height="2" fill="#1d1d1d" />
      <rect x="20.5" y={W2 - 3} width="5" height="2" fill="#1d1d1d" />
      {/* Cockpit, aeroscreen and helmet. */}
      <path d="M-5 -3.6H6Q8 -3.6 8 0Q8 3.6 6 3.6H-5Z" fill="#141414" />
      <path d="M6.5 -4.2Q10 0 6.5 4.2" fill="none" stroke="#222" stroke-width="1.6" stroke-linecap="round" />
      <path d="M6.5 -4.2Q10 0 6.5 4.2" fill="none" stroke="#9ad8ff" stroke-opacity="0.45" stroke-width="0.7" stroke-linecap="round" />
      <circle cx="1.5" cy="0" r="3.3" fill="#f5f5f5" />
      <path d="M3 -2.4A3.3 3.3 0 0 1 3 2.4L4.6 1.3A3 3 0 0 0 4.6 -1.3Z" fill="#10202c" />
      <path d="M-1.5 -1.5H1.5V1.5H-1.5Z" fill={color} opacity="0.85" />
      {/* Airbox above the driver's head. */}
      <rect x="-9" y="-2.2" width="5" height="4.4" rx="1.4" fill="#1b1b1b" />
    </g>
  );
}

/** Two crossed checkered flags on poles, for the "get ready" screen. */
export function CheckeredFlags({ class: cls }: { class?: string }) {
  // One flag in its own frame: the pole runs down the y axis from the origin, the cloth
  // flies off to the left of its top, waving. Mirrored for the right-hand flag.
  const FW = 104;
  const FH = 66;
  const COLS = 6;
  const ROWS = 4;
  const at = (u: number, v: number) => {
    const wave = Math.sin(u * Math.PI * 1.7) * 8 + u * 6;
    return `${f1(-u * FW)},${f1(4 + wave + v * FH)}`;
  };
  const cells = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if ((r + c) % 2) continue;
      cells.push(<polygon key={`${r}${c}`} points={[at(c / COLS, r / ROWS), at((c + 1) / COLS, r / ROWS), at((c + 1) / COLS, (r + 1) / ROWS), at(c / COLS, (r + 1) / ROWS)].join(" ")} fill="#111" />);
    }
  const edge = (v: number) => Array.from({ length: 13 }, (_, i) => at(i / 12, v));
  const outline = `M${edge(0).join("L")}L${edge(1).reverse().join("L")}Z`;
  const flag = (
    <>
      <rect x="-3.5" y="-4" width="7" height="200" rx="3.5" fill="#c9a227" stroke="#7a5f10" stroke-width="1" />
      <path d={outline} fill="#fafafa" stroke="#222" stroke-width="1.5" />
      {cells}
      <path d={outline} fill="url(#kcf-shade)" />
      <circle cx="0" cy="-6" r="7" fill="#f0d25a" stroke="#7a5f10" stroke-width="1" />
    </>
  );
  return (
    <svg class={`kart-flags ${cls ?? ""}`} viewBox="-75 -20 350 225" aria-hidden="true">
      <defs>
        <linearGradient id="kcf-shade" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stop-color="#000" stop-opacity="0.1" />
          <stop offset="0.3" stop-color="#fff" stop-opacity="0.18" />
          <stop offset="0.62" stop-color="#000" stop-opacity="0.28" />
          <stop offset="1" stop-color="#fff" stop-opacity="0.12" />
        </linearGradient>
      </defs>
      <g transform="translate(30 10) rotate(-28)">{flag}</g>
      <g transform="translate(170 10) scale(-1 1) rotate(-28)">{flag}</g>
    </svg>
  );
}
