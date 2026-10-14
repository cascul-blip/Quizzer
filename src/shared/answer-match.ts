// Checking an answer to a question. Zod-free so browser bundles can import it.

/** What a player sent: an option index, or the text they typed. */
export type AnswerValue = number | string;

export const MAX_TYPED_ANSWER = 100;

function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip a plural ending: berries → berry, boxes → box, airplanes → airplane. Leaves "bus"/"glass" alone. */
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

/** True if the typed text equals an accepted answer, ignoring case, punctuation and plural endings. */
export function matchesAnswer(typed: string, accepted: string[]): boolean {
  const t = canonical(typed);
  return t !== "" && accepted.some((a) => canonical(a) === t);
}

/**
 * Is this answer correct for the question? Returns null when the answer is
 * malformed for the question's type (so callers can reject it).
 */
export function checkAnswer(q: { type: string; options: string[]; correct: number[] }, answer: AnswerValue): boolean | null {
  if (q.type === "text") return typeof answer === "string" ? matchesAnswer(answer.slice(0, MAX_TYPED_ANSWER), q.options) : null;
  if (typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= q.options.length) return null;
  return q.correct.includes(answer);
}

/** The answer value in a client message: typed text if present, else the option index. */
export function answerOf(msg: { option?: unknown; text?: unknown }): AnswerValue {
  return typeof msg.text === "string" ? msg.text : Number(msg.option);
}
