/** Christmas picture symbols shared by the Sled Squad server and phones. */
export const GLYPH_FAMILIES = {
  tree: ["star-baubles", "bow-baubles", "star-garland", "bells", "snow", "star-bow"],
  gift: ["square", "tall", "holly", "round", "dots", "heart"],
  stocking: ["right", "left", "star", "dots", "stripes", "tree"],
  wreath: ["bottom-bow", "top-bow", "bells", "star", "candy-canes", "snowflake"],
} as const;

export type GlyphFamily = keyof typeof GLYPH_FAMILIES;
export type Glyph = { [F in GlyphFamily]: { family: F; design: (typeof GLYPH_FAMILIES)[F][number] } }[GlyphFamily];

export const CHRISTMAS_GLYPHS: readonly Glyph[] = (Object.keys(GLYPH_FAMILIES) as GlyphFamily[])
  .flatMap((family) => GLYPH_FAMILIES[family].map((design) => ({ family, design }) as Glyph));

export function glyphId(g: Glyph): string {
  return `christmas:${g.family}:${g.design}`;
}

/** Only catalogued pictures can be sent to or rendered by a phone. */
export function parseGlyph(id: string): Glyph | null {
  return CHRISTMAS_GLYPHS.find((g) => glyphId(g) === id) ?? null;
}

/** All five family members are look-alikes, with visible decoration/shape changes. */
export function variantsOf(g: Glyph): Glyph[] {
  return CHRISTMAS_GLYPHS.filter((other) => other.family === g.family && other.design !== g.design);
}
