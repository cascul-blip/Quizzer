/**
 * Splits text into plain runs and `$…$` maths, pandoc style: the opening `$` must be followed by
 * a non-space and the closing `$` preceded by a non-space and not followed by a digit, so prices
 * like "$5 and $10" stay plain text. `\$` is a literal dollar sign.
 */
const MATH_RE = /\\\$|\$(?=\S)((?:\\.|[^$\\])+?)(?<=\S)\$(?!\d)/g;

export type MathPart = string | { math: string };

/** The text as plain strings and `{ math }` pieces, in order. */
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

/**
 * Roughly how many characters the text takes up once typeset, for the "long question" font
 * sizing: commands like `\frac` and braces don't show, so they don't count.
 */
export function visibleLength(text: string): number {
  return splitMath(text).reduce((n, p) => n + (typeof p === "string" ? p.length : p.math.replace(/\\[a-zA-Z]+|[{}_^\\\s]/g, "").length), 0);
}
