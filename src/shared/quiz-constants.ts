// why: Zod-free so browser bundles don't pull in the schema library.

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const MAX_PIN_SPOTS = 20;
export const TF_OPTIONS = ["True", "False"] as const;
export const DEFAULT_TIME_LIMIT = 20;
export const TIME_LIMITS = [5, 10, 20, 30, 45, 60, 90, 120] as const;

export const QUIZ_ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
export const QUESTION_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const MEDIA_REF_RE = /^media\/[A-Za-z0-9_-]+\.(png|jpg|gif|webp)$/;

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
/** why: phones never show images bigger, and every phone downloads each one. */
export const MAX_IMAGE_SIDE = 1280;
export const SHRINK_ABOVE_BYTES = 300 * 1024;

/** why: x and y are fractions (0–1) of the image's width and height. */
export interface PinSpot {
  x: number;
  y: number;
}

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

/** why: legacy guard for clients that loaded a quiz before content revisions existed. */
export const BASE_VERSION_HEADER = "x-quiz-updated-at";

export const QUIZ_REVISION_HEADER = "x-quiz-revision";
