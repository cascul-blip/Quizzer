/**
 * Player avatars, drawn in SVG so they look the same on every phone and projector.
 *
 * Every character shares one layout (viewBox 0 0 100 100) so any accessory fits any character:
 *   head centered near (50,56), top of the head at y≈26, sides at x≈20/80, chin at y≈86;
 *   eyes at (40,52) and (60,52); mouth around y≈66.
 * Hats sit on the head top, glasses on the eye line, the bow tie under the chin.
 */
import type { JSX } from "preact";
import type { AccessoryId, AvatarChoice, AvatarId } from "../../shared/avatars.ts";

const INK = "#2b2238";
/** Outline for the main shapes, for a consistent sticker look. */
const ol = { stroke: INK, "stroke-width": 2, "stroke-linejoin": "round" } as const;

/** Draw a shape and its mirror image across x = 50. */
function both(make: () => JSX.Element) {
  return (
    <>
      {make()}
      <g transform="matrix(-1 0 0 1 100 0)">{make()}</g>
    </>
  );
}

// ---------- faces ----------

function Eyes({ y = 52, white = false, r = 4 }: { y?: number; white?: boolean; r?: number }) {
  return both(() => (
    <g>
      {white && <circle cx="40" cy={y} r={r + 2.5} fill="#fff" {...ol} />}
      <circle cx="40" cy={y} r={r} fill={INK} />
      <circle cx="41.4" cy={y - 1.4} r={r * 0.35} fill="#fff" />
    </g>
  ));
}

function Smile({ y = 67, w = 6 }: { y?: number; w?: number }) {
  return <path d={`M${50 - w},${y} Q50,${y + 6} ${50 + w},${y}`} stroke={INK} stroke-width="2.4" fill="none" stroke-linecap="round" />;
}

function Cheeks({ y = 64, color = "#ff7a9a" }: { y?: number; color?: string }) {
  return both(() => <circle cx="30" cy={y} r="4.5" fill={color} opacity="0.35" />);
}

function Whiskers({ y = 64 }: { y?: number }) {
  return both(() => (
    <path d={`M36,${y} L18,${y - 3} M36,${y + 3} L18,${y + 5}`} stroke={INK} stroke-width="1.4" stroke-linecap="round" opacity="0.6" />
  ));
}

function Head({ fill, r = 30 }: { fill: string; r?: number }) {
  return <circle cx="50" cy="56" r={r} fill={fill} {...ol} />;
}

function RoundEars({ fill, inner, r = 9, x = 27, y = 32 }: { fill: string; inner?: string; r?: number; x?: number; y?: number }) {
  return both(() => (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} {...ol} />
      {inner && <circle cx={x + 1} cy={y + 1} r={r * 0.55} fill={inner} />}
    </g>
  ));
}

function PointyEars({ fill, inner }: { fill: string; inner: string }) {
  return both(() => (
    <g>
      <path d="M23,44 L26,12 L47,31 Z" fill={fill} {...ol} />
      <path d="M27,36 L28.5,19 L40,30 Z" fill={inner} />
    </g>
  ));
}

function Kid({ skin, blush, hair }: { skin: string; blush: string; hair: string }) {
  return (
    <>
      {both(() => <ellipse cx="20" cy="58" rx="6" ry="8" fill={skin} {...ol} />)}
      <Head fill={skin} />
      <path d="M21,52 Q18,24 50,24 Q82,24 79,52 Q76,40 66,36 Q56,42 40,38 Q28,38 21,52 Z" fill={hair} {...ol} />
      {both(() => <path d="M35,44 Q40,41 45,44" stroke={INK} stroke-width="2" fill="none" stroke-linecap="round" />)}
      <Eyes />
      <path d="M50,56 Q48,61 51,62" stroke={INK} stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.5" />
      <Cheeks color={blush} />
      <Smile w={7} />
    </>
  );
}

// ---------- characters ----------

export const AVATAR_ART: Record<AvatarId, () => JSX.Element> = {
  cat: () => (
    <>
      <PointyEars fill="#f4a340" inner="#ffc2cf" />
      <Head fill="#f4a340" />
      <path d="M44,28 L46,38 M50,27 L50,38 M56,28 L54,38" stroke="#c9741a" stroke-width="3" stroke-linecap="round" />
      <ellipse cx="50" cy="67" rx="12" ry="8" fill="#fff4e4" />
      <Eyes />
      <path d="M46.5,61 L53.5,61 L50,65 Z" fill="#ff7a9a" />
      <Whiskers y={65} />
      <path d="M50,65 L50,68 M45,70 Q50,73 50,68 Q50,73 55,70" stroke={INK} stroke-width="1.8" fill="none" stroke-linecap="round" />
    </>
  ),
  dog: () => (
    <>
      <Head fill="#e0b27a" />
      {both(() => <ellipse cx="22" cy="50" rx="9" ry="19" transform="rotate(18 22 50)" fill="#8a5a32" {...ol} />)}
      <ellipse cx="60" cy="47" rx="9" ry="8" fill="#c48a52" />
      <ellipse cx="50" cy="69" rx="14" ry="10" fill="#f5dcb8" />
      <Eyes />
      <ellipse cx="50" cy="63" rx="5" ry="3.6" fill={INK} />
      <path d="M50,66 L50,70 M44,70 Q50,74 56,70" stroke={INK} stroke-width="1.8" fill="none" stroke-linecap="round" />
      <path d="M47,72 Q50,80 53,72 Z" fill="#ff7a9a" />
    </>
  ),
  fox: () => (
    <>
      <PointyEars fill="#e8702a" inner="#fff4e4" />
      <Head fill="#e8702a" />
      <path d="M20,58 Q34,58 42,64 Q50,72 58,64 Q66,58 80,58 Q76,86 50,86 Q24,86 20,58 Z" fill="#fff4e4" />
      <Eyes />
      <ellipse cx="50" cy="64" rx="4" ry="3" fill={INK} />
      <Smile y={69} w={4} />
    </>
  ),
  panda: () => (
    <>
      <RoundEars fill={INK} x={28} y={31} r={10} />
      <Head fill="#fff" />
      {both(() => <ellipse cx="39" cy="53" rx="8" ry="10" transform="rotate(25 39 53)" fill={INK} />)}
      <Eyes white r={3} />
      <ellipse cx="50" cy="64" rx="4.5" ry="3.2" fill={INK} />
      <Smile y={68} w={4} />
      <Cheeks y={67} />
    </>
  ),
  bear: () => (
    <>
      <RoundEars fill="#8b5a2b" inner="#c49060" />
      <Head fill="#8b5a2b" />
      <ellipse cx="50" cy="67" rx="13" ry="10" fill="#d9b38c" />
      <Eyes />
      <ellipse cx="50" cy="63" rx="5" ry="3.6" fill={INK} />
      <Smile y={68} w={4} />
    </>
  ),
  bunny: () => (
    <>
      {both(() => (
        <g>
          <ellipse cx="38" cy="16" rx="8" ry="20" transform="rotate(-10 38 16)" fill="#f1ecf2" {...ol} />
          <ellipse cx="38" cy="18" rx="4" ry="14" transform="rotate(-10 38 18)" fill="#ffc2cf" />
        </g>
      ))}
      <Head fill="#f1ecf2" />
      <Eyes />
      <path d="M47,61 L53,61 L50,64 Z" fill="#ff7a9a" />
      <path d="M50,64 L50,67 M46,69 Q50,71 50,67 Q50,71 54,69" stroke={INK} stroke-width="1.8" fill="none" stroke-linecap="round" />
      <rect x="47" y="69" width="6" height="5" rx="1" fill="#fff" {...ol} stroke-width="1.2" />
      <Cheeks />
    </>
  ),
  frog: () => (
    <>
      {both(() => <circle cx="38" cy="48" r="10" fill="#5dbb4a" {...ol} />)}
      <ellipse cx="50" cy="62" rx="33" ry="25" fill="#5dbb4a" {...ol} />
      {both(() => <circle cx="38" cy="48" r="8.5" fill="#5dbb4a" />)}
      <Eyes y={50} white r={3.5} />
      <path d="M32,68 Q50,80 68,68" stroke={INK} stroke-width="2.4" fill="none" stroke-linecap="round" />
      <Cheeks y={70} />
    </>
  ),
  owl: () => (
    <>
      {both(() => <path d="M24,40 L24,18 L40,30 Z" fill="#8a6440" {...ol} />)}
      <Head fill="#8a6440" />
      <path d="M26,70 Q50,92 74,70 Q70,86 50,86 Q30,86 26,70 Z" fill="#c9a57a" />
      {both(() => <circle cx="40" cy="52" r="10" fill="#fff4e4" {...ol} />)}
      {both(() => <circle cx="40" cy="52" r="6" fill="#f2a01d" />)}
      <Eyes r={3.4} />
      <path d="M46,59 L54,59 L50,68 Z" fill="#f2a01d" {...ol} stroke-width="1.5" />
    </>
  ),
  penguin: () => (
    <>
      <Head fill="#2d3040" />
      <path d="M50,44 Q38,34 30,44 Q22,58 30,72 Q40,86 50,86 Q60,86 70,72 Q78,58 70,44 Q62,34 50,44 Z" fill="#fff" />
      <Eyes />
      <path d="M44,60 L56,60 L50,68 Z" fill="#f2a01d" {...ol} stroke-width="1.5" />
      <Cheeks y={66} />
    </>
  ),
  lion: () => (
    <>
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return <circle key={i} cx={50 + Math.cos(a) * 32} cy={56 + Math.sin(a) * 31} r="11" fill="#c2702a" {...ol} />;
      })}
      <circle cx="50" cy="56" r="33" fill="#c2702a" />
      <RoundEars fill="#f2c057" inner="#d99a3c" r={7} x={31} y={34} />
      <Head fill="#f2c057" r={26} />
      <ellipse cx="50" cy="67" rx="11" ry="8" fill="#fbe3a8" />
      <Eyes />
      <path d="M46,61 L54,61 L50,65 Z" fill="#7a3e1a" />
      <path d="M50,65 L50,68 M45,70 Q50,73 50,68 Q50,73 55,70" stroke={INK} stroke-width="1.8" fill="none" stroke-linecap="round" />
    </>
  ),
  tiger: () => (
    <>
      <RoundEars fill="#f08a24" inner="#fff4e4" />
      <Head fill="#f08a24" />
      <path d="M44,27 L46,37 M50,26 L50,38 M56,27 L54,37" stroke={INK} stroke-width="3" stroke-linecap="round" />
      {both(() => <path d="M20,52 L30,54 M21,60 L31,60 M22,68 L30,66" stroke={INK} stroke-width="2.6" stroke-linecap="round" />)}
      <ellipse cx="50" cy="68" rx="13" ry="9" fill="#fff4e4" />
      <Eyes />
      <path d="M46,61 L54,61 L50,65 Z" fill="#ff7a9a" />
      <path d="M50,65 L50,68 M45,70 Q50,73 50,68 Q50,73 55,70" stroke={INK} stroke-width="1.8" fill="none" stroke-linecap="round" />
    </>
  ),
  koala: () => (
    <>
      <RoundEars fill="#9aa3ad" inner="#f0d9e0" r={15} x={21} y={40} />
      <Head fill="#9aa3ad" />
      <Eyes />
      <ellipse cx="50" cy="63" rx="7" ry="9" fill="#3b3f4a" />
      <Smile y={74} w={4} />
      <Cheeks y={66} />
    </>
  ),
  monkey: () => (
    <>
      {both(() => (
        <g>
          <circle cx="18" cy="56" r="9" fill="#8b5a2b" {...ol} />
          <circle cx="18" cy="56" r="5" fill="#f0c89a" />
        </g>
      ))}
      <Head fill="#8b5a2b" />
      <path d="M50,46 Q46,38 38,40 Q28,44 30,56 Q26,66 34,76 Q42,84 50,84 Q58,84 66,76 Q74,66 70,56 Q72,44 62,40 Q54,38 50,46 Z" fill="#f0c89a" />
      <Eyes />
      {both(() => <circle cx="47.5" cy="62" r="1.3" fill={INK} />)}
      <path d="M40,69 Q50,77 60,69" stroke={INK} stroke-width="2.4" fill="none" stroke-linecap="round" />
    </>
  ),
  pig: () => (
    <>
      {both(() => <path d="M24,38 L26,20 L42,30 Z" fill="#f28ba0" {...ol} />)}
      <Head fill="#f7a8b8" />
      <Eyes />
      <ellipse cx="50" cy="65" rx="10" ry="7" fill="#f28ba0" {...ol} />
      {both(() => <ellipse cx="46.5" cy="65" rx="1.8" ry="2.6" fill={INK} />)}
      <Smile y={75} w={4} />
    </>
  ),
  cow: () => (
    <>
      {both(() => <path d="M30,32 Q24,18 30,12 Q30,22 38,28 Z" fill="#f5e6c4" {...ol} />)}
      {both(() => <ellipse cx="18" cy="44" rx="9" ry="5" transform="rotate(-20 18 44)" fill="#fff" {...ol} />)}
      <Head fill="#fff" />
      <path d="M58,28 Q70,30 72,42 Q64,46 58,38 Q54,32 58,28 Z" fill={INK} />
      <path d="M24,54 Q30,48 36,56 Q32,64 24,62 Z" fill={INK} />
      <Eyes />
      <ellipse cx="50" cy="72" rx="17" ry="11" fill="#f7b6c2" {...ol} />
      {both(() => <ellipse cx="44" cy="71" rx="2.2" ry="3" fill="#a8546a" />)}
    </>
  ),
  mouse: () => (
    <>
      <RoundEars fill="#b8b8c4" inner="#ffc2cf" r={15} x={23} y={30} />
      <Head fill="#b8b8c4" />
      <Eyes />
      <circle cx="50" cy="63" r="3.5" fill="#ff7a9a" />
      <Whiskers y={64} />
      <path d="M50,66 L50,68 M46,70 Q50,72 50,68 Q50,72 54,70" stroke={INK} stroke-width="1.8" fill="none" stroke-linecap="round" />
      <Cheeks y={68} />
    </>
  ),
  unicorn: () => (
    <>
      <path d="M44,30 L50,0 L56,30 Z" fill="#ffd23f" {...ol} />
      <path d="M46,22 L54,19 M45,14 L53,11" stroke="#c99a00" stroke-width="2" />
      {both(() => <path d="M24,40 L26,20 L40,30 Z" fill="#f7f1ff" {...ol} />)}
      <path d="M70,30 Q88,40 84,60 Q80,78 86,88 Q70,82 70,64 Z" fill="#ff8fc7" {...ol} />
      <path d="M74,40 Q84,50 80,66 Q78,76 82,84 Q74,78 74,66 Z" fill="#8fd3ff" />
      <Head fill="#f7f1ff" />
      <path d="M36,28 Q50,20 66,30 Q58,36 50,32 Q42,38 36,28 Z" fill="#b48cff" {...ol} />
      <Eyes />
      {both(() => <path d="M34,48 L32,45 M37,46 L36,43" stroke={INK} stroke-width="1.5" stroke-linecap="round" />)}
      <Cheeks />
      <Smile />
    </>
  ),
  dragon: () => (
    <>
      {both(() => <path d="M32,32 Q26,14 18,10 Q30,12 40,28 Z" fill="#f5e6c4" {...ol} />)}
      {both(() => <path d="M20,44 L8,36 L12,50 Z" fill="#2c7a4f" {...ol} />)}
      <Head fill="#3fa36b" />
      <path d="M40,30 L44,24 L48,30 M52,30 L56,24 L60,30" fill="#2c7a4f" {...ol} />
      <ellipse cx="50" cy="70" rx="16" ry="11" fill="#9fdc9a" />
      <Eyes />
      {both(() => <ellipse cx="45" cy="66" rx="1.8" ry="2.4" fill={INK} />)}
      <Smile y={73} w={7} />
    </>
  ),
  dino: () => (
    <>
      {[20, 32, 46, 60, 72].map((x, i) => (
        <path key={x} d={`M${x},${[42, 30, 26, 28, 38][i]} l6,-12 l6,12 Z`} fill="#f2a01d" {...ol} />
      ))}
      <Head fill="#5cc2a0" />
      {both(() => <circle cx="30" cy="42" r="3" fill="#3f9a7c" />)}
      <circle cx="62" cy="36" r="2.5" fill="#3f9a7c" />
      <Eyes />
      <path d="M30,64 Q50,82 70,64 Z" fill="#fff" {...ol} />
      <path d="M34,66 L37,70 L40,67 L43,71 L46,68 L50,72 L54,68 L57,71 L60,67 L63,70 L66,66" stroke={INK} stroke-width="1.2" fill="none" />
    </>
  ),
  octopus: () => (
    <>
      {[18, 30, 42, 58, 70, 82].map((x, i) => (
        <path
          key={x}
          d={`M${x - 5},70 Q${x - 7 + (i % 2) * 4},86 ${x + (i < 3 ? -4 : 4)},96 Q${x + 4},88 ${x + 5},70 Z`}
          fill="#9b59b6"
          {...ol}
        />
      ))}
      <ellipse cx="50" cy="50" rx="31" ry="30" fill="#9b59b6" {...ol} />
      <path d="M26,64 Q50,82 74,64 L74,70 Q50,84 26,70 Z" fill="#9b59b6" />
      {[36, 64, 44].map((x, i) => (
        <circle key={x} cx={x} cy={[32, 34, 26][i]} r="3" fill="#b77fd0" />
      ))}
      <Eyes white r={3.2} />
      <Smile y={64} w={5} />
      <Cheeks y={62} />
    </>
  ),
  chick: () => (
    <>
      <path d="M48,28 Q44,14 50,16 Q52,8 56,14 Q60,12 56,28 Z" fill="#ffd23f" {...ol} />
      <Head fill="#ffd23f" />
      <Eyes />
      <path d="M43,60 L57,60 L50,68 Z" fill="#f2801d" {...ol} stroke-width="1.5" />
      <path d="M43,60 L57,60 L50,64 Z" fill="#f2a01d" />
      <Cheeks y={66} />
    </>
  ),
  robot: () => (
    <>
      <path d="M50,26 L50,12" stroke={INK} stroke-width="3" />
      <circle cx="50" cy="10" r="5" fill="#e21b3c" {...ol} />
      {both(() => <rect x="14" y="48" width="8" height="16" rx="3" fill="#8a8f9b" {...ol} />)}
      <rect x="20" y="26" width="60" height="60" rx="12" fill="#c5ccd6" {...ol} />
      <rect x="27" y="40" width="46" height="24" rx="6" fill="#23303f" />
      {both(() => <rect x="34" y="47" width="11" height="9" rx="2" fill="#58e0ff" />)}
      <rect x="36" y="71" width="28" height="8" rx="2" fill="#8a8f9b" {...ol} stroke-width="1.5" />
      {[42, 50, 58].map((x) => (
        <path key={x} d={`M${x},71 L${x},79`} stroke={INK} stroke-width="1.2" />
      ))}
      {both(() => <circle cx="26" cy="32" r="1.8" fill="#8a8f9b" />)}
    </>
  ),
  alien: () => (
    <>
      {both(() => (
        <g>
          <path d="M40,30 Q34,16 28,10" stroke={INK} stroke-width="2.2" fill="none" />
          <circle cx="28" cy="10" r="4.5" fill="#ffd23f" {...ol} />
        </g>
      ))}
      <path d="M50,26 Q84,26 80,54 Q76,78 50,88 Q24,78 20,54 Q16,26 50,26 Z" fill="#7ed957" {...ol} />
      {both(() => <ellipse cx="38" cy="54" rx="9" ry="6" transform="rotate(25 38 54)" fill={INK} />)}
      {both(() => <circle cx="36" cy="51" r="2" fill="#fff" />)}
      <Smile y={72} w={5} />
    </>
  ),
  ghost: () => (
    <>
      <path d="M20,56 Q20,26 50,26 Q80,26 80,56 L80,94 Q74,86 68,94 Q62,86 56,94 Q50,86 44,94 Q38,86 32,94 Q26,86 20,94 Z" fill="#f4f4fb" {...ol} />
      {both(() => <ellipse cx="40" cy="52" rx="4.5" ry="6" fill={INK} />)}
      <ellipse cx="50" cy="68" rx="4.5" ry="5.5" fill={INK} />
      <Cheeks y={62} />
    </>
  ),
  monster: () => (
    <>
      {both(() => <path d="M28,34 Q18,20 24,8 Q30,22 40,28 Z" fill="#fff4e4" {...ol} />)}
      {Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2;
        return (
          <path
            key={i}
            d={`M${50 + Math.cos(a - 0.14) * 29},${56 + Math.sin(a - 0.14) * 29} L${50 + Math.cos(a) * 35},${56 + Math.sin(a) * 35} L${50 + Math.cos(a + 0.14) * 29},${56 + Math.sin(a + 0.14) * 29} Z`}
            fill="#4aa3df"
            {...ol}
          />
        );
      })}
      <Head fill="#4aa3df" />
      <Eyes white r={3.5} />
      <path d="M34,64 Q50,82 66,64 Z" fill="#5a0c1e" {...ol} />
      {both(() => <path d="M38,65 L41,71 L44,66 Z" fill="#fff" />)}
    </>
  ),
  kid1: () => <Kid skin="#fde0c5" hair="#e8b83a" blush="#ff7a9a" />,
  kid2: () => <Kid skin="#f1c27d" hair="#6b3e1e" blush="#ff7a6a" />,
  kid3: () => <Kid skin="#c68642" hair="#23202b" blush="#d9534f" />,
  kid4: () => <Kid skin="#8d5524" hair="#3b2a1a" blush="#c2413c" />,
};

// ---------- accessories ----------

function Flower({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={x + Math.cos((a * Math.PI) / 180) * 4} cy={y + Math.sin((a * Math.PI) / 180) * 4} r="3.6" fill={color} stroke={INK} stroke-width="1" />
      ))}
      <circle cx={x} cy={y} r="2.6" fill="#ffd23f" />
    </g>
  );
}

function Heart({ cx, cy }: { cx: number; cy: number }) {
  return (
    <path
      d={`M${cx},${cy + 8} C${cx - 14},${cy - 1} ${cx - 8},${cy - 12} ${cx},${cy - 5} C${cx + 8},${cy - 12} ${cx + 14},${cy - 1} ${cx},${cy + 8} Z`}
      fill="#e21b3c"
      {...ol}
    />
  );
}

export const ACCESSORY_ART: Record<AccessoryId, () => JSX.Element | null> = {
  none: () => null,
  tophat: () => (
    <>
      <rect x="33" y="2" width="34" height="27" rx="3" fill="#23202b" {...ol} />
      <rect x="33" y="20" width="34" height="6" fill="#e21b3c" />
      <ellipse cx="50" cy="29" rx="27" ry="5" fill="#23202b" {...ol} />
    </>
  ),
  cap: () => (
    <>
      <path d="M58,32 Q84,26 94,36 Q80,40 58,37 Z" fill="#b0132f" {...ol} />
      <path d="M22,36 Q22,10 50,10 Q78,10 78,36 Z" fill="#e21b3c" {...ol} />
      <path d="M50,10 L50,36 M36,13 Q34,24 36,36 M64,13 Q66,24 64,36" stroke="#b0132f" stroke-width="1.5" fill="none" />
      <circle cx="50" cy="10" r="3" fill="#b0132f" {...ol} stroke-width="1.2" />
    </>
  ),
  crown: () => (
    <>
      <path d="M28,34 L26,10 L39,22 L50,4 L61,22 L74,10 L72,34 Z" fill="#ffd23f" {...ol} />
      <rect x="27" y="28" width="46" height="7" rx="2" fill="#f2a01d" {...ol} stroke-width="1.5" />
      <circle cx="50" cy="31.5" r="2.6" fill="#e21b3c" />
      <circle cx="39" cy="31.5" r="2" fill="#1368ce" />
      <circle cx="61" cy="31.5" r="2" fill="#26890c" />
    </>
  ),
  beanie: () => (
    <>
      <circle cx="50" cy="7" r="6" fill="#fff" {...ol} />
      <path d="M21,40 Q20,10 50,10 Q80,10 79,40 Z" fill="#1368ce" {...ol} />
      <rect x="19" y="32" width="62" height="11" rx="5" fill="#0d4f99" {...ol} />
      {[26, 34, 42, 50, 58, 66, 74].map((x) => (
        <path key={x} d={`M${x},34 L${x},41`} stroke="#1368ce" stroke-width="2" />
      ))}
    </>
  ),
  partyhat: () => (
    <g transform="rotate(12 50 30)">
      <path d="M34,32 L52,0 L66,32 Z" fill="#ff8fc7" {...ol} />
      <path d="M42,18 L60,18 M38,25 L63,25 M46,11 L56,11" stroke="#ffd23f" stroke-width="3.5" />
      <circle cx="52" cy="0" r="4.5" fill="#58e0ff" {...ol} />
      <path d="M32,32 Q50,36 68,32" stroke={INK} stroke-width="2" fill="none" />
    </g>
  ),
  cowboy: () => (
    <>
      <path d="M31,30 Q30,8 42,8 Q50,13 58,8 Q70,8 69,30 Z" fill="#9b6a3c" {...ol} />
      <rect x="31" y="23" width="38" height="6" fill="#5c3a1c" />
      <path d="M4,26 Q16,36 50,36 Q84,36 96,26 Q90,40 50,42 Q10,40 4,26 Z" fill="#9b6a3c" {...ol} />
    </>
  ),
  wizard: () => (
    <>
      <path d="M28,32 Q42,18 68,0 Q62,18 72,32 Z" fill="#5b3fa8" {...ol} />
      <path d="M50,20 l1.5,3 3.3,.4 -2.4,2.3 .6,3.3 -3,-1.6 -3,1.6 .6,-3.3 -2.4,-2.3 3.3,-.4 Z" fill="#ffd23f" />
      <circle cx="60" cy="12" r="1.8" fill="#ffd23f" />
      <circle cx="40" cy="27" r="1.5" fill="#ffd23f" />
      <ellipse cx="50" cy="32" rx="31" ry="5.5" fill="#4a3290" {...ol} />
    </>
  ),
  pirate: () => (
    <>
      <path d="M14,36 Q24,6 50,12 Q76,6 86,36 Q50,26 14,36 Z" fill="#23202b" {...ol} />
      <path d="M18,33 Q50,24 82,33" stroke="#ffd23f" stroke-width="2" fill="none" />
      <circle cx="50" cy="20" r="4.5" fill="#fff" />
      <path d="M43,27 L57,33 M57,27 L43,33" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
      {both(() => <circle cx="48.2" cy="19.5" r="1" fill={INK} />)}
    </>
  ),
  viking: () => (
    <>
      {both(() => <path d="M26,30 Q8,26 8,4 Q16,18 32,22 Z" fill="#f5e6c4" {...ol} />)}
      <path d="M23,38 Q23,10 50,10 Q77,10 77,38 Z" fill="#9aa3ad" {...ol} />
      <rect x="21" y="31" width="58" height="8" rx="3" fill="#8a5a32" {...ol} />
      <path d="M50,10 L50,31" stroke="#6c7480" stroke-width="3" />
      {[30, 40, 60, 70].map((x) => (
        <circle key={x} cx={x} cy="35" r="1.5" fill="#ffd23f" />
      ))}
    </>
  ),
  headphones: () => (
    <>
      <path d="M18,54 Q16,16 50,16 Q84,16 82,54" stroke="#23202b" stroke-width="6" fill="none" stroke-linecap="round" />
      {both(() => (
        <g>
          <rect x="11" y="44" width="14" height="22" rx="6" fill="#e21b3c" {...ol} />
          <rect x="21" y="47" width="5" height="16" rx="2" fill="#23202b" />
        </g>
      ))}
    </>
  ),
  flowers: () => (
    <>
      <path d="M22,38 Q50,20 78,38" stroke="#26890c" stroke-width="3" fill="none" />
      <Flower x={24} y={36} color="#ff8fc7" />
      <Flower x={37} y={28} color="#fff" />
      <Flower x={50} y={25} color="#b48cff" />
      <Flower x={63} y={28} color="#ff8fc7" />
      <Flower x={76} y={36} color="#fff" />
    </>
  ),
  halo: () => (
    <>
      <ellipse cx="50" cy="12" rx="22" ry="6" fill="none" stroke="#fff6b0" stroke-width="8" opacity="0.6" />
      <ellipse cx="50" cy="12" rx="22" ry="6" fill="none" stroke="#ffd23f" stroke-width="4" />
    </>
  ),
  bow: () => (
    <g transform="rotate(-15 66 26)">
      <path d="M66,26 Q54,12 50,20 Q48,30 66,26 Z" fill="#ff5fa2" {...ol} />
      <path d="M66,26 Q78,12 82,20 Q84,30 66,26 Z" fill="#ff5fa2" {...ol} />
      <circle cx="66" cy="26" r="4" fill="#e0307a" {...ol} />
    </g>
  ),
  curly: () => (
    <>
      {[
        [22, 46],
        [24, 34],
        [32, 25],
        [42, 20],
        [50, 19],
        [58, 20],
        [68, 25],
        [76, 34],
        [78, 46],
        [38, 30],
        [50, 28],
        [62, 30],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="9" fill="#6b3e1e" {...ol} />
      ))}
      {[
        [38, 30],
        [50, 27],
        [62, 30],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="8.4" fill="#6b3e1e" />
      ))}
    </>
  ),
  spiky: () => (
    <path
      d="M20,48 L18,28 L28,32 L28,14 L39,24 L46,4 L54,22 L64,8 L66,26 L78,18 L76,32 L84,32 L80,48 Q72,34 50,36 Q28,34 20,48 Z"
      fill="#e8b83a"
      {...ol}
    />
  ),
  pigtails: () => (
    <>
      {both(() => (
        <g>
          <ellipse cx="13" cy="54" rx="9" ry="14" fill="#b5532a" {...ol} />
          <circle cx="20" cy="44" r="3.5" fill="#ff5fa2" {...ol} stroke-width="1.2" />
        </g>
      ))}
      <path d="M20,50 Q18,22 50,22 Q82,22 80,50 Q70,36 56,36 L50,30 L44,36 Q30,36 20,50 Z" fill="#b5532a" {...ol} />
    </>
  ),
  sunglasses: () => (
    <>
      <path d="M22,50 L32,49 M68,49 L78,50 M47,50 Q50,48 53,50" stroke={INK} stroke-width="2.4" fill="none" />
      {both(() => (
        <g>
          <path d="M31,46 L48,46 L47,53 Q46,59 39,59 Q32,59 31,53 Z" fill="#111" {...ol} />
          <path d="M34,49 L38,49" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.7" />
        </g>
      ))}
    </>
  ),
  hearts: () => (
    <>
      <path d="M22,50 L31,50 M69,50 L78,50 M47,51 Q50,49 53,51" stroke={INK} stroke-width="2.2" fill="none" />
      <Heart cx={40} cy={52} />
      <Heart cx={60} cy={52} />
    </>
  ),
  nerd: () => (
    <>
      <path d="M22,51 L31,51 M69,51 L78,51" stroke={INK} stroke-width="2.4" />
      {both(() => <circle cx="40" cy="52" r="8.5" fill="#dff4ff" fill-opacity="0.35" stroke={INK} stroke-width="3" />)}
      <path d="M48,51 Q50,49 52,51" stroke={INK} stroke-width="3" fill="none" />
      <rect x="47" y="48" width="6" height="6" rx="1" fill="#fff" stroke="#bbb" stroke-width="0.8" />
    </>
  ),
  monocle: () => (
    <>
      <path d="M67,57 Q70,72 64,84" stroke="#c99a00" stroke-width="1.5" fill="none" stroke-dasharray="2 1.5" />
      <circle cx="60" cy="52" r="8.5" fill="#dff4ff" fill-opacity="0.3" stroke="#c99a00" stroke-width="2.6" />
    </>
  ),
  mustache: () => (
    <path
      d="M50,64 Q44,58 36,61 Q30,64 26,58 Q26,70 38,69 Q46,68 50,66 Q54,68 62,69 Q74,70 74,58 Q70,64 64,61 Q56,58 50,64 Z"
      fill="#4a2c14"
      {...ol}
      stroke-width="1.5"
    />
  ),
  bowtie: () => (
    <>
      <path d="M50,92 L34,84 L34,100 Z" fill="#e21b3c" {...ol} />
      <path d="M50,92 L66,84 L66,100 Z" fill="#e21b3c" {...ol} />
      <rect x="45" y="87.5" width="10" height="9" rx="2" fill="#b0132f" {...ol} />
    </>
  ),
};

/** A character with its accessory on top. Unknown ids (e.g. from an older page) fall back gracefully. */
export function Avatar({ choice, class: cls, title }: { choice: AvatarChoice; class?: string; title?: string }) {
  const body = AVATAR_ART[choice.avatar] ?? AVATAR_ART.cat;
  const extra = ACCESSORY_ART[choice.accessory] ?? ACCESSORY_ART.none;
  return (
    <svg class={`avatar ${cls ?? ""}`} viewBox="0 0 100 100" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : "true"}>
      {body()}
      {extra()}
    </svg>
  );
}
