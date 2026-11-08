/** The abstract symbols of the Sled Squad trail challenge (the dive), drawn from their glyph ids. */
import { GLYPH_SIZES, GLYPH_SLOTS, parseGlyph, type GlyphShape } from "../../shared/glyphs.ts";

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
