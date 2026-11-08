import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { CHRISTMAS_GLYPHS, GLYPH_FAMILIES, glyphId, parseGlyph, variantsOf } from "../src/shared/glyphs.ts";

describe("Christmas dive pictures", () => {
  test("catalog has enough distinct targets for all four instructors", () => {
    const ids = CHRISTMAS_GLYPHS.map(glyphId);
    expect(ids).toHaveLength(24);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of CHRISTMAS_GLYPHS) expect(parseGlyph(glyphId(g))).toEqual(g);
  });

  test("malformed, legacy and unknown picture ids are rejected", () => {
    for (const bad of ["", "g:ring.c.l.0", "christmas:tree", "christmas:tree:unknown", "christmas:unknown:star", "christmas:tree:bells:extra", "christmas:__proto__:bells"])
      expect(parseGlyph(bad)).toBeNull();
  });

  test("every target has five distinct illustrated look-alikes", () => {
    for (const g of CHRISTMAS_GLYPHS) {
      const variants = variantsOf(g);
      expect(variants).toHaveLength(5);
      expect(new Set(variants.map(glyphId)).size).toBe(5);
      for (const v of variants) {
        expect(v.family).toBe(g.family);
        expect(v.design).not.toBe(g.design);
      }
    }
    expect(Object.keys(GLYPH_FAMILIES)).toHaveLength(4);
  });

  test("every catalog entry has an imported game asset", () => {
    const renderer = readFileSync(new URL("../src/client/shared/glyph-symbol.tsx", import.meta.url), "utf8");
    for (const g of CHRISTMAS_GLYPHS) {
      const path = `./winter/symbols/${g.family}-${g.design}.webp`;
      expect(renderer).toContain(`"${glyphId(g)}":`);
      expect(renderer).toContain(`from "${path}"`);
      expect(existsSync(new URL(`../src/client/shared/${path}`, import.meta.url))).toBe(true);
    }
  });
});
