/** why: pandoc-style `$…$` rules, so prices like "$5 and $10" stay plain; `\$` is a literal dollar. */
const MATH_RE = /\\\$|\$(?=\S)((?:\\.|[^$\\])+?)(?<=\S)\$(?!\d)/g;

export type MathPart = string | { math: string };

export function splitMath(text: string): MathPart[] {
  if (!text.includes("$")) return [text];
  const parts: MathPart[] = [];
  let plain = "";
  let last = 0;
  for (const m of text.matchAll(MATH_RE)) {
    plain += text.slice(last, m.index);
    if (m[1] === undefined) plain += "$";
    else {
      if (plain) parts.push(plain);
      parts.push({ math: m[1] });
      plain = "";
    }
    last = m.index + m[0].length;
  }
  plain += text.slice(last);
  if (plain) parts.push(plain);
  return parts;
}

/** why: for "long question" font sizing; commands like `\frac` and braces don't show once typeset. */
export function visibleLength(text: string): number {
  return splitMath(text).reduce((n, p) => n + (typeof p === "string" ? p.length : p.math.replace(/\\[a-zA-Z]+|[{}_^\\\s]/g, "").length), 0);
}
