/**
 * Submarine Squad art, drawn in SVG so it works offline and stays crisp:
 * the anglerfish, the submarine, ocean colors by depth, and the dive symbols.
 */
import { useId } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { parseSymbol, SEA_COLORS, type SeaShape } from "../../shared/sea-symbols.ts";
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

const INK = "#1f1633";

function shapePaths(shape: SeaShape, fill: string) {
  const common = { fill, stroke: INK, "stroke-width": 3, "stroke-linejoin": "round" as const };
  switch (shape) {
    case "octopus":
      return (
        <>
          {[20, 36, 52, 68].map((x, i) => (
            <path key={x} d={`M${x + 6},58 q${i % 2 ? 6 : -6},16 0,30 q${i % 2 ? -8 : 8},4 4,0`} {...common} fill="none" stroke={fill} stroke-width="8" stroke-linecap="round" />
          ))}
          <ellipse cx="50" cy="40" rx="30" ry="27" {...common} />
          <circle cx="40" cy="40" r="5" fill="#fff" stroke={INK} stroke-width="2" />
          <circle cx="60" cy="40" r="5" fill="#fff" stroke={INK} stroke-width="2" />
          <circle cx="40" cy="41" r="2" fill={INK} />
          <circle cx="60" cy="41" r="2" fill={INK} />
        </>
      );
    case "anchor":
      return (
        <>
          <circle cx="50" cy="18" r="9" fill="none" stroke={INK} stroke-width="9" />
          <circle cx="50" cy="18" r="9" fill="none" stroke={fill} stroke-width="5" />
          <path d="M50,26 L50,82 M34,38 L66,38 M18,58 Q22,84 50,86 Q78,84 82,58 M18,58 l-6,8 M18,58 l9,4 M82,58 l6,8 M82,58 l-9,4" fill="none" stroke={INK} stroke-width="11" stroke-linecap="round" />
          <path d="M50,26 L50,82 M34,38 L66,38 M18,58 Q22,84 50,86 Q78,84 82,58 M18,58 l-6,8 M18,58 l9,4 M82,58 l6,8 M82,58 l-9,4" fill="none" stroke={fill} stroke-width="6" stroke-linecap="round" />
        </>
      );
    case "starfish": {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 17 : 42;
        const a = (Math.PI * 2 * i) / 10 - Math.PI / 2;
        return `${50 + r * Math.cos(a)},${53 + r * Math.sin(a)}`;
      }).join(" ");
      return (
        <>
          <polygon points={pts} {...common} />
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
            return <circle key={i} cx={50 + 24 * Math.cos(a)} cy={53 + 24 * Math.sin(a)} r="3" fill="#fff" opacity="0.7" />;
          })}
        </>
      );
    }
    case "shell":
      return (
        <>
          <path d="M50,88 L12,40 Q50,0 88,40 Z" {...common} />
          {[-28, -14, 0, 14, 28].map((dx) => (
            <path key={dx} d={`M50,86 Q${50 + dx * 0.6},40 ${50 + dx},14`} stroke={INK} stroke-width="2.5" fill="none" />
          ))}
          <rect x="40" y="82" width="20" height="10" rx="3" {...common} />
        </>
      );
    case "fish":
      return (
        <>
          <path d="M72,50 L94,30 L94,70 Z" {...common} />
          <ellipse cx="46" cy="50" rx="34" ry="22" {...common} />
          <path d="M40,30 Q50,18 62,30" {...common} />
          <circle cx="26" cy="46" r="5" fill="#fff" stroke={INK} stroke-width="2" />
          <circle cx="25" cy="46" r="2" fill={INK} />
        </>
      );
    case "crab":
      return (
        <>
          {[-1, 1].flatMap((s) =>
            [0, 1, 2].map((i) => <path key={`${s}${i}`} d={`M${50 + s * 20},${60 + i * 6} l${s * 20},${6 + i * 4}`} stroke={INK} stroke-width="5" stroke-linecap="round" />),
          )}
          <path d="M26,40 l-8,-16 M74,40 l8,-16" stroke={INK} stroke-width="5" stroke-linecap="round" />
          <circle cx="16" cy="20" r="11" {...common} />
          <circle cx="84" cy="20" r="11" {...common} />
          <path d="M10,14 l10,8 M90,14 l-10,8" stroke={INK} stroke-width="3" />
          <ellipse cx="50" cy="58" rx="30" ry="20" {...common} />
          <path d="M42,40 l0,-10 M58,40 l0,-10" stroke={INK} stroke-width="3" />
          <circle cx="42" cy="28" r="4" fill="#fff" stroke={INK} stroke-width="2" />
          <circle cx="58" cy="28" r="4" fill="#fff" stroke={INK} stroke-width="2" />
        </>
      );
    case "whale":
      return (
        <>
          <path d="M8,56 Q10,26 48,26 Q84,26 86,52 L94,40 L96,66 L84,60 Q76,80 44,80 Q10,80 8,56 Z" {...common} />
          <path d="M14,62 Q44,70 78,60" stroke={INK} stroke-width="2.5" fill="none" />
          <circle cx="26" cy="48" r="3.5" fill={INK} />
          <path d="M40,24 q-4,-12 -12,-14 M40,24 q4,-14 12,-14 M40,24 l0,-14" stroke="#7cc6ff" stroke-width="4" fill="none" stroke-linecap="round" />
        </>
      );
    case "jellyfish":
      return (
        <>
          {[28, 40, 52, 64, 76].map((x, i) => (
            <path key={x} d={`M${x},50 q${i % 2 ? 6 : -6},12 0,22 q${i % 2 ? -6 : 6},10 0,20`} stroke={fill} stroke-width="5" fill="none" stroke-linecap="round" />
          ))}
          <path d="M18,52 Q18,12 50,12 Q82,12 82,52 Q74,58 66,52 Q58,58 50,52 Q42,58 34,52 Q26,58 18,52 Z" {...common} />
          <circle cx="40" cy="34" r="4" fill="#fff" opacity="0.8" />
        </>
      );
  }
}

/** One dive symbol, e.g. "red-octopus", as an icon. */
export function SeaSymbol({ id }: { id: string }) {
  const s = parseSymbol(id);
  if (!s) return null;
  const fill = SEA_COLORS.find((c) => c.id === s.color)!.hex;
  return (
    <svg class="sea-symbol" viewBox="0 0 100 100" role="img" aria-label={id.replace("-", " ")}>
      {shapePaths(s.shape, fill)}
    </svg>
  );
}
