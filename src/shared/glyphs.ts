/**
 * Abstract symbols for Submarine Squad's diving mode.
 *
 * A glyph is 2–3 abstract parts (wave, crescent, zigzag, ring…) arranged on a
 * 100×100 tile in one of a few layouts. They're drawn in a single color and
 * deliberately don't look like everyday objects, so instructors have to
 * describe them ("a big ring with a small zigzag inside, tipped on its side").
 *
 * The id *is* the composition — e.g. "g:ring.c.l.0|zig.c.n.90" — so server and
 * phones share it without any lookup table, and there are tens of thousands of
 * possible symbols.
 */

/** Allowed rotations per shape, reduced by symmetry so no two ids look the same. */
export const GLYPH_SHAPES = {
  disc: { rots: [0], hollow: false },
  ring: { rots: [0], hollow: true },
  tri: { rots: [0, 90, 180, 270], hollow: false },
  triO: { rots: [0, 90, 180, 270], hollow: false },
  sq: { rots: [0], hollow: false },
  sqO: { rots: [0], hollow: true },
  dia: { rots: [0], hollow: false },
  hexO: { rots: [0, 90], hollow: true },
  plus: { rots: [0], hollow: false },
  ex: { rots: [0], hollow: false },
  bar: { rots: [0, 90], hollow: false },
  bars: { rots: [0, 90], hollow: false },
  arc: { rots: [0, 90, 180, 270], hollow: false },
  wave: { rots: [0, 90], hollow: false },
  zig: { rots: [0, 90], hollow: false },
  chev: { rots: [0, 90, 180, 270], hollow: false },
  cres: { rots: [0, 90, 180, 270], hollow: false },
  star: { rots: [0, 180], hollow: false },
  dots: { rots: [0, 90], hollow: false },
  drop: { rots: [0, 90, 180, 270], hollow: false },
} as const;

export type GlyphShape = keyof typeof GLYPH_SHAPES;
const SHAPES = Object.keys(GLYPH_SHAPES) as GlyphShape[];
const HOLLOW = SHAPES.filter((s) => GLYPH_SHAPES[s].hollow);

/** Part centers on the 100×100 tile. */
export const GLYPH_SLOTS = {
  c: [50, 50],
  tl: [16, 16],
  tr: [84, 16],
  bl: [16, 84],
  br: [84, 84],
  l: [27, 50],
  r: [73, 50],
  t: [50, 27],
  b: [50, 73],
  dtl: [30, 30],
  dbr: [70, 70],
  dtr: [70, 30],
  dbl: [30, 70],
  tt: [50, 27],
  lb: [26, 75],
  rb: [74, 75],
} as const satisfies Record<string, readonly [number, number]>;
export type GlyphSlot = keyof typeof GLYPH_SLOTS;

/** Part sizes (diameter on the tile). "n" is the small part nested inside a hollow one. */
export const GLYPH_SIZES = { s: 22, m: 38, l: 60, n: 24 } as const;
export type GlyphSize = keyof typeof GLYPH_SIZES;

export interface GlyphPart {
  shape: GlyphShape;
  slot: GlyphSlot;
  size: GlyphSize;
  rot: number;
}

export type Glyph = GlyphPart[];

/** Arrangements that keep parts from colliding. `hollow` = that part must be an outline (something sits inside it). */
const LAYOUTS: { slot: GlyphSlot; size: GlyphSize; hollow?: boolean }[][] = [
  [{ slot: "c", size: "l" }, { slot: "tl", size: "s" }],
  [{ slot: "c", size: "l" }, { slot: "tr", size: "s" }],
  [{ slot: "c", size: "l" }, { slot: "bl", size: "s" }],
  [{ slot: "c", size: "l" }, { slot: "br", size: "s" }],
  [{ slot: "l", size: "m" }, { slot: "r", size: "m" }],
  [{ slot: "t", size: "m" }, { slot: "b", size: "m" }],
  [{ slot: "dtl", size: "m" }, { slot: "dbr", size: "m" }],
  [{ slot: "dtr", size: "m" }, { slot: "dbl", size: "m" }],
  [{ slot: "c", size: "l", hollow: true }, { slot: "c", size: "n" }],
  [{ slot: "tt", size: "m" }, { slot: "lb", size: "s" }, { slot: "rb", size: "s" }],
];
const CORNERS: GlyphSlot[] = ["tl", "tr", "bl", "br"];

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;

function randomPart(slot: GlyphSlot, size: GlyphSize, hollow: boolean, rng: () => number): GlyphPart {
  const shape = pick(hollow ? HOLLOW : SHAPES, rng);
  return { shape, slot, size, rot: pick(GLYPH_SHAPES[shape].rots, rng) };
}

export function randomGlyph(rng: () => number = Math.random): Glyph {
  return pick(LAYOUTS, rng).map((p) => randomPart(p.slot, p.size, !!p.hollow, rng));
}

export function glyphId(g: Glyph): string {
  return "g:" + g.map((p) => `${p.shape}.${p.slot}.${p.size}.${p.rot}`).join("|");
}

/** Parse and validate an id; null if it isn't a well-formed glyph. */
export function parseGlyph(id: string): Glyph | null {
  if (typeof id !== "string" || !id.startsWith("g:")) return null;
  const parts = id.slice(2).split("|");
  if (parts.length < 1 || parts.length > 3) return null;
  const out: Glyph = [];
  for (const raw of parts) {
    const [shape, slot, size, rot] = raw.split(".");
    if (!(shape! in GLYPH_SHAPES) || !(slot! in GLYPH_SLOTS) || !(size! in GLYPH_SIZES)) return null;
    const r = Number(rot);
    if (!(GLYPH_SHAPES[shape as GlyphShape].rots as readonly number[]).includes(r)) return null;
    out.push({ shape: shape as GlyphShape, slot: slot as GlyphSlot, size: size as GlyphSize, rot: r });
  }
  return out;
}

/**
 * A look-alike: the same glyph with exactly one part changed — a different
 * shape, a different rotation (medium/large parts only), or (for a corner
 * part) a different corner.
 */
export function variantOf(g: Glyph, rng: () => number = Math.random): Glyph {
  const original = glyphId(g);
  for (let attempt = 0; attempt < 50; attempt++) {
    const i = Math.floor(rng() * g.length) % g.length;
    const part = g[i]!;
    const mustBeHollow = g.length === 2 && g[1]!.size === "n" && i === 0;
    const next = { ...part };
    const kind = rng();
    // A turned small part is too subtle to spot on a phone, so small parts only swap shape or corner.
    const canTurn = GLYPH_SHAPES[part.shape].rots.length > 1 && (part.size === "m" || part.size === "l");
    if (kind < 0.5 || (!canTurn && !CORNERS.includes(part.slot))) {
      next.shape = pick((mustBeHollow ? HOLLOW : SHAPES).filter((s) => s !== part.shape), rng);
      next.rot = pick(GLYPH_SHAPES[next.shape].rots, rng);
    } else if (canTurn && (kind < 0.8 || !CORNERS.includes(part.slot))) {
      next.rot = pick(GLYPH_SHAPES[part.shape].rots, rng);
    } else {
      next.slot = pick(CORNERS, rng);
    }
    const v = g.map((p, j) => (j === i ? next : p));
    if (glyphId(v) !== original) return v;
  }
  // Fallback: swap the first part for a different shape (always possible).
  const first = g[0]!;
  const options = (g[1]?.size === "n" ? HOLLOW : SHAPES).filter((s) => s !== first.shape);
  const shape = pick(options, rng);
  return [{ ...first, shape, rot: GLYPH_SHAPES[shape].rots[0]! }, ...g.slice(1)];
}

/** How many parts differ between two glyphs of the same layout (Infinity if the layouts differ). */
export function partsDiffering(a: Glyph, b: Glyph): number {
  if (a.length !== b.length) return Infinity;
  return a.reduce((n, p, i) => {
    const q = b[i]!;
    return n + (p.shape !== q.shape || p.slot !== q.slot || p.size !== q.size || p.rot !== q.rot ? 1 : 0);
  }, 0);
}
