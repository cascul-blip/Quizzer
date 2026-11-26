export type AnswerValue = number | string;

export const MAX_TYPED_ANSWER = 100;

/** why: minus, decimal point and fraction slash change a number's value, so normalize() keeps them; in words ("x-ray") they drop. */
const NUMBER_MARK = /(?<![\p{L}\p{N}])-(?=\.?\d)|(?<!\p{L})\.(?=\d)|(?<=\d)\/(?=\d)/u;
const STRIPPED = new RegExp(`(?!${NUMBER_MARK.source})[^\\p{L}\\p{N}\\s]`, "gu");

const MINUS_SIGN = "−";
/** why: NFKD turns ½ and the like into digits around this. */
const FRACTION_SLASH = "⁄";

const stripThousandsSeparators = (s: string) => s.replace(/(?<=\d),(?=\d{3}(?!\d))/g, "");
const normalizeDecimalComma = (s: string) => s.replace(/(?<=\d),(?=\d)/g, ".");

function normalize(s: string): string {
  const folded = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replaceAll(MINUS_SIGN, "-").replaceAll(FRACTION_SLASH, "/");
  return normalizeDecimalComma(stripThousandsSeparators(folded)).replace(STRIPPED, "").replace(/\s+/g, " ").trim();
}

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (/(?:[sxz]|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

function canonical(s: string): string {
  return normalize(s).split(" ").map(singular).join(" ");
}

export function matchesAnswer(typed: string, accepted: string[]): boolean {
  const t = canonical(typed);
  return t !== "" && accepted.some((a) => canonical(a) === t);
}

/** why: Invalid input must stay distinct from a wrong answer so the caller can reject it. */
export function checkAnswer(q: { type: string; options: string[]; correct: number[] }, answer: AnswerValue): boolean | null {
  if (q.type === "text") return typeof answer === "string" ? matchesAnswer(answer.slice(0, MAX_TYPED_ANSWER), q.options) : null;
  if (typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= q.options.length) return null;
  return q.correct.includes(answer);
}

export function answerOf(msg: { option?: unknown; text?: unknown }): AnswerValue {
  return typeof msg.text === "string" ? msg.text : Number(msg.option);
}
