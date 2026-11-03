/**
 * Santa's Sleigh Run art: a snowy town at night seen from straight above, its houses waiting
 * for presents, and Santa's sleigh with its reindeer team. Everything is inline SVG in
 * sleigh-rules.ts field units (y down), so the projector can stack the houses and the sleighs
 * on top of the ground with the same viewBox.
 */
import { Component } from "preact";
import { CITY, CX, CY, FIELD_H, FIELD_W, PAD_R, SLEIGH_L, SLEIGH_W } from "../../shared/sleigh-rules.ts";

/** Small deterministic PRNG, so the trees and the drifts are the same on every render. */
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

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mix a #rrggbb colour towards white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const to = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  const ch = (v: number) => Math.round(v + (to - v) * k);
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const LIGHTS = ["#ff4d5e", "#ffd23f", "#3ddc6a", "#4db8ff", "#ff7ad9", "#ff9f1c"];
const GIFTS = ["#e63946", "#2a9d3f", "#1d6fe0", "#8e44ad", "#f4a100"];

// ---------- the ground ----------

/** Distance from a point to a box (0 inside). */
function boxDist(x: number, y: number, b: Box): number {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

interface Pond {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** A spot of radius r that keeps clear of the houses, the pad, the wall and everything already placed. */
function makeFree(houses: readonly Box[], taken: { x: number; y: number; r: number }[], pond: Pond | null) {
  return (x: number, y: number, r: number, gap = 6) => {
    if (x - r < CITY.x0 + 14 || x + r > CITY.x1 - 14 || y - r < CITY.y0 + 14 || y + r > CITY.y1 - 14) return false;
    if (Math.hypot(x - CX, y - CY) < PAD_R + r + 12) return false;
    if (houses.some((h) => boxDist(x, y, h) < r + gap)) return false;
    if (taken.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + r + 2)) return false;
    if (pond && ((x - pond.x) / (pond.rx + r)) ** 2 + ((y - pond.y) / (pond.ry + r)) ** 2 < 1) return false;
    return true;
  };
}

/** A pine seen from above: a star of needles with snow on the boughs. */
function Pine({ x, y, r, seed, decorated }: { x: number; y: number; r: number; seed: number; decorated?: boolean }) {
  const rnd = rng(seed);
  const pts = (rad: number, n: number, rot: number) =>
    Array.from({ length: n * 2 }, (_, i) => {
      const a = (i / (n * 2)) * Math.PI * 2 + rot;
      const rr = i % 2 ? rad * 0.55 : rad;
      return `${f1(x + Math.cos(a) * rr)},${f1(y + Math.sin(a) * rr)}`;
    }).join(" ");
  const rot = rnd() * Math.PI;
  const lights = [];
  if (decorated) {
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      const d = r * (0.25 + rnd() * 0.55);
      const c = LIGHTS[i % LIGHTS.length]!;
      lights.push(
        <g key={i}>
          <circle cx={f1(x + Math.cos(a) * d)} cy={f1(y + Math.sin(a) * d)} r="3.2" fill={c} opacity="0.35" />
          <circle cx={f1(x + Math.cos(a) * d)} cy={f1(y + Math.sin(a) * d)} r="1.5" fill={c} />
        </g>,
      );
    }
  }
  return (
    <g>
      <circle cx={f1(x + r * 0.3)} cy={f1(y + r * 0.4)} r={f1(r * 0.85)} fill="rgba(2,6,20,0.3)" />
      <polygon points={pts(r, 9, rot)} fill={decorated ? "#1f6b3a" : "#173f2e"} />
      <polygon points={pts(r * 0.72, 7, rot + 0.3)} fill={decorated ? "#2b8a4a" : "#1f5239"} />
      <polygon points={pts(r * 0.45, 6, rot + 0.6)} fill={decorated ? "#36a35a" : "#28664a"} />
      {/* Snow on the moonlit side. */}
      {!decorated && <polygon points={pts(r * 0.5, 7, rot + 0.15)} fill="#e8f0ff" opacity="0.3" transform={`translate(${f1(-r * 0.15)} ${f1(-r * 0.18)})`} />}
      {lights}
      {decorated && <Star x={x} y={y} r={4.5} />}
    </g>
  );
}

function Star({ x, y, r, fill = "#ffd23f" }: { x: number; y: number; r: number; fill?: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${f1(x + Math.cos(a) * rr)},${f1(y + Math.sin(a) * rr)}`;
  }).join(" ");
  return (
    <g>
      <circle cx={x} cy={y} r={r * 2.2} fill="url(#sl-starglow)" />
      <polygon points={pts} fill={fill} stroke="#fff3b0" stroke-width="0.6" />
    </g>
  );
}

/** A street lamp from above: a pool of warm light on the snow, the lamp in its middle. */
function Lamp({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="48" fill="url(#sl-lamp)" />
      <circle cx={x + 2} cy={y + 3} r="3.6" fill="rgba(0,0,0,0.4)" />
      <circle cx={x} cy={y} r="4.4" fill="#2a2f3a" />
      <circle cx={x} cy={y} r="3" fill="#fff1c4" />
      <circle cx={x - 0.8} cy={y - 0.8} r="1.1" fill="#fff" />
    </g>
  );
}

/** A tiny four-point glint on the snow. */
function Glint({ x, y, s }: { x: number; y: number; s: number }) {
  return <path d={`M${f1(x)} ${f1(y - s)}L${f1(x + s * 0.22)} ${f1(y)}L${f1(x)} ${f1(y + s)}L${f1(x - s * 0.22)} ${f1(y)}ZM${f1(x - s)} ${f1(y)}L${f1(x)} ${f1(y + s * 0.22)}L${f1(x + s)} ${f1(y)}L${f1(x)} ${f1(y - s * 0.22)}Z`} fill="#fff" opacity="0.8" />;
}

/** The North Pole launch pad in the middle of town. */
function LaunchPad() {
  const r = PAD_R;
  const swirl = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const p = (ang: number, rr: number) => `${f1(CX + Math.cos(ang) * rr)} ${f1(CY + Math.sin(ang) * rr)}`;
    swirl.push(<path key={i} d={`M${p(a, 2)}Q${p(a + 0.9, 7)} ${p(a + 0.5, 11)}L${p(a + 1.1, 11)}Q${p(a + 1.4, 6)} ${p(a + 0.3, 2)}Z`} fill="#d62828" />);
  }
  const glints = [];
  const rnd = rng(77);
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 30 + rnd() * (r - 50);
    glints.push(<Glint key={i} x={CX + Math.cos(a) * d} y={CY + Math.sin(a) * d} s={2 + rnd() * 3} />);
  }
  const textR = r - 15;
  return (
    <g>
      <circle cx={CX} cy={CY} r={r + 26} fill="url(#sl-padglow)" />
      <circle cx={CX + 4} cy={CY + 6} r={r} fill="rgba(0,0,0,0.3)" />
      <circle cx={CX} cy={CY} r={r} fill="url(#sl-ice)" />
      {/* Candy-cane rim. */}
      <circle cx={CX} cy={CY} r={r - 3} fill="none" stroke="#fdfdfd" stroke-width="7" />
      <circle cx={CX} cy={CY} r={r - 3} fill="none" stroke="#d62828" stroke-width="7" stroke-dasharray="10 10" />
      <circle cx={CX} cy={CY} r={r - 28} fill="none" stroke="#d9b54a" stroke-width="1.6" stroke-dasharray="2 5" opacity="0.9" />
      <circle cx={CX} cy={CY} r="58" fill="none" stroke="#9fb7df" stroke-width="1.2" opacity="0.8" />
      <defs>
        <path id="sl-pad-top" d={`M${CX - textR} ${CY}A${textR} ${textR} 0 0 1 ${CX + textR} ${CY}`} />
        <path id="sl-pad-bot" d={`M${CX - textR} ${CY}A${textR} ${textR} 0 0 0 ${CX + textR} ${CY}`} />
      </defs>
      <text font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="17" letter-spacing="5" fill="#b3121f">
        <textPath href="#sl-pad-top" startOffset="50%" text-anchor="middle">
          NORTH POLE
        </textPath>
      </text>
      <text font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="12" letter-spacing="3" fill="#2a6d43" dy="11">
        <textPath href="#sl-pad-bot" startOffset="50%" text-anchor="middle">
          ★ SLEIGH LAUNCH ★
        </textPath>
      </text>
      {glints}
      {/* The striped pole, from straight above, casting a long moon shadow. */}
      <path d={`M${CX} ${CY}L${CX + 26} ${CY + 17}`} stroke="rgba(10,20,50,0.25)" stroke-width="10" stroke-linecap="round" />
      <circle cx={CX} cy={CY} r="11" fill="#fdfdfd" stroke="#b9c6dc" stroke-width="1" />
      {swirl}
      <circle cx={CX} cy={CY} r="5.5" fill="#e8b93a" stroke="#9b7414" stroke-width="0.8" />
      <circle cx={CX - 1.8} cy={CY - 1.8} r="1.8" fill="#fff6c9" />
    </g>
  );
}

/** The low stone wall round the town, capped with snow, with wreaths along it. */
function CityWall() {
  const { x0, y0, x1, y1 } = CITY;
  const wreaths = [];
  for (let x = x0 + 160; x < x1 - 80; x += 200) wreaths.push([x, y0], [x, y1]);
  for (let y = y0 + 150; y < y1 - 80; y += 200) wreaths.push([x0, y], [x1, y]);
  return (
    <g>
      <rect x={x0 + 3} y={y0 + 5} width={x1 - x0} height={y1 - y0} fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="14" />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke="#4b5266" stroke-width="13" />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke="#6d7690" stroke-width="10" stroke-dasharray="17 3 11 3" />
      <rect x={x0 - 1} y={y0 - 1.5} width={x1 - x0} height={y1 - y0} fill="none" stroke="#eef4ff" stroke-width="5" stroke-linejoin="round" />
      {wreaths.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="7" fill="none" stroke="#1f6b3a" stroke-width="4.5" />
          <circle cx={x} cy={y} r="7" fill="none" stroke="#3a9a58" stroke-width="2" stroke-dasharray="2 3" />
          <circle cx={x! - 4} cy={y! - 5} r="1.4" fill="#ff4d5e" />
          <circle cx={x! + 5} cy={y! - 3} r="1.4" fill="#ff4d5e" />
          <path d={`M${x} ${y! + 6}l-4 3.5l1 -5.5zM${x} ${y! + 6}l4 3.5l-1 -5.5z`} fill="#e63946" />
        </g>
      ))}
      {/* Candy-cane gate posts at the corners. */}
      {[
        [x0, y0],
        [x1, y0],
        [x0, y1],
        [x1, y1],
      ].map(([x, y], i) => (
        <g key={`p${i}`}>
          <circle cx={x! + 2} cy={y! + 3} r="10" fill="rgba(0,0,0,0.4)" />
          <circle cx={x} cy={y} r="10" fill="#fdfdfd" />
          <circle cx={x} cy={y} r="6.5" fill="none" stroke="#d62828" stroke-width="3.5" stroke-dasharray="4 3" />
          <circle cx={x} cy={y} r="3" fill="#d62828" />
        </g>
      ))}
    </g>
  );
}

/** Everything static on the ground, laid out round the houses (which never move). */
function City({ houses }: { houses: readonly Box[] }) {
  const rnd = rng(2024);
  const { x0, y0, x1, y1 } = CITY;

  // A frozen pond, if there's a clear spot for one.
  let pond: Pond | null = null;
  {
    const free = makeFree(houses, [], null);
    for (let i = 0; i < 300 && !pond; i++) {
      const rx = 62 + rnd() * 20;
      const ry = 38 + rnd() * 10;
      const x = x0 + rx + 20 + rnd() * (x1 - x0 - 2 * rx - 40);
      const y = y0 + ry + 20 + rnd() * (y1 - y0 - 2 * ry - 40);
      if (free(x, y, rx, 12) && free(x - rx * 0.6, y, ry, 12) && free(x + rx * 0.6, y, ry, 12)) pond = { x, y, rx, ry };
    }
  }

  // Footpaths trodden through the snow between neighbouring houses, and out to the pad.
  const centres = houses.map((h) => ({ x: h.x + h.w / 2, y: h.y + h.h / 2 }));
  const crosses = (a: { x: number; y: number }, b: { x: number; y: number }, skip: number[]) => {
    for (let t = 0.05; t < 0.96; t += 0.05) {
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (houses.some((h, i) => !skip.includes(i) && boxDist(x, y, h) < 10)) return true;
      if (pond && ((x - pond.x) / (pond.rx + 8)) ** 2 + ((y - pond.y) / (pond.ry + 8)) ** 2 < 1) return true;
      if (!skip.includes(-1) && Math.hypot(x - CX, y - CY) < PAD_R) return true;
    }
    return false;
  };
  const edges: [{ x: number; y: number }, { x: number; y: number }][] = [];
  const seen = new Set<string>();
  centres.forEach((c, i) => {
    const near = centres
      .map((o, j) => ({ j, d: Math.hypot(o.x - c.x, o.y - c.y) }))
      .filter((o) => o.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { j, d } of near) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key) || d > 330) continue;
      seen.add(key);
      if (!crosses(c, centres[j]!, [i, j])) edges.push([c, centres[j]!]);
    }
  });
  const padLinks = centres
    .map((c, i) => ({ c, i, d: Math.hypot(c.x - CX, c.y - CY) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  for (const { c, i } of padLinks) {
    const a = Math.atan2(c.y - CY, c.x - CX);
    const rim = { x: CX + Math.cos(a) * (PAD_R - 4), y: CY + Math.sin(a) * (PAD_R - 4) };
    if (!crosses(rim, c, [i, -1])) edges.push([rim, c]);
  }
  const curve = ([a, b]: [{ x: number; y: number }, { x: number; y: number }], k: number) => {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const bend = (k % 2 ? 1 : -1) * len * 0.12;
    const cx = mx + (-(b.y - a.y) / len) * bend;
    const cy = my + ((b.x - a.x) / len) * bend;
    return { d: `M${f1(a.x)} ${f1(a.y)}Q${f1(cx)} ${f1(cy)} ${f1(b.x)} ${f1(b.y)}`, mid: { x: (mx + cx) / 2, y: (my + cy) / 2 }, nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len };
  };
  const paths = edges.map((e, k) => curve(e, k));

  // Lamps beside the paths and round the pad.
  const taken: { x: number; y: number; r: number }[] = [];
  const lamps: { x: number; y: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const p = { x: CX + Math.cos(a) * (PAD_R + 16), y: CY + Math.sin(a) * (PAD_R + 16) };
    if (!houses.some((h) => boxDist(p.x, p.y, h) < 10)) {
      lamps.push(p);
      taken.push({ ...p, r: 8 });
    }
  }
  let free = makeFree(houses, taken, pond);
  paths.forEach((p, k) => {
    if (k % 2) return;
    const x = p.mid.x + p.nx * 14;
    const y = p.mid.y + p.ny * 14;
    if (free(x, y, 6, 4)) {
      lamps.push({ x, y });
      taken.push({ x, y, r: 8 });
    }
  });

  // Decorated Christmas trees, then clusters of snowy pines, in the open spaces.
  free = makeFree(houses, taken, pond);
  const xmas: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 600 && xmas.length < 7; i++) {
    const r = 15 + rnd() * 5;
    const x = x0 + rnd() * (x1 - x0);
    const y = y0 + rnd() * (y1 - y0);
    if (free(x, y, r, 8) && !paths.some((p) => Math.hypot(p.mid.x - x, p.mid.y - y) < r + 12)) {
      xmas.push({ x, y, r });
      taken.push({ x, y, r });
    }
  }
  const pines: { x: number; y: number; r: number }[] = [];
  for (let c = 0; c < 40 && pines.length < 34; c++) {
    const cx = x0 + rnd() * (x1 - x0);
    const cy = y0 + rnd() * (y1 - y0);
    const n = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const r = 9 + rnd() * 6;
      const x = cx + (rnd() - 0.5) * 50;
      const y = cy + (rnd() - 0.5) * 50;
      if (free(x, y, r, 4)) {
        pines.push({ x, y, r });
        taken.push({ x, y, r });
      }
    }
  }

  // The forest outside the wall.
  const border: { x: number; y: number; r: number }[] = [];
  for (let x = -10; x < FIELD_W + 20; x += 22 + rnd() * 8) {
    border.push({ x, y: 6 + rnd() * 14, r: 12 + rnd() * 6 });
    border.push({ x: x + 10, y: FIELD_H - 6 - rnd() * 14, r: 12 + rnd() * 6 });
  }
  for (let y = 20; y < FIELD_H - 20; y += 22 + rnd() * 8) {
    border.push({ x: 6 + rnd() * 14, y, r: 12 + rnd() * 6 });
    border.push({ x: FIELD_W - 6 - rnd() * 14, y: y + 10, r: 12 + rnd() * 6 });
  }

  // Soft drifts and glints over the open snow.
  const drifts = [];
  for (let i = 0; i < 46; i++) {
    const x = x0 + rnd() * (x1 - x0);
    const y = y0 + rnd() * (y1 - y0);
    const rx = 40 + rnd() * 110;
    drifts.push(<ellipse key={i} cx={f1(x)} cy={f1(y)} rx={f1(rx)} ry={f1(rx * (0.3 + rnd() * 0.3))} transform={`rotate(${f1(-20 + rnd() * 40)} ${f1(x)} ${f1(y)})`} fill="url(#sl-drift)" />);
  }
  const glints = [];
  for (let i = 0; i < 90; i++) {
    const x = x0 + rnd() * (x1 - x0);
    const y = y0 + rnd() * (y1 - y0);
    if (rnd() > 0.4) glints.push(<circle key={i} cx={f1(x)} cy={f1(y)} r={f1(0.7 + rnd() * 0.9)} fill="#fff" opacity={f1(0.35 + rnd() * 0.5)} />);
    else glints.push(<Glint key={i} x={x} y={y} s={1.6 + rnd() * 2.2} />);
  }

  return (
    <>
      <defs>
        <linearGradient id="sl-snow" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="#3a5288" />
          <stop offset="0.55" stop-color="#2c4275" />
          <stop offset="1" stop-color="#253866" />
        </linearGradient>
        <radialGradient id="sl-moon" cx="0.18" cy="0.12" r="0.75">
          <stop offset="0" stop-color="#b8ccff" stop-opacity="0.28" />
          <stop offset="1" stop-color="#b8ccff" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="sl-drift">
          <stop offset="0" stop-color="#dfe9ff" stop-opacity="0.2" />
          <stop offset="1" stop-color="#dfe9ff" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="sl-lamp">
          <stop offset="0" stop-color="#ffd98a" stop-opacity="0.6" />
          <stop offset="0.45" stop-color="#ffc35a" stop-opacity="0.22" />
          <stop offset="1" stop-color="#ffb84a" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="sl-starglow">
          <stop offset="0" stop-color="#fff1a0" stop-opacity="0.75" />
          <stop offset="1" stop-color="#fff1a0" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="sl-padglow">
          <stop offset="0.75" stop-color="#cfe0ff" stop-opacity="0.18" />
          <stop offset="1" stop-color="#cfe0ff" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="sl-ice" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stop-color="#dfe8f8" />
          <stop offset="0.7" stop-color="#b8c9e8" />
          <stop offset="1" stop-color="#97add6" />
        </radialGradient>
        <linearGradient id="sl-pond" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#9fd0f0" />
          <stop offset="1" stop-color="#5f93c8" />
        </linearGradient>
        <filter id="sl-mottle" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="3" seed="5" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.85  0 0 0 0 0.9  0 0 0 0 1  0 0 0 0.7 -0.25" />
        </filter>
      </defs>

      {/* Outside the wall: the dark forest. */}
      <rect x="0" y="0" width={FIELD_W} height={FIELD_H} fill="#16223f" />
      {border.map((t, i) => (
        <Pine key={`b${i}`} x={t.x} y={t.y} r={t.r} seed={500 + i} />
      ))}

      {/* The town's snow. */}
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="url(#sl-snow)" />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} filter="url(#sl-mottle)" opacity="0.5" />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="url(#sl-moon)" />
      {drifts}

      {/* Footpaths. */}
      <g fill="none" stroke-linecap="round">
        {paths.map((p, i) => (
          <path key={`e${i}`} d={p.d} stroke="#1f3260" stroke-width="17" opacity="0.6" />
        ))}
        {paths.map((p, i) => (
          <path key={`s${i}`} d={p.d} stroke="#4c6398" stroke-width="12" />
        ))}
        {paths.map((p, i) => (
          <path key={`f${i}`} d={p.d} stroke="#6f86bb" stroke-width="2" stroke-dasharray="2 6" opacity="0.8" />
        ))}
      </g>

      {pond && (
        <g>
          <ellipse cx={pond.x} cy={pond.y} rx={pond.rx + 7} ry={pond.ry + 7} fill="#e9f1ff" opacity="0.85" />
          <ellipse cx={pond.x} cy={pond.y} rx={pond.rx} ry={pond.ry} fill="url(#sl-pond)" />
          <path d={`M${f1(pond.x - pond.rx * 0.6)} ${f1(pond.y - pond.ry * 0.2)}q${f1(pond.rx * 0.4)} ${f1(-pond.ry * 0.3)} ${f1(pond.rx * 0.9)} ${f1(-pond.ry * 0.1)}M${f1(pond.x - pond.rx * 0.3)} ${f1(pond.y + pond.ry * 0.3)}q${f1(pond.rx * 0.5)} ${f1(-pond.ry * 0.25)} ${f1(pond.rx * 0.95)} ${f1(-pond.ry * 0.05)}`} fill="none" stroke="#f4fbff" stroke-width="2" stroke-linecap="round" opacity="0.7" />
          <path d={`M${f1(pond.x + pond.rx * 0.2)} ${f1(pond.y - pond.ry * 0.6)}l-8 14l6 6l-5 12`} fill="none" stroke="#e9f6ff" stroke-width="1" opacity="0.6" />
          <Glint x={pond.x - pond.rx * 0.35} y={pond.y - pond.ry * 0.35} s={5} />
        </g>
      )}

      {lamps.map((l, i) => (
        <Lamp key={`l${i}`} x={l.x} y={l.y} />
      ))}
      {pines.map((t, i) => (
        <Pine key={`p${i}`} x={t.x} y={t.y} r={t.r} seed={100 + i} />
      ))}
      {xmas.map((t, i) => (
        <Pine key={`x${i}`} x={t.x} y={t.y} r={t.r} seed={300 + i} decorated />
      ))}
      {glints}

      <CityWall />
      <LaunchPad />
    </>
  );
}

const houseSig = (houses: readonly Box[] | undefined) => (houses ?? []).map((h) => `${h.x},${h.y},${h.w},${h.h}`).join(";");

/**
 * The whole town's ground, static: the snow, footpaths, lamps, trees, the wall and the North
 * Pole launch pad, laid out round the houses. Renders again only if the houses move.
 */
export class CityGround extends Component<{ houses?: readonly Box[]; class?: string }> {
  shouldComponentUpdate(next: { houses?: readonly Box[]; class?: string }) {
    return houseSig(next.houses) !== houseSig(this.props.houses) || next.class !== this.props.class;
  }
  render() {
    return (
      <svg class={`sleigh-city ${this.props.class ?? ""}`} viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <City houses={this.props.houses ?? []} />
      </svg>
    );
  }
}

// ---------- houses ----------

/** Gradients the houses share: put once in the svg that holds them. */
export function HouseDefs() {
  return (
    <defs>
      <radialGradient id="sl-window">
        <stop offset="0" stop-color="#ffd477" stop-opacity="0.85" />
        <stop offset="0.5" stop-color="#ffb84a" stop-opacity="0.32" />
        <stop offset="1" stop-color="#ffb84a" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="sl-chimney">
        <stop offset="0" stop-color="#ffcf5a" stop-opacity="0.95" />
        <stop offset="0.4" stop-color="#ff8a1f" stop-opacity="0.45" />
        <stop offset="1" stop-color="#ff6a00" stop-opacity="0" />
      </radialGradient>
    </defs>
  );
}

export interface HouseShape extends Box {
  id: number;
  roof: string;
  chimney: { x: number; y: number };
  deliveredBy?: string | null;
}

/** A wrapped present, centred on (0, 0), `s` across. */
export function Gift({ s, color, ribbon = "#ffd23f" }: { s: number; color: string; ribbon?: string }) {
  const h = s / 2;
  return (
    <g>
      <rect x={-h} y={-h} width={s} height={s} rx={s * 0.12} fill={color} stroke="rgba(0,0,0,0.45)" stroke-width="0.8" />
      <rect x={-h} y={-h} width={s} height={h * 0.8} rx={s * 0.12} fill="#fff" opacity="0.18" />
      <rect x={-s * 0.1} y={-h} width={s * 0.2} height={s} fill={ribbon} />
      <rect x={-h} y={-s * 0.1} width={s} height={s * 0.2} fill={ribbon} />
      <ellipse cx={-s * 0.18} cy={-s * 0.02} rx={s * 0.2} ry={s * 0.12} transform={`rotate(-30 ${f1(-s * 0.18)} ${f1(-s * 0.02)})`} fill="none" stroke={ribbon} stroke-width={s * 0.09} />
      <ellipse cx={s * 0.18} cy={-s * 0.02} rx={s * 0.2} ry={s * 0.12} transform={`rotate(30 ${f1(s * 0.18)} ${f1(-s * 0.02)})`} fill="none" stroke={ribbon} stroke-width={s * 0.09} />
    </g>
  );
}

/**
 * A house from above, drawn at its footprint: a snowy hip roof in its roof colour, window light
 * spilling onto the snow round it and a chimney. Still waiting: the chimney glows and a present
 * bobs over it. Delivered (`color` = the deliverer's): string lights round the eaves, a wreath
 * by the door and a present in the deliverer's colour on the roof.
 */
export function House({ house, color }: { house: HouseShape; color?: string | null }) {
  const { x, y, w, h, roof, chimney: ch } = house;
  const done = !!color;
  const lit = shade(roof, 0.18);
  const dark = shade(roof, -0.35);
  const mid = shade(roof, -0.1);
  // Hip roof: the ridge runs along the long side.
  const wide = w >= h;
  const inset = (wide ? h : w) / 2;
  const ridge = wide
    ? [
        [inset, h / 2],
        [w - inset, h / 2],
      ]
    : [
        [w / 2, inset],
        [w / 2, h - inset],
      ];
  const [r1, r2] = ridge as [[number, number], [number, number]];
  const faces: { pts: [number, number][]; fill: string; snow: string }[] = wide
    ? [
        { pts: [[0, 0], [w, 0], r2, r1], fill: lit, snow: "#f3f7ff" },
        { pts: [[w, 0], [w, h], r2], fill: mid, snow: "#dbe5f6" },
        { pts: [[w, h], [0, h], r1, r2], fill: dark, snow: "#b9c9e6" },
        { pts: [[0, h], [0, 0], r1], fill: mid, snow: "#e6eefb" },
      ]
    : [
        { pts: [[0, 0], [w, 0], r1], fill: lit, snow: "#f3f7ff" },
        { pts: [[w, 0], [w, h], r2, r1], fill: mid, snow: "#d4dff3" },
        { pts: [[w, h], [0, h], r2], fill: dark, snow: "#b9c9e6" },
        { pts: [[0, h], [0, 0], r1, r2], fill: lit, snow: "#eef4ff" },
      ];
  // Snow covers each face from the ridge down, leaving the eaves showing.
  const ridgeSet = new Set([`${r1[0]},${r1[1]}`, `${r2[0]},${r2[1]}`]);
  const toward = (p: [number, number], k: number): [number, number] => {
    // Eave corners slide towards the nearer ridge end.
    const t = Math.hypot(p[0] - r1[0], p[1] - r1[1]) < Math.hypot(p[0] - r2[0], p[1] - r2[1]) ? r1 : r2;
    return [p[0] + (t[0] - p[0]) * k, p[1] + (t[1] - p[1]) * k];
  };
  const poly = (pts: [number, number][]) => pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(" ");
  const snowK = 0.4 + ((house.id * 7) % 5) * 0.04;

  // Light from the windows, spilling out on every side.
  const spills: [number, number, number, number][] = [];
  for (const k of [0.28, 0.72]) {
    spills.push([w * k, h + 3, 13, 7], [w * k, -3, 11, 6]);
    spills.push([w + 3, h * k, 7, 12], [-3, h * k, 6, 11]);
  }

  // Lights round the eaves.
  const bulbs: { x: number; y: number; c: string; k: number }[] = [];
  if (done) {
    const per = 2 * (w + h);
    const n = Math.round(per / 9);
    for (let i = 0; i < n; i++) {
      let d = (i / n) * per;
      let bx: number;
      let by: number;
      if (d < w) [bx, by] = [d, 1.5];
      else if ((d -= w) < h) [bx, by] = [w - 1.5, d];
      else if ((d -= h) < w) [bx, by] = [w - d, h - 1.5];
      else [bx, by] = [1.5, h - (d - w)];
      bulbs.push({ x: bx, y: by, c: LIGHTS[i % LIGHTS.length]!, k: i % 2 });
    }
  }
  const giftColor = GIFTS[house.id % GIFTS.length]!;

  return (
    <g class={`sleigh-house ${done ? "is-done" : "is-waiting"}`} transform={`translate(${x} ${y})`}>
      {spills.map(([sx, sy, rx, ry], i) => (
        <ellipse key={i} cx={f1(sx)} cy={f1(sy)} rx={rx * (done ? 1.7 : 1)} ry={ry * (done ? 1.7 : 1)} fill="url(#sl-window)" opacity={done ? 1 : 0.65} />
      ))}
      <rect x="5" y="7" width={w} height={h} rx="2" fill="rgba(5,10,30,0.5)" />
      {faces.map((f, i) => (
        <polygon key={`f${i}`} points={poly(f.pts)} fill={f.fill} />
      ))}
      {/* Shingle lines along the eaves. */}
      <rect x="2.5" y="2.5" width={w - 5} height={h - 5} fill="none" stroke={dark} stroke-width="1" opacity="0.6" />
      <path d={`M0 0L${r1[0]} ${r1[1]}L0 ${h}M${w} 0L${r2[0]} ${r2[1]}L${w} ${h}`} stroke={dark} stroke-width="1.4" fill="none" />
      {faces.map((f, i) => (
        <polygon key={`s${i}`} points={poly(f.pts.map((p) => (ridgeSet.has(`${p[0]},${p[1]}`) ? p : toward(p, snowK))))} fill={f.snow} />
      ))}
      {/* Hips and ridge. */}
      <path d={`M${r1[0]} ${r1[1]}L${r2[0]} ${r2[1]}`} stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" />
      <path d={`M${r1[0]} ${r1[1]}L${r2[0]} ${r2[1]}`} stroke="rgba(60,80,120,0.45)" stroke-width="0.9" stroke-linecap="round" transform="translate(0.8 1)" />
      <rect x="0" y="0" width={w} height={h} fill="none" stroke="rgba(10,15,30,0.55)" stroke-width="1.2" />

      {/* Chimney. */}
      <g transform={`translate(${ch.x} ${ch.y})`}>
        {!done && <circle class="sleigh-chimney-glow" r="24" fill="url(#sl-chimney)" />}
        <rect x="-5" y="-3" width="13" height="13" fill="rgba(0,0,0,0.35)" />
        <rect x="-7" y="-7" width="14" height="14" rx="1" fill="#8a4434" stroke="#4a2018" stroke-width="1" />
        <path d="M-7 -2.5H7M-7 2.5H7M-2 -7V-2.5M3 -2.5V2.5M-2 2.5V7" stroke="#5e2b20" stroke-width="0.7" />
        <rect x="-7.5" y="-7.5" width="15" height="4" rx="1.5" fill="#f2f6ff" />
        <rect x="-3.5" y="-3.5" width="7" height="7" fill={done ? "#1a0e0a" : "#ff9b2f"} />
        {!done && <rect x="-2" y="-2" width="4" height="4" fill="#ffe08a" />}
        <g class="sleigh-smoke">
          <circle cx="-4" cy="-10" r="4" fill="#cfd8ea" opacity="0.5" />
          <circle cx="-9" cy="-17" r="5.5" fill="#cfd8ea" opacity="0.32" />
          <circle cx="-15" cy="-25" r="7" fill="#cfd8ea" opacity="0.18" />
        </g>
      </g>

      {done ? (
        <>
          <g class="sleigh-bulbs">
            {bulbs.map((b, i) => (
              <g key={i} class={b.k ? "tw-a" : "tw-b"}>
                <circle cx={f1(b.x)} cy={f1(b.y)} r="3.6" fill={b.c} opacity="0.35" />
                <circle cx={f1(b.x)} cy={f1(b.y)} r="1.7" fill={b.c} />
              </g>
            ))}
          </g>
          {/* Wreath by the front door. */}
          <g transform={`translate(${f1(w / 2)} ${h + 6})`}>
            <circle r="6.5" fill="none" stroke="#1f6b3a" stroke-width="4.5" />
            <circle r="6.5" fill="none" stroke="#3fa35f" stroke-width="2" stroke-dasharray="2 2.6" />
            <circle cx="-3.5" cy="-4.5" r="1.3" fill="#ff4d5e" />
            <circle cx="4.5" cy="-3" r="1.3" fill="#ff4d5e" />
            <path d="M0 5.5l-4 3.8l0.8 -5.8zM0 5.5l4 3.8l-0.8 -5.8z" fill="#e63946" />
          </g>
          {/* The present, in the deliverer's colour, on the roof beside the chimney. */}
          <g transform={`translate(${f1(ch.x + (ch.x < w / 2 ? 16 : -16))} ${f1(ch.y + (ch.y < h / 2 ? 12 : -12))}) rotate(${(house.id * 23) % 40 - 20})`}>
            <rect x="-6" y="-5" width="14" height="14" fill="rgba(0,0,0,0.35)" />
            <Gift s={14} color={color!} ribbon="#fff" />
          </g>
        </>
      ) : (
        <g transform={`translate(${ch.x} ${ch.y})`}>
          <circle class="sleigh-gift-ring" r="20" fill="none" stroke="#ffd23f" stroke-width="2.5" stroke-dasharray="5 4" />
          <ellipse class="sleigh-gift-shadow" cx="3" cy="4" rx="10" ry="5" fill="rgba(0,0,0,0.4)" />
          <g class="sleigh-gift-bob">
            <Gift s={24} color={giftColor} />
          </g>
        </g>
      )}
    </g>
  );
}

// ---------- the sleigh ----------

/** A reindeer from above, nose along +x, at (x, y). */
function Reindeer({ x, y, rudolph, phase }: { x: number; y: number; rudolph?: boolean; phase: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="1.5" cy="2.5" rx="9" ry="4" fill="rgba(0,0,0,0.3)" />
      {/* Legs, galloping in two diagonal pairs. */}
      <g class={`sleigh-legs ${phase ? "b" : "a"}`} stroke="#4a2c12" stroke-width="1.6" stroke-linecap="round">
        <path d="M4.5 -2.5l2.5 -2.8M-4.5 2.5l-2.5 2.8" />
      </g>
      <g class={`sleigh-legs ${phase ? "a" : "b"}`} stroke="#4a2c12" stroke-width="1.6" stroke-linecap="round">
        <path d="M4.5 2.5l2.5 2.8M-4.5 -2.5l-2.5 -2.8" />
      </g>
      <ellipse rx="7.8" ry="3.9" fill="#8b5a2b" />
      <ellipse cx="0.5" cy="-1" rx="5.4" ry="1.5" fill="#a8743f" />
      <circle cx="-7.6" cy="0" r="1.6" fill="#f4ead8" />
      {/* Collar with a bell. */}
      <path d="M5.2 -3.1Q6.4 0 5.2 3.1" stroke="#c0392b" stroke-width="1.4" fill="none" />
      <circle cx="6" cy="2.6" r="1" fill="#f2c14e" />
      {/* Head, antlers and nose. */}
      <path d="M8 -1.5L5.2 -5.4L2.6 -6.1M5.9 -4.4L6.9 -7.1M8 1.5L5.2 5.4L2.6 6.1M5.9 4.4L6.9 7.1" stroke="#dcc49a" stroke-width="0.9" stroke-linecap="round" fill="none" />
      <ellipse cx="8.9" cy="0" rx="3.4" ry="2.3" fill="#7a4c22" />
      <ellipse cx="7.4" cy="-2.3" rx="1.3" ry="0.7" fill="#6a3f1a" />
      <ellipse cx="7.4" cy="2.3" rx="1.3" ry="0.7" fill="#6a3f1a" />
      {rudolph ? (
        <>
          <circle class="sleigh-nose-glow" cx="12.4" cy="0" r="9" fill="url(#sl-nose)" />
          <circle cx="12.3" cy="0" r="2" fill="#ff2a2a" stroke="#ffb3b3" stroke-width="0.5" />
        </>
      ) : (
        <circle cx="12" cy="0" r="1.3" fill="#2a1a0e" />
      )}
    </g>
  );
}

/**
 * Santa's sleigh and team from above, SLEIGH_L long and SLEIGH_W wide, centred on (0, 0) and
 * flying along +x: the sleigh at the back (painted `color`), two pairs of reindeer and Rudolph
 * leading. `wheel` (−1…1) swings the team into the turn; `flying` adds a trail of magic dust.
 */
export function SleighTeam({ color, wheel = 0, flying = false }: { color: string; wheel?: number; flying?: boolean }) {
  const L2 = SLEIGH_L / 2;
  const W2 = SLEIGH_W / 2;
  const lean = Math.max(-1, Math.min(1, wheel)) * 10;
  const front = -L2 + 27; // front of the sleigh, where the harness starts
  return (
    <g class="sleigh-team">
      <defs>
        <radialGradient id="sl-nose">
          <stop offset="0" stop-color="#ff5a5a" stop-opacity="0.9" />
          <stop offset="1" stop-color="#ff2020" stop-opacity="0" />
        </radialGradient>
      </defs>
      {flying && (
        <g class="sleigh-dust">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <circle key={i} cx={-L2 - 4 - i * 6} cy={(i % 2 ? 1 : -1) * (2 + i * 0.8)} r={2.2 - i * 0.28} fill={i % 2 ? "#fff6c2" : "#ffd23f"} opacity={1 - i * 0.14} />
          ))}
        </g>
      )}
      {/* The team swings into the turn round the front of the sleigh. */}
      <g transform={`rotate(${f1(lean)} ${front} 0)`}>
        {/* Harness: traces from the sleigh through each pair to Rudolph. */}
        <g stroke="#5a3418" stroke-width="1.1" fill="none">
          <path d={`M${front} -4L-1 -7L16 -7L28 -1.5M${front} 4L-1 7L16 7L28 1.5`} />
          <path d={`M${front} 0H32`} stroke-dasharray="2 3" stroke="#f2c14e" stroke-width="1" />
        </g>
        <Reindeer x={-4} y={-7} phase={0} />
        <Reindeer x={-4} y={7} phase={1} />
        <Reindeer x={14} y={-7} phase={1} />
        <Reindeer x={14} y={7} phase={0} />
        <Reindeer x={29} y={0} rudolph phase={0} />
      </g>
      {/* Reins from Santa's mittens. */}
      <path d={`M-19 -4.5L${front} -4M-19 4.5L${front} 4`} stroke="#3a2412" stroke-width="0.8" />
      {/* The sleigh: shadow, runners curling up at the front, body and gold trim. */}
      <rect x={-L2 + 2} y={-W2 + 5} width="30" height={SLEIGH_W - 6} rx="7" fill="rgba(0,0,0,0.35)" />
      <g fill="none" stroke-linecap="round">
        <path d={`M${-L2} -12.5H${front - 4}Q${front + 1} -12.5 ${front + 0.5} -8.5Q${front} -6.5 ${front - 2} -7.5`} stroke="#5a4210" stroke-width="3.4" />
        <path d={`M${-L2} 12.5H${front - 4}Q${front + 1} 12.5 ${front + 0.5} 8.5Q${front} 6.5 ${front - 2} 7.5`} stroke="#5a4210" stroke-width="3.4" />
        <path d={`M${-L2} -12.5H${front - 4}Q${front + 1} -12.5 ${front + 0.5} -8.5Q${front} -6.5 ${front - 2} -7.5`} stroke="#f2c14e" stroke-width="1.8" />
        <path d={`M${-L2} 12.5H${front - 4}Q${front + 1} 12.5 ${front + 0.5} 8.5Q${front} 6.5 ${front - 2} 7.5`} stroke="#f2c14e" stroke-width="1.8" />
      </g>
      <path d={`M${-L2 + 2} -10.5H${front - 7}Q${front - 1} -10.5 ${front - 1} -5V5Q${front - 1} 10.5 ${front - 7} 10.5H${-L2 + 2}Q${-L2 - 1} 10.5 ${-L2 - 1} 7.5V-7.5Q${-L2 - 1} -10.5 ${-L2 + 2} -10.5Z`} fill={color} stroke="#f2c14e" stroke-width="1.6" />
      <path d={`M${-L2 + 2} -10.5H${front - 7}Q${front - 1} -10.5 ${front - 1} -5V0H${-L2 - 1}V-7.5Q${-L2 - 1} -10.5 ${-L2 + 2} -10.5Z`} fill="#fff" opacity="0.2" />
      <path d={`M${-L2 + 2} 10.5H${front - 7}Q${front - 1} 10.5 ${front - 1} 5V0H${-L2 - 1}V7.5Q${-L2 - 1} 10.5 ${-L2 + 2} 10.5Z`} fill="#000" opacity="0.15" />
      {/* Gold scrolls on the sides. */}
      <path d={`M${-L2 + 6} -10.5q3 2.5 6 0q3 2.5 6 0M${-L2 + 6} 10.5q3 -2.5 6 0q3 -2.5 6 0`} stroke="#ffe08a" stroke-width="0.9" fill="none" />
      {/* Sack of presents at the back. */}
      <ellipse cx={-L2 + 6} cy="0" rx="6" ry="7.5" fill="#9c2f2f" stroke="#5c1515" stroke-width="0.8" />
      <rect x={-L2 + 2.5} y="-4.5" width="4" height="4" fill="#3ddc6a" stroke="#1a5c2e" stroke-width="0.5" />
      <rect x={-L2 + 5.5} y="1" width="4" height="4" fill="#4db8ff" stroke="#14507a" stroke-width="0.5" />
      <rect x={-L2 + 2} y="2" width="3" height="3" fill="#ffd23f" stroke="#7a5f10" stroke-width="0.5" />
      {/* Santa from above: red coat with white trim, beard poking forward, hat with its bobble flopping back. */}
      <ellipse cx="-22.5" cy="0" rx="6.6" ry="8.4" fill="#c81f2a" stroke="#7a0f16" stroke-width="0.7" />
      <ellipse cx="-23.5" cy="-2.5" rx="4" ry="4" fill="#e0353f" opacity="0.7" />
      <path d="M-18.2 -6.6Q-15.6 0 -18.2 6.6" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" />
      <path d="M-19.5 -5.6L-15.8 -4.4M-19.5 5.6L-15.8 4.4" stroke="#c81f2a" stroke-width="2.8" stroke-linecap="round" />
      <circle cx="-15.4" cy="-4.3" r="1.4" fill="#1b1b1b" />
      <circle cx="-15.4" cy="4.3" r="1.4" fill="#1b1b1b" />
      <ellipse cx="-17.4" cy="0" rx="2.6" ry="3.3" fill="#fafafa" />
      <circle cx="-21.2" cy="0" r="3.6" fill="#e8343e" />
      <path d="M-19.2 -2.9A3.6 3.6 0 0 1 -19.2 2.9" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" />
      <path d="M-22.5 -0.5Q-25.5 0.2 -27.5 2" stroke="#e8343e" stroke-width="2.6" stroke-linecap="round" fill="none" />
      <circle cx="-28" cy="2.2" r="1.9" fill="#fff" />
    </g>
  );
}

// ---------- extras ----------

/** Two crossed candy canes tied with a bow and holly, for the "get ready" screen. */
export function CandyCanes({ class: cls }: { class?: string }) {
  const cane = (
    <>
      <path d="M0 190V40A30 30 0 0 1 60 40V58" fill="none" stroke="#8a1010" stroke-width="22" stroke-linecap="round" transform="translate(2 3)" opacity="0.35" />
      <path d="M0 190V40A30 30 0 0 1 60 40V58" fill="none" stroke="#fdfdfd" stroke-width="20" stroke-linecap="round" />
      <path d="M0 190V40A30 30 0 0 1 60 40V58" fill="none" stroke="#e01b2f" stroke-width="20" stroke-dasharray="11 13" />
      <path d="M-5 186V40A35 35 0 0 1 30 5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.55" />
    </>
  );
  return (
    <svg class={`sleigh-canes ${cls ?? ""}`} viewBox="-40 -30 320 260" aria-hidden="true">
      <g transform="translate(168 18) rotate(30)">{cane}</g>
      <g transform="translate(72 18) scale(-1 1) rotate(30)">{cane}</g>
      {/* Holly and a bow where they cross. */}
      <g transform="translate(120 122)">
        <path d="M0 0c-18 -12 -40 -10 -46 4c10 -2 18 2 22 10c6 -6 14 -10 24 -14z" fill="#1f7a3e" stroke="#0f4a24" stroke-width="1.5" />
        <path d="M0 0c18 -12 40 -10 46 4c-10 -2 -18 2 -22 10c-6 -6 -14 -10 -24 -14z" fill="#258a47" stroke="#0f4a24" stroke-width="1.5" />
        <path d="M0 0c-14 -6 -26 -20 -20 -28c8 -2 16 10 20 28zM0 0c14 -6 26 -20 20 -28c-8 -2 -16 10 -20 28z" fill="#e63946" stroke="#8a1010" stroke-width="1.5" />
        <path d="M0 0l-14 30l8 -2l4 8zM0 0l14 30l-8 -2l-4 8z" fill="#c81d2c" stroke="#8a1010" stroke-width="1.5" />
        <circle r="7" fill="#e63946" stroke="#8a1010" stroke-width="1.5" />
        <circle cx="-6" cy="-14" r="5" fill="#d0021b" />
        <circle cx="5" cy="-15" r="5" fill="#d0021b" />
        <circle cx="0" cy="-22" r="5" fill="#ff2a3f" />
      </g>
    </svg>
  );
}

/** Falling snow over the scene: three repeating layers of flakes drifting down at different speeds. */
export function Snowfall({ class: cls }: { class?: string }) {
  return (
    <div class={`sleigh-snowfall ${cls ?? ""}`} aria-hidden="true">
      <i class="s1" />
      <i class="s2" />
      <i class="s3" />
    </div>
  );
}
