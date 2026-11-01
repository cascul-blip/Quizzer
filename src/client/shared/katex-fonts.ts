// KaTeX's fonts as separate woff2 files, so the browser fetches only the faces a question uses
// (Bun would otherwise inline every woff, woff2 and ttf into the CSS: 1.5 MB per phone).

import f0 from "katex/dist/fonts/KaTeX_AMS-Regular.woff2";
import f1 from "katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2";
import f2 from "katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2";
import f3 from "katex/dist/fonts/KaTeX_Fraktur-Bold.woff2";
import f4 from "katex/dist/fonts/KaTeX_Fraktur-Regular.woff2";
import f5 from "katex/dist/fonts/KaTeX_Main-Bold.woff2";
import f6 from "katex/dist/fonts/KaTeX_Main-BoldItalic.woff2";
import f7 from "katex/dist/fonts/KaTeX_Main-Italic.woff2";
import f8 from "katex/dist/fonts/KaTeX_Main-Regular.woff2";
import f9 from "katex/dist/fonts/KaTeX_Math-BoldItalic.woff2";
import f10 from "katex/dist/fonts/KaTeX_Math-Italic.woff2";
import f11 from "katex/dist/fonts/KaTeX_SansSerif-Bold.woff2";
import f12 from "katex/dist/fonts/KaTeX_SansSerif-Italic.woff2";
import f13 from "katex/dist/fonts/KaTeX_SansSerif-Regular.woff2";
import f14 from "katex/dist/fonts/KaTeX_Script-Regular.woff2";
import f15 from "katex/dist/fonts/KaTeX_Size1-Regular.woff2";
import f16 from "katex/dist/fonts/KaTeX_Size2-Regular.woff2";
import f17 from "katex/dist/fonts/KaTeX_Size3-Regular.woff2";
import f18 from "katex/dist/fonts/KaTeX_Size4-Regular.woff2";
import f19 from "katex/dist/fonts/KaTeX_Typewriter-Regular.woff2";

const FACES: [string, string, string, string][] = [
  ["KaTeX_AMS", "400", "normal", f0],
  ["KaTeX_Caligraphic", "700", "normal", f1],
  ["KaTeX_Caligraphic", "400", "normal", f2],
  ["KaTeX_Fraktur", "700", "normal", f3],
  ["KaTeX_Fraktur", "400", "normal", f4],
  ["KaTeX_Main", "700", "normal", f5],
  ["KaTeX_Main", "700", "italic", f6],
  ["KaTeX_Main", "400", "italic", f7],
  ["KaTeX_Main", "400", "normal", f8],
  ["KaTeX_Math", "700", "italic", f9],
  ["KaTeX_Math", "400", "italic", f10],
  ["KaTeX_SansSerif", "700", "normal", f11],
  ["KaTeX_SansSerif", "400", "italic", f12],
  ["KaTeX_SansSerif", "400", "normal", f13],
  ["KaTeX_Script", "400", "normal", f14],
  ["KaTeX_Size1", "400", "normal", f15],
  ["KaTeX_Size2", "400", "normal", f16],
  ["KaTeX_Size3", "400", "normal", f17],
  ["KaTeX_Size4", "400", "normal", f18],
  ["KaTeX_Typewriter", "400", "normal", f19],
];

let added = false;

/** Adds the @font-face rules the first time a page shows maths. */
export function addKatexFonts(): void {
  if (added) return;
  added = true;
  const el = document.createElement("style");
  el.textContent = FACES.map(([family, weight, style, url]) => `@font-face{font-family:${family};font-weight:${weight};font-style:${style};font-display:block;src:url(${url}) format("woff2")}`).join("\n");
  document.head.append(el);
}
