import { describe, expect, test } from "bun:test";
import { GLYPH_SHAPES, glyphId, parseGlyph, partsDiffering, randomGlyph, variantOf } from "../src/shared/glyphs.ts";

/** Small deterministic PRNG (mulberry32). */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("glyphs", () => {
  test("ids round-trip through parseGlyph", () => {
    const rng = seeded(1);
    for (let i = 0; i < 500; i++) {
      const g = randomGlyph(rng);
      expect(parseGlyph(glyphId(g))).toEqual(g);
    }
  });

  test("malformed or made-up ids are rejected", () => {
    for (const bad of [
      "",
      "octopus:red",
      "g:",
      "g:blob.c.l.0",
      "g:ring.nowhere.l.0",
      "g:ring.c.xl.0",
      "g:ring.c.l.90", // ring only has one rotation
      "g:tri.c.l.45",
      "g:disc.c.l.0|disc.c.l.0|disc.c.l.0|disc.c.l.0",
    ]) {
      expect(parseGlyph(bad)).toBeNull();
    }
  });

  test("rotations are limited by symmetry, so two ids never draw the same", () => {
    expect(GLYPH_SHAPES.disc.rots).toEqual([0]);
    expect(GLYPH_SHAPES.plus.rots).toEqual([0]);
    for (const { rots } of Object.values(GLYPH_SHAPES)) {
      expect(new Set(rots).size).toBe(rots.length);
      for (const r of rots) expect(r >= 0 && r < 360).toBe(true);
    }
  });

  test("random glyphs are valid and varied", () => {
    const rng = seeded(7);
    const ids = new Set<string>();
    const shapes = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const g = randomGlyph(rng);
      expect(g.length).toBeGreaterThanOrEqual(2);
      expect(g.length).toBeLessThanOrEqual(3);
      expect(parseGlyph(glyphId(g))).not.toBeNull();
      ids.add(glyphId(g));
      for (const p of g) shapes.add(p.shape);
    }
    expect(ids.size).toBeGreaterThan(2500);
    expect(shapes.size).toBe(Object.keys(GLYPH_SHAPES).length);
  });

  test("variantOf changes exactly one part and stays valid", () => {
    const rng = seeded(42);
    for (let i = 0; i < 2000; i++) {
      const g = randomGlyph(rng);
      const v = variantOf(g, rng);
      expect(partsDiffering(g, v)).toBe(1);
      const parsed = parseGlyph(glyphId(v))!;
      // Small parts are never changed by rotation alone (too subtle to see).
      const i = g.findIndex((p, j) => glyphId([p]) !== glyphId([v[j]!]));
      if (g[i]!.size === "s" || g[i]!.size === "n") expect(g[i]!.shape !== v[i]!.shape || g[i]!.slot !== v[i]!.slot).toBe(true);
      expect(parsed).not.toBeNull();
      // A nested layout keeps its outer part hollow so the inner part stays visible.
      if (v[1]?.size === "n") expect(GLYPH_SHAPES[v[0]!.shape].hollow).toBe(true);
    }
  });
});
