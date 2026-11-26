import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { musicTrackForFile } from "../../shared/music-tracks.ts";
import { MAX_IMAGE_SIDE, MAX_MEDIA_BYTES, pinLabel, SHRINK_ABOVE_BYTES } from "../../shared/quiz-constants.ts";
import type { Question, QuizSettings, QuizSummary, SavedQuiz } from "../../shared/quiz-schema.ts";
import {
  DEFAULT_SETTINGS,
  formatZodError,
  MEDIA_REF_RE,
  newId,
  normalizeQuestion,
  normalizeQuestions,
  QUESTION_ID_RE,
  QUIZ_ID_RE,
  Quiz,
  QuizDraft,
  slugify,
  ValidationError,
} from "../../shared/quiz-schema.ts";

export class NotFoundError extends Error {}

function writeAtomic(path: string, data: string | Uint8Array): void {
  const tmp = `${path}.${process.pid}.${newId(4)}.tmp`;
  try {
    writeFileSync(tmp, data);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
  renameSync(tmp, path);
}
export class ConflictError extends Error {}

export { MAX_MEDIA_BYTES };

// why: cap decoded image size independently of the upload byte limit to bound memory use.
const MAX_IMAGE_PIXELS = 64_000_000;
const MEDIA_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
export const MEDIA_MIME: Record<string, string> = Object.fromEntries(Object.entries(MEDIA_TYPES).map(([m, e]) => [e, m]));

// why: WebP reduces phone downloads, and lossless encoding keeps PNG text and diagrams sharp.
export async function shrinkImage(bytes: Uint8Array, mime: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const keep = { bytes, mime };
  if (mime === "image/gif") return keep; // why: re-encoding an animated GIF here would lose its animation.
  let meta;
  try {
    meta = await new Bun.Image(bytes, { maxPixels: MAX_IMAGE_PIXELS }).metadata();
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_IMAGE_TOO_MANY_PIXELS") throw new ValidationError(`Image has more than ${MAX_IMAGE_PIXELS / 1e6} megapixels`);
    return keep;
  }
  const oversized = Math.max(meta.width, meta.height) > MAX_IMAGE_SIDE;
  if (!oversized && bytes.length <= SHRINK_ABOVE_BYTES) return keep;
  try {
    const out = await new Bun.Image(bytes, { maxPixels: MAX_IMAGE_PIXELS })
      .resize(MAX_IMAGE_SIDE, MAX_IMAGE_SIDE, { fit: "inside", withoutEnlargement: true })
      .webp(mime === "image/png" ? { lossless: true } : { quality: 85 })
      .bytes();
    return oversized || out.length < bytes.length ? { bytes: out, mime: "image/webp" } : keep;
  } catch {
    return keep;
  }
}

export function sniffImageType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return "image/webp";
  return null;
}

interface QuizPatch {
  title?: string;
  description?: string;
  settings?: Partial<QuizSettings>;
}

function normalizeDraft(input: unknown) {
  const parsed = QuizDraft.safeParse(input);
  if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
  const draft = parsed.data;
  return {
    title: draft.title,
    description: draft.description ?? "",
    settings: { ...DEFAULT_SETTINGS, ...draft.settings },
    questions: normalizeQuestions(draft.questions ?? []),
  };
}

function quizDate(source: unknown, field: "createdAt" | "updatedAt"): string | undefined {
  if (!source || typeof source !== "object") return undefined;
  const value = (source as Record<string, unknown>)[field];
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : undefined;
}

// why: keeps legacy timestamp guards working across rapid saves and backwards clock adjustments.
function nextTimestamp(previous: string): string {
  const now = Date.now();
  const next = new Date(Date.parse(previous) + 1);
  return next.getTime() > now ? next.toISOString() : new Date(now).toISOString();
}

function revision(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

export class QuizStore {
  readonly quizzesDir: string;
  readonly mediaDir: string;
  readonly resultsDir: string;
  readonly musicDir: string;

  constructor(readonly dataDir: string) {
    this.quizzesDir = join(dataDir, "quizzes");
    this.mediaDir = join(dataDir, "media");
    this.resultsDir = join(dataDir, "results");
    this.musicDir = join(dataDir, "music");
    for (const d of [this.quizzesDir, this.mediaDir, this.resultsDir, this.musicDir]) mkdirSync(d, { recursive: true });
  }

  private async withWriteLock<T>(operation: () => T): Promise<T> {
    const lock = new Database(join(this.dataDir, ".quiz-writes.sqlite"));
    try {
      const deadline = performance.now() + 5000;
      lock.run("PRAGMA busy_timeout = 0");
      while (true) {
        try {
          lock.run("BEGIN IMMEDIATE");
          break;
        } catch (error) {
          if ((error as { code?: string }).code !== "SQLITE_BUSY" || performance.now() >= deadline) throw error;
          await Bun.sleep(10);
        }
      }
      return operation();
    } finally {
      lock.close();
    }
  }

  private file(id: string): string {
    if (!QUIZ_ID_RE.test(id)) throw new NotFoundError(`No quiz with id "${id}"`);
    return join(this.quizzesDir, `${id}.json`);
  }

  private readonly summaryCache = new Map<string, { stamp: string; summary: QuizSummary }>();

  list(): QuizSummary[] {
    const out: QuizSummary[] = [];
    const seen = new Set<string>();
    for (const name of readdirSync(this.quizzesDir)) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -5);
      if (!QUIZ_ID_RE.test(id)) continue;
      let stamp: string;
      try {
        const st = statSync(this.file(id));
        // why: include the inode to catch an atomic replacement even when size and mtime match.
        stamp = `${st.ino}:${st.mtimeMs}:${st.size}`;
      } catch {
        continue; // why: another process can remove a file between readdir and stat.
      }
      seen.add(id);
      const hit = this.summaryCache.get(id);
      if (hit?.stamp === stamp) {
        out.push(hit.summary);
        continue;
      }
      let summary: QuizSummary;
      try {
        const q = this.get(id);
        summary = { id, title: q.title, description: q.description, questionCount: q.questions.length, updatedAt: q.updatedAt };
      } catch (e) {
        summary = { id, title: id, description: "", questionCount: 0, updatedAt: "", error: (e as Error).message };
      }
      this.summaryCache.set(id, { stamp, summary });
      out.push(summary);
    }
    for (const id of this.summaryCache.keys()) if (!seen.has(id)) this.summaryCache.delete(id);
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private contents(id: string): string {
    const path = this.file(id);
    try {
      return readFileSync(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new NotFoundError(`No quiz with id "${id}"`);
      throw error;
    }
  }

  get(id: string): SavedQuiz {
    const contents = this.contents(id);
    let raw: unknown;
    try {
      raw = JSON.parse(contents);
    } catch (e) {
      throw new ValidationError(`${id}.json is not valid JSON: ${(e as Error).message}`);
    }
    const parsed = Quiz.safeParse(raw);
    if (!parsed.success) throw new ValidationError(`${id}.json: ${formatZodError(parsed.error)}`);
    if (parsed.data.id !== id) throw new ValidationError(`${id}.json: id "${parsed.data.id}" does not match the file name`);
    return { ...parsed.data, revision: revision(contents) };
  }

  exists(id: string): boolean {
    return QUIZ_ID_RE.test(id) && existsSync(this.file(id));
  }

  async create(input: unknown): Promise<SavedQuiz> {
    const draft = normalizeDraft(input);
    const base = slugify(draft.title);
    return this.withWriteLock(() => {
      let id: string;
      do id = `${base}-${newId(4)}`;
      while (this.exists(id));
      const now = new Date().toISOString();
      const quiz: Quiz = {
        id,
        ...draft,
        createdAt: now,
        updatedAt: now,
      };
      return this.write(quiz, now);
    });
  }

  async replace(id: string, input: unknown, base?: string | { revision: string }): Promise<SavedQuiz> {
    return this.withWriteLock(() => {
      const contents = this.contents(id); // why: missing quizzes stay deleted, including on explicit overwrite.
      if (typeof base === "object" && base.revision !== revision(contents)) {
        throw new ConflictError("This quiz changed since you opened it");
      }
      let raw: unknown;
      try {
        raw = JSON.parse(contents);
      } catch {
        // why: the open editor can restore a malformed file from its last successful load.
      }
      const updatedAt = quizDate(raw, "updatedAt");
      if (typeof base === "string" && base !== updatedAt) {
        throw new ConflictError("This quiz changed since you opened it");
      }
      const now = new Date().toISOString();
      const quiz: Quiz = {
        id,
        createdAt: quizDate(raw, "createdAt") ?? quizDate(input, "createdAt") ?? now,
        updatedAt: updatedAt ?? quizDate(input, "updatedAt") ?? now,
        ...normalizeDraft(input),
      };
      return this.write(quiz);
    });
  }

  async update(id: string, patch: QuizPatch): Promise<SavedQuiz> {
    return this.withWriteLock(() => {
      const quiz = this.get(id);
      return this.write({
        ...quiz,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        settings: { ...quiz.settings, ...patch.settings },
      });
    });
  }

  async duplicate(id: string): Promise<SavedQuiz> {
    const q = this.get(id);
    return this.create({ title: `${q.title} (copy)`.slice(0, 120), description: q.description, settings: q.settings, questions: q.questions });
  }

  async delete(id: string): Promise<void> {
    return this.withWriteLock(() => {
      const path = this.file(id);
      if (!existsSync(path)) throw new NotFoundError(`No quiz with id "${id}"`);
      rmSync(path);
    });
  }

  private editQuestions<T>(quizId: string, edit: (quiz: Quiz) => T) {
    return this.withWriteLock(() => {
      const quiz = this.get(quizId);
      const result = edit(quiz);
      return { result, saved: this.write(quiz) };
    });
  }

  async addQuestion(quizId: string, draft: unknown, position?: number): Promise<Question> {
    const { result } = await this.editQuestions(quizId, (quiz) => {
      const q = normalizeQuestion(draft, new Set(quiz.questions.map((x) => x.id)));
      const pos = position === undefined ? quiz.questions.length : Math.max(0, Math.min(position, quiz.questions.length));
      quiz.questions.splice(pos, 0, q);
      return q;
    });
    return result;
  }

  async updateQuestion(quizId: string, questionId: string, patch: Record<string, unknown>): Promise<Question> {
    const { result } = await this.editQuestions(quizId, (quiz) => {
      const idx = this.questionIndex(quiz, questionId);
      const current = quiz.questions[idx]!;
      const merged: Record<string, unknown> = { ...current, ...patch, id: current.id };
      if (merged.type === "true_false" && current.type !== "true_false") {
        delete merged.options;
        if (patch.correct === undefined) merged.correct = [0];
      }
      // why: inherited choices could accidentally become accepted answers in a text question.
      if (merged.type === "text" && current.type !== "text" && patch.options === undefined) delete merged.options;
      if (merged.type === "text") delete merged.correct;
      if (merged.type !== "pin") delete merged.spots;
      else if (current.type !== "pin" && patch.options === undefined) {
        delete merged.options;
        if (patch.correct === undefined) merged.correct = [0];
      } else if (Array.isArray(patch.spots) && patch.options === undefined && current.options.every((o, i) => o === pinLabel(i))) {
        // why: dropping the old defaults lets normalization generate one label per new spot.
        delete merged.options;
        const count = (patch.spots as unknown[]).length;
        if (patch.correct === undefined && current.correct.some((c) => c >= count)) merged.correct = [0];
      }
      if (merged.image === null) delete merged.image;
      const others = new Set(quiz.questions.filter((_, i) => i !== idx).map((x) => x.id));
      const q = normalizeQuestion(merged, others);
      quiz.questions[idx] = q;
      return q;
    });
    return result;
  }

  async deleteQuestion(quizId: string, questionId: string): Promise<void> {
    await this.editQuestions(quizId, (quiz) => {
      quiz.questions.splice(this.questionIndex(quiz, questionId), 1);
    });
  }

  async reorderQuestions(quizId: string, questionIds: string[]): Promise<SavedQuiz> {
    const { saved } = await this.editQuestions(quizId, (quiz) => {
      const current = new Set(quiz.questions.map((q) => q.id));
      if (questionIds.length !== current.size || new Set(questionIds).size !== current.size || !questionIds.every((id) => current.has(id))) {
        throw new ValidationError("questionIds must list every question id of the quiz exactly once");
      }
      const byId = new Map(quiz.questions.map((q) => [q.id, q]));
      quiz.questions = questionIds.map((id) => byId.get(id)!);
    });
    return saved;
  }

  private questionIndex(quiz: Quiz, questionId: string): number {
    if (!QUESTION_ID_RE.test(questionId)) throw new NotFoundError(`No question "${questionId}"`);
    const idx = quiz.questions.findIndex((q) => q.id === questionId);
    if (idx < 0) throw new NotFoundError(`Quiz "${quiz.id}" has no question "${questionId}"`);
    return idx;
  }

  private write(quiz: Quiz, updatedAt = nextTimestamp(quiz.updatedAt)): SavedQuiz {
    const next = { ...quiz, updatedAt };
    const parsed = Quiz.safeParse(next);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const contents = JSON.stringify(parsed.data, null, 2) + "\n";
    writeAtomic(this.file(quiz.id), contents);
    return { ...parsed.data, revision: revision(contents) };
  }

  async saveMedia(bytes: Uint8Array): Promise<string> {
    if (bytes.length > MAX_MEDIA_BYTES) throw new ValidationError(`Image is larger than ${MAX_MEDIA_BYTES / 1024 / 1024} MB`);
    const mime = sniffImageType(bytes);
    if (!mime) throw new ValidationError("Unsupported image type (use PNG, JPEG, GIF or WebP)");
    const uploadHash = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
    const existing = Object.values(MEDIA_TYPES)
      .map((ext) => `media/${uploadHash}.${ext}`)
      .find((ref) => existsSync(join(this.dataDir, ref)));
    if (existing) return existing;
    const out = await shrinkImage(bytes, mime);
    const ref = `media/${uploadHash}.${MEDIA_TYPES[out.mime]}`;
    // why: atomic, because a half-written file under the hash name would be handed back by the dedupe above forever.
    writeAtomic(join(this.dataDir, ref), out.bytes);
    return ref;
  }

  musicFiles(): Record<string, string> {
    const filenamesByTrackId: Record<string, string> = {};
    for (const name of readdirSync(this.musicDir).sort()) {
      const id = musicTrackForFile(name);
      if (id && !filenamesByTrackId[id]) filenamesByTrackId[id] = name;
    }
    return filenamesByTrackId;
  }

  musicFile(name: string): string | null {
    if (!musicTrackForFile(name)) return null;
    const path = join(this.musicDir, name);
    return existsSync(path) ? path : null;
  }

  mediaFile(ref: string): string | null {
    if (!MEDIA_REF_RE.test(ref)) return null;
    return join(this.dataDir, ref);
  }
}
