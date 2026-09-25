import { z } from "zod";
import {
  DEFAULT_TIME_LIMIT,
  MAX_OPTIONS,
  MEDIA_REF_RE,
  MIN_OPTIONS,
  QUESTION_ID_RE,
  QUIZ_ID_RE,
  TF_OPTIONS,
  newId,
} from "./quiz-constants.ts";

export * from "./quiz-constants.ts";

export const QuestionType = z.enum(["multiple_choice", "true_false"]);
export type QuestionType = z.infer<typeof QuestionType>;

/**
 * Loose question shape used for input (REST, MCP, editor). Missing fields get
 * defaults in `normalizeQuestion`, which also enforces the cross-field rules.
 */
export const QuestionDraft = z.object({
  id: z.string().regex(QUESTION_ID_RE).optional().describe("Stable question id. Omit to have one generated."),
  type: QuestionType.describe('"multiple_choice" (2–4 options) or "true_false" (options are always ["True","False"]).'),
  text: z.string().trim().min(1).max(300).describe("The question text shown on the projector and phones."),
  image: z
    .string()
    .regex(MEDIA_REF_RE)
    .nullable()
    .optional()
    .describe('Image reference like "media/ab12cd.png" (use set_question_image to add one). null removes it.'),
  timeLimitSec: z.number().int().min(5).max(120).optional().describe(`Seconds to answer, 5–120. Default ${DEFAULT_TIME_LIMIT}.`),
  options: z
    .array(z.string().trim().min(1).max(120))
    .min(MIN_OPTIONS)
    .max(MAX_OPTIONS)
    .optional()
    .describe("Answer texts. 2–4 for multiple_choice; omit for true_false."),
  correct: z
    .array(z.number().int().min(0))
    .min(1)
    .describe("0-based indices into options that count as correct. More than one = any of them is accepted. For true_false: [0] = True, [1] = False."),
});
export type QuestionDraft = z.infer<typeof QuestionDraft>;

export const Question = z
  .object({
    id: z.string().regex(QUESTION_ID_RE),
    type: QuestionType,
    text: z.string().trim().min(1).max(300),
    image: z.string().regex(MEDIA_REF_RE).optional(),
    timeLimitSec: z.number().int().min(5).max(120),
    options: z.array(z.string().trim().min(1).max(120)).min(MIN_OPTIONS).max(MAX_OPTIONS),
    correct: z.array(z.number().int().min(0)).min(1),
  })
  .superRefine((q, ctx) => {
    if (q.correct.some((i) => i >= q.options.length)) {
      ctx.addIssue({ code: "custom", path: ["correct"], message: `correct index out of range (question has ${q.options.length} options)` });
    }
    if (new Set(q.correct).size !== q.correct.length) {
      ctx.addIssue({ code: "custom", path: ["correct"], message: "correct contains duplicate indices" });
    }
    if (q.type === "true_false") {
      if (q.options.length !== 2 || q.options[0] !== TF_OPTIONS[0] || q.options[1] !== TF_OPTIONS[1]) {
        ctx.addIssue({ code: "custom", path: ["options"], message: 'true_false options must be ["True","False"]' });
      }
      if (q.correct.length !== 1) {
        ctx.addIssue({ code: "custom", path: ["correct"], message: "true_false needs exactly one correct index" });
      }
    }
  });
export type Question = z.infer<typeof Question>;

export const QuizSettings = z.object({
  shuffleQuestions: z.boolean().describe("Default for the lobby's \"shuffle questions\" toggle: randomize question order each game."),
  shuffleAnswers: z
    .boolean()
    .describe("Default for the lobby's \"shuffle answers\" toggle: randomize answer positions/colors each game (same order for everyone)."),
});
export type QuizSettings = z.infer<typeof QuizSettings>;
export const DEFAULT_SETTINGS: QuizSettings = { shuffleQuestions: false, shuffleAnswers: false };

export const Quiz = z.object({
  id: z.string().regex(QUIZ_ID_RE),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(1000),
  createdAt: z.string(),
  updatedAt: z.string(),
  settings: QuizSettings,
  questions: z.array(Question),
});
export type Quiz = z.infer<typeof Quiz>;

/** Input for creating/replacing a quiz; everything but the title is optional. */
export const QuizDraft = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  settings: QuizSettings.partial().optional(),
  questions: z.array(QuestionDraft).optional(),
});
export type QuizDraft = z.infer<typeof QuizDraft>;

export interface QuizSummary {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  updatedAt: string;
  /** Set when the file on disk could not be parsed or validated. */
  error?: string;
}

export class ValidationError extends Error {}

export function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`).join("; ");
}

export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "quiz";
}

/** Apply defaults to a question draft and validate it. Throws ValidationError. */
export function normalizeQuestion(draft: unknown, takenIds: Set<string> = new Set()): Question {
  const parsedDraft = QuestionDraft.safeParse(draft);
  if (!parsedDraft.success) throw new ValidationError(formatZodError(parsedDraft.error));
  const d = parsedDraft.data;
  let id = d.id;
  if (!id || takenIds.has(id)) {
    do id = "q" + newId(5);
    while (takenIds.has(id));
  }
  const candidate = {
    id,
    type: d.type,
    text: d.text,
    ...(d.image ? { image: d.image } : {}),
    timeLimitSec: d.timeLimitSec ?? DEFAULT_TIME_LIMIT,
    options: d.type === "true_false" ? [...TF_OPTIONS] : d.options,
    correct: d.correct,
  };
  if (d.type === "multiple_choice" && !d.options) {
    throw new ValidationError("options: multiple_choice questions need 2–4 options");
  }
  const parsed = Question.safeParse(candidate);
  if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
  return parsed.data;
}

export function normalizeQuestions(drafts: unknown[]): Question[] {
  const taken = new Set<string>();
  return drafts.map((d, i) => {
    try {
      const q = normalizeQuestion(d, taken);
      taken.add(q.id);
      return q;
    } catch (e) {
      throw new ValidationError(`questions.${i}: ${(e as Error).message}`);
    }
  });
}
