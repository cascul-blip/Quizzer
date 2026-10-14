// Zod-free constants so browser bundles can use them without pulling in the schema library.

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
/** Pin questions: how many labelled spots one image can have. */
export const MAX_PIN_SPOTS = 20;
export const TF_OPTIONS = ["True", "False"] as const;
export const DEFAULT_TIME_LIMIT = 20;
export const TIME_LIMITS = [5, 10, 20, 30, 45, 60, 90, 120] as const;

export const QUIZ_ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
export const QUESTION_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const MEDIA_REF_RE = /^media\/[A-Za-z0-9_-]+\.(png|jpg|gif|webp)$/;

/** A pin spot's position as fractions (0–1) of the image's width and height. */
export interface PinSpot {
  x: number;
  y: number;
}

/** Default label for the i-th pin spot: A, B, C, … */
export function pinLabel(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
}

export function newId(len = 6): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
