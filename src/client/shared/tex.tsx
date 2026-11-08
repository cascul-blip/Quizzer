import katex from "katex";
import { Fragment } from "preact";
import "./katex.css";
import { addKatexFonts } from "./katex-fonts.ts";
import { splitMath } from "../../shared/math-text.ts";

export { visibleLength } from "../../shared/math-text.ts";

const cache = new Map<string, string>();

function renderMath(tex: string): string {
  let html = cache.get(tex);
  if (html === undefined) {
    addKatexFonts();
    html = katex.renderToString(tex, { throwOnError: false, output: "html" });
    cache.set(tex, html);
  }
  return html;
}

/** Question or option text with `$…$` maths typeset by KaTeX. Plain text renders as it always did. */
export function Tex({ text }: { text: string }) {
  const parts = splitMath(text);
  if (parts.length === 1 && typeof parts[0] === "string") return <>{parts[0]}</>;
  return <>{parts.map((p) => (typeof p === "string" ? p : <span class="tex" dangerouslySetInnerHTML={{ __html: renderMath(p.math) }} />))}</>;
}

/** Several answers or labels, each typeset like <Tex>, joined by `sep`. */
export function TexList({ items, sep }: { items: string[]; sep: string }) {
  return <>{items.map((text, i) => <Fragment key={i}>{i > 0 && sep}<Tex text={text} /></Fragment>)}</>;
}
