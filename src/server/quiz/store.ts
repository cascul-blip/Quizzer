import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  DEFAULT_SETTINGS,
  MEDIA_REF_RE,
  QUESTION_ID_RE,
  QUIZ_ID_RE,
  Quiz,
  QuizDraft,
  ValidationError,
  formatZodError,
  newId,
  normalizeQuestion,
  normalizeQuestions,
  slugify,
  type Question,
  type QuizSettings,
  type QuizSummary,
} from "../../shared/quiz-schema.ts";

export class NotFoundError extends Error {}

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export const MEDIA_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
export const MEDIA_MIME: Record<string, string> = Object.fromEntries(Object.entries(MEDIA_TYPES).map(([m, e]) => [e, m]));

/** Sniff the image type from magic bytes so we never trust a client-supplied type. */
export function sniffImageType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return "image/webp";
  return null;
}

export interface QuizPatch {
  title?: string;
  description?: string;
  settings?: Partial<QuizSettings>;
}

/** One JSON file per quiz. Every read goes to disk so edits from other processes (stdio MCP) show up immediately. */
export class QuizStore {
  readonly quizzesDir: string;
  readonly mediaDir: string;
  readonly resultsDir: string;

  constructor(readonly dataDir: string) {
    this.quizzesDir = join(dataDir, "quizzes");
    this.mediaDir = join(dataDir, "media");
    this.resultsDir = join(dataDir, "results");
    for (const d of [this.quizzesDir, this.mediaDir, this.resultsDir]) mkdirSync(d, { recursive: true });
  }

  private file(id: string): string {
    if (!QUIZ_ID_RE.test(id)) throw new NotFoundError(`No quiz with id "${id}"`);
    return join(this.quizzesDir, `${id}.json`);
  }

  list(): QuizSummary[] {
    const out: QuizSummary[] = [];
    for (const name of readdirSync(this.quizzesDir)) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -5);
      if (!QUIZ_ID_RE.test(id)) continue;
      try {
        const q = this.get(id);
        out.push({ id, title: q.title, description: q.description, questionCount: q.questions.length, updatedAt: q.updatedAt });
      } catch (e) {
        out.push({ id, title: id, description: "", questionCount: 0, updatedAt: "", error: (e as Error).message });
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): Quiz {
    const path = this.file(id);
    if (!existsSync(path)) throw new NotFoundError(`No quiz with id "${id}"`);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      throw new ValidationError(`${basename(path)} is not valid JSON: ${(e as Error).message}`);
    }
    const parsed = Quiz.safeParse(raw);
    if (!parsed.success) throw new ValidationError(`${basename(path)}: ${formatZodError(parsed.error)}`);
    if (parsed.data.id !== id) throw new ValidationError(`${basename(path)}: id "${parsed.data.id}" does not match the file name`);
    return parsed.data;
  }

  exists(id: string): boolean {
    return QUIZ_ID_RE.test(id) && existsSync(this.file(id));
  }

  create(input: unknown): Quiz {
    const parsed = QuizDraft.safeParse(input);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const d = parsed.data;
    const questions = normalizeQuestions(d.questions ?? []);
    const base = slugify(d.title);
    let id: string;
    do id = `${base}-${newId(4)}`;
    while (this.exists(id));
    const now = new Date().toISOString();
    const quiz: Quiz = {
      id,
      title: d.title,
      description: d.description ?? "",
      createdAt: now,
      updatedAt: now,
      settings: { ...DEFAULT_SETTINGS, ...d.settings },
      questions,
    };
    this.write(quiz);
    return quiz;
  }

  /** Replace a quiz's content (title, description, settings, questions) keeping id and createdAt. */
  replace(id: string, input: unknown): Quiz {
    const existing = this.get(id);
    const parsed = QuizDraft.safeParse(input);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const d = parsed.data;
    const quiz: Quiz = {
      ...existing,
      title: d.title,
      description: d.description ?? "",
      settings: { ...DEFAULT_SETTINGS, ...d.settings },
      questions: normalizeQuestions(d.questions ?? []),
    };
    return this.write(quiz);
  }

  update(id: string, patch: QuizPatch): Quiz {
    const quiz = this.get(id);
    return this.write({
      ...quiz,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      settings: { ...quiz.settings, ...patch.settings },
    });
  }

  duplicate(id: string): Quiz {
    const q = this.get(id);
    return this.create({ title: `${q.title} (copy)`.slice(0, 120), description: q.description, settings: q.settings, questions: q.questions });
  }

  delete(id: string): void {
    const path = this.file(id);
    if (!existsSync(path)) throw new NotFoundError(`No quiz with id "${id}"`);
    rmSync(path);
  }

  // ----- question-level helpers (used by MCP) -----

  addQuestion(quizId: string, draft: unknown, position?: number): Question {
    const quiz = this.get(quizId);
    const q = normalizeQuestion(draft, new Set(quiz.questions.map((x) => x.id)));
    const pos = position === undefined ? quiz.questions.length : Math.max(0, Math.min(position, quiz.questions.length));
    quiz.questions.splice(pos, 0, q);
    this.write(quiz);
    return q;
  }

  updateQuestion(quizId: string, questionId: string, patch: Record<string, unknown>): Question {
    const quiz = this.get(quizId);
    const idx = this.questionIndex(quiz, questionId);
    const current = quiz.questions[idx]!;
    const merged: Record<string, unknown> = { ...current, ...patch, id: current.id };
    // Switching to true/false: fixed options, keep a valid answer.
    if (merged.type === "true_false" && current.type !== "true_false") {
      delete merged.options;
      if (patch.correct === undefined) merged.correct = [0];
    }
    if (merged.image === null) delete merged.image;
    const others = new Set(quiz.questions.filter((_, i) => i !== idx).map((x) => x.id));
    const q = normalizeQuestion(merged, others);
    quiz.questions[idx] = q;
    this.write(quiz);
    return q;
  }

  deleteQuestion(quizId: string, questionId: string): void {
    const quiz = this.get(quizId);
    quiz.questions.splice(this.questionIndex(quiz, questionId), 1);
    this.write(quiz);
  }

  reorderQuestions(quizId: string, questionIds: string[]): Quiz {
    const quiz = this.get(quizId);
    const current = new Set(quiz.questions.map((q) => q.id));
    if (questionIds.length !== current.size || new Set(questionIds).size !== current.size || !questionIds.every((id) => current.has(id))) {
      throw new ValidationError("questionIds must list every question id of the quiz exactly once");
    }
    const byId = new Map(quiz.questions.map((q) => [q.id, q]));
    quiz.questions = questionIds.map((id) => byId.get(id)!);
    return this.write(quiz);
  }

  private questionIndex(quiz: Quiz, questionId: string): number {
    if (!QUESTION_ID_RE.test(questionId)) throw new NotFoundError(`No question "${questionId}"`);
    const idx = quiz.questions.findIndex((q) => q.id === questionId);
    if (idx < 0) throw new NotFoundError(`Quiz "${quiz.id}" has no question "${questionId}"`);
    return idx;
  }

  private write(quiz: Quiz): Quiz {
    const next = { ...quiz, updatedAt: new Date().toISOString() };
    const parsed = Quiz.safeParse(next);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const path = this.file(quiz.id);
    const tmp = `${path}.${process.pid}.${newId(4)}.tmp`;
    writeFileSync(tmp, JSON.stringify(parsed.data, null, 2) + "\n");
    renameSync(tmp, path);
    return parsed.data;
  }

  // ----- media -----

  /** Store image bytes content-addressed; returns a reference like "media/abc123.png". */
  saveMedia(bytes: Uint8Array): string {
    if (bytes.length > MAX_MEDIA_BYTES) throw new ValidationError(`Image is larger than ${MAX_MEDIA_BYTES / 1024 / 1024} MB`);
    const mime = sniffImageType(bytes);
    if (!mime) throw new ValidationError("Unsupported image type (use PNG, JPEG, GIF or WebP)");
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
    const ref = `media/${hash}.${MEDIA_TYPES[mime]}`;
    const path = join(this.dataDir, ref);
    if (!existsSync(path)) writeFileSync(path, bytes);
    return ref;
  }

  /** Absolute path for a media reference, or null if the reference is invalid. */
  mediaFile(ref: string): string | null {
    if (!MEDIA_REF_RE.test(ref)) return null;
    return join(this.dataDir, ref);
  }
}
