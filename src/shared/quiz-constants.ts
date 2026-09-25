// Zod-free constants so browser bundles can use them without pulling in the schema library.

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const TF_OPTIONS = ["True", "False"] as const;
export const DEFAULT_TIME_LIMIT = 20;
export const TIME_LIMITS = [5, 10, 20, 30, 45, 60, 90, 120] as const;

export const QUIZ_ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
export const QUESTION_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const MEDIA_REF_RE = /^media\/[A-Za-z0-9_-]+\.(png|jpg|gif|webp)$/;

export function newId(len = 6): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
