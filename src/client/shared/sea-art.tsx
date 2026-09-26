/**
 * Submarine Squad art, drawn in SVG so it works offline and stays crisp:
 * the anglerfish, the submarine, ocean colors by depth, and the dive symbols.
 */
import { useId } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { GLYPH_SIZES, GLYPH_SLOTS, parseGlyph, type GlyphShape } from "../../shared/glyphs.ts";
import { ACCESSORY_ART, AVATAR_ART } from "./avatar-art.tsx";

// ---------- anglerfish ----------

/**
 * Anglerfish facing right (viewBox 0 0 300 220). `openness` 0…1 swings the
 * lower jaw open; `glow` 0…1 brightens the lure at the tip of its antenna.
 */
export function Anglerfish({ openness, glow = 0.6 }: { openness: number; glow?: number }) {
  const angle = 4 + Math.max(0, Math.min(1, openness)) * 38;
  // The mouth's inside is the wedge between the upper lip and the lower jaw at its current angle,
  // so nothing red shows outside the jaw however far it's open.
  const hinge = { x: 150, y: 118 };
  const rot = (x: number, y: number) => {
    const a = (angle * Math.PI) / 180;
    const dx = x - hinge.x;
    const dy = y - hinge.y;
    return { x: hinge.x + dx * Math.cos(a) - dy * Math.sin(a), y: hinge.y + dx * Math.sin(a) + dy * Math.cos(a) };
  };
  const jawTip = rot(282, 120);
  const jawMid = rot(220, 121);
  const mouth = `M${hinge.x},${hinge.y} L276,113 L${jawTip.x.toFixed(1)},${jawTip.y.toFixed(1)} L${jawMid.x.toFixed(1)},${jawMid.y.toFixed(1)} Z`;
  const tongueEnd = rot(236, 116);
  const upperTeeth = [172, 186, 200, 214, 228, 242, 256];
  const lowerTeeth = [178, 194, 210, 226, 242, 258];
  return (
    <svg class="anglerfish" viewBox="0 0 300 220" aria-hidden="true">
      <defs>
        <radialGradient id="lureGlow">
          <stop offset="0%" stop-color="#fffbd0" stop-opacity="1" />
          <stop offset="35%" stop-color="#f7ff8a" stop-opacity="0.75" />
          <stop offset="100%" stop-color="#b8ff5a" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="fishBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b2a52" />
          <stop offset="100%" stop-color="#1d1330" />
        </linearGradient>
      </defs>
      {/* tail + fins */}
      <path d="M40,105 L2,70 Q14,108 2,146 Z" fill="#2a1d3d" />
      <path d="M120,40 Q135,10 160,30 Q140,32 132,48 Z" fill="#2a1d3d" />
      <path d="M110,175 Q120,205 150,196 Q128,188 126,170 Z" fill="#2a1d3d" />
      {/* mouth interior, seen when the jaw drops */}
      <path d={mouth} fill="#5a0c1e" />
      <path d={`M158,${hinge.y + 4} Q200,${(hinge.y + tongueEnd.y) / 2 + 8} ${tongueEnd.x.toFixed(1)},${tongueEnd.y.toFixed(1)}`} stroke="#8a1a33" stroke-width="6" fill="none" stroke-linecap="round" />
      {/* body with the upper jaw */}
      <path d="M36,108 C34,44 104,22 168,30 C228,38 272,74 278,114 L150,118 C142,150 122,178 92,180 C56,182 38,152 36,108 Z" fill="url(#fishBody)" />
      <circle cx="96" cy="86" r="6" fill="#4d3a68" />
      <circle cx="120" cy="130" r="4" fill="#4d3a68" />
      <circle cx="74" cy="126" r="5" fill="#4d3a68" />
      {/* upper teeth */}
      {upperTeeth.map((x, i) => (
        <path key={x} d={`M${x - 5},${115} L${x},${115 + 16 + (i % 2) * 7} L${x + 5},${115} Z`} fill="#f4f1e6" stroke="#b9b2a0" stroke-width="1" />
      ))}
      {/* eye */}
      <circle cx="196" cy="74" r="13" fill="#f7f3e0" />
      <circle cx="199" cy="75" r="7" fill="#d7263d" />
      <circle cx="200" cy="74" r="3" fill="#120818" />
      <path d="M180,58 L212,64" stroke="#120818" stroke-width="5" stroke-linecap="round" />
      {/* antenna + lure */}
      <path d="M160,34 C170,0 228,-4 252,26" stroke="#3b2a52" stroke-width="5" fill="none" stroke-linecap="round" />
      <circle class="lure-glow" cx="254" cy="32" r={22 + glow * 18} fill="url(#lureGlow)" style={{ opacity: 0.45 + glow * 0.55 }} />
      <circle cx="254" cy="32" r="7" fill="#fffbc2" stroke="#e8f06a" stroke-width="2" />
      {/* lower jaw, hinged at the back of the mouth */}
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: "150px 118px" }}>
        <path d="M150,118 L282,120 Q284,146 262,156 L168,168 Q150,160 150,118 Z" fill="#3b2a52" />
        {lowerTeeth.map((x, i) => (
          <path key={x} d={`M${x - 5},${121} L${x},${121 - 15 - (i % 2) * 7} L${x + 5},${121} Z`} fill="#f4f1e6" stroke="#b9b2a0" stroke-width="1" />
        ))}
      </g>
    </svg>
  );
}

// ---------- submarine ----------

/** Someone looking out of a porthole; `key` restarts the peek animation. */
export interface PortholeFace {
  key: string;
  choice: AvatarChoice;
}

const PORTHOLES = [70, 118, 166];
/** Porthole glass radius, and the size of an avatar looking out of it. */
const GLASS_R = 11.5;
const FACE = 27;

/** Yellow submarine facing right (viewBox 0 0 240 130). `faces[i]` peeks out of porthole i. */
export function Submarine({ faces = [] }: { faces?: (PortholeFace | null)[] }) {
  const uid = useId();
  return (
    <svg class="submarine" viewBox="0 0 240 130" aria-hidden="true">
      {/* propeller */}
      <rect x="4" y="62" width="18" height="8" rx="3" fill="#8a8f9b" />
      <g class="prop" style={{ transformOrigin: "12px 66px" }}>
        <ellipse cx="12" cy="50" rx="5" ry="15" fill="#b7bcc8" />
        <ellipse cx="12" cy="82" rx="5" ry="15" fill="#b7bcc8" />
      </g>
      {/* hull */}
      <rect x="20" y="40" width="200" height="62" rx="31" fill="#ffc933" stroke="#c98a00" stroke-width="3" />
      <rect x="30" y="82" width="180" height="10" rx="5" fill="#e8ad10" />
      {/* tower + periscope */}
      <path d="M92,42 L98,16 L150,16 L156,42 Z" fill="#ffc933" stroke="#c98a00" stroke-width="3" />
      <path d="M136,16 L136,2 L156,2" stroke="#8a8f9b" stroke-width="5" fill="none" stroke-linecap="round" />
      <rect x="152" y="-2" width="10" height="9" rx="2" fill="#8a8f9b" />
      {/* portholes, sometimes with a player looking out */}
      {PORTHOLES.map((x, i) => {
        const face = faces[i];
        const clip = `port-${uid}-${i}`;
        const body = face ? (AVATAR_ART[face.choice.avatar] ?? AVATAR_ART.cat) : null;
        const extra = face ? (ACCESSORY_ART[face.choice.accessory] ?? ACCESSORY_ART.none) : null;
        return (
          <g key={x}>
            <clipPath id={clip}>
              <circle cx={x} cy="64" r={GLASS_R} />
            </clipPath>
            <circle cx={x} cy="64" r={GLASS_R + 4} fill="#c98a00" />
            <circle cx={x} cy="64" r={GLASS_R} fill="#8fd3ff" />
            {face && body && extra && (
              <g clip-path={`url(#${clip})`}>
                <g class="peek" key={face.key}>
                  <svg x={x - FACE / 2} y={64 - FACE * 0.56} width={FACE} height={FACE} viewBox="0 0 100 100">
                    {body()}
                    {extra()}
                  </svg>
                </g>
              </g>
            )}
            {/* glass: a light tint and a shine on top, so faces look like they're behind the window */}
            {face && <circle cx={x} cy="64" r={GLASS_R} fill="#8fd3ff" opacity="0.25" />}
            <path d={`M${x - 6},${57} q5,-3.5 10,0`} stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity={face ? 0.7 : 1} />
          </g>
        );
      })}
      {/* headlight */}
      <circle cx="216" cy="66" r="6" fill="#fffbd0" stroke="#c98a00" stroke-width="2" />
    </svg>
  );
}

// ---------- ocean ----------

/** Water color at a depth: bright blue at the surface, near-black deep down. */
export function oceanGradient(depth: number): string {
  const t = Math.max(0, Math.min(1, depth / 800));
  const mix = (a: number[], b: number[]) => a.map((v, i) => Math.round(v + (b[i]! - v) * t));
  const top = mix([38, 150, 214], [6, 14, 38]);
  const bottom = mix([10, 70, 140], [2, 4, 14]);
  return `linear-gradient(rgb(${top.join(",")}), rgb(${bottom.join(",")}))`;
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
