import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NotFoundError, QuizStore, shrinkImage, sniffImageType } from "../src/server/quiz/store.ts";
import { MAX_IMAGE_SIDE } from "../src/shared/quiz-constants.ts";
import { ValidationError } from "../src/shared/quiz-schema.ts";
import { tempDir } from "./helpers.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let t: ReturnType<typeof tempDir>;
let store: QuizStore;
beforeEach(() => {
  t = tempDir();
  store = new QuizStore(t.dir);
});
afterEach(() => t.cleanup());

describe("QuizStore", () => {
  test("create → list → get → delete", () => {
    const q = store.create({ title: "World Capitals", questions: [{ type: "true_false", text: "Paris is in France", correct: [0] }] });
    expect(q.id).toMatch(/^world-capitals-[a-z0-9]{4}$/);
    expect(existsSync(join(t.dir, "quizzes", `${q.id}.json`))).toBe(true);
    expect(store.list()).toEqual([{ id: q.id, title: "World Capitals", description: "", questionCount: 1, updatedAt: q.updatedAt }]);
    expect(store.get(q.id).questions[0]!.options).toEqual(["True", "False"]);
    store.delete(q.id);
    expect(store.list()).toEqual([]);
    expect(() => store.get(q.id)).toThrow(NotFoundError);
  });

  test("writes are atomic (no tmp files left behind)", () => {
    const q = store.create({ title: "A" });
    for (let i = 0; i < 5; i++) store.update(q.id, { title: `A${i}` });
    expect(readdirSync(join(t.dir, "quizzes"))).toEqual([`${q.id}.json`]);
  });

  test("replace keeps id and createdAt", () => {
    const q = store.create({ title: "A" });
    const r = store.replace(q.id, { title: "B", settings: { shuffleAnswers: true }, questions: [{ type: "true_false", text: "x", correct: [1] }] });
    expect(r.id).toBe(q.id);
    expect(r.createdAt).toBe(q.createdAt);
    expect(r.title).toBe("B");
    expect(r.settings).toEqual({ shuffleQuestions: false, shuffleAnswers: true });
  });

  test("invalid input is rejected and nothing is written", () => {
    expect(() => store.create({ title: "" })).toThrow(ValidationError);
    expect(() => store.create({ title: "x", questions: [{ type: "multiple_choice", text: "q", options: ["a"], correct: [0] }] })).toThrow(ValidationError);
    expect(store.list()).toEqual([]);
  });

  test("path traversal ids are not found", () => {
    expect(() => store.get("../secret")).toThrow(NotFoundError);
    expect(() => store.delete("..")).toThrow(NotFoundError);
  });

  test("a corrupt file is listed with an error instead of crashing", () => {
    writeFileSync(join(t.dir, "quizzes", "broken.json"), "{ nope");
    const [entry] = store.list();
    expect(entry!.id).toBe("broken");
    expect(entry!.error).toContain("not valid JSON");
  });

  test("question-level edits", () => {
    const q = store.create({ title: "Q" });
    const a = store.addQuestion(q.id, { type: "multiple_choice", text: "A?", options: ["x", "y"], correct: [0] });
    const b = store.addQuestion(q.id, { type: "true_false", text: "B?", correct: [0] }, 0);
    expect(store.get(q.id).questions.map((x) => x.id)).toEqual([b.id, a.id]);

    const a2 = store.updateQuestion(q.id, a.id, { text: "A2?", correct: [1] });
    expect(a2).toMatchObject({ id: a.id, text: "A2?", correct: [1], options: ["x", "y"] });

    // switching to true/false resets options and picks a valid answer
    expect(store.updateQuestion(q.id, a.id, { type: "true_false" })).toMatchObject({ options: ["True", "False"], correct: [0] });
    // …and back to multiple choice keeps True/False as editable options.
    expect(store.updateQuestion(q.id, b.id, { type: "multiple_choice" })).toMatchObject({ options: ["True", "False"], correct: [0] });

    store.reorderQuestions(q.id, [a.id, b.id]);
    expect(store.get(q.id).questions.map((x) => x.id)).toEqual([a.id, b.id]);
    expect(() => store.reorderQuestions(q.id, [a.id])).toThrow(ValidationError);

    store.deleteQuestion(q.id, a.id);
    expect(store.get(q.id).questions.map((x) => x.id)).toEqual([b.id]);
    expect(() => store.deleteQuestion(q.id, "nope")).toThrow(NotFoundError);
  });

  test("media is content-addressed and type-sniffed", async () => {
    const ref = await store.saveMedia(PNG);
    expect(ref).toMatch(/^media\/[0-9a-f]{20}\.png$/);
    expect(await store.saveMedia(PNG)).toBe(ref);
    expect(readFileSync(store.mediaFile(ref)!)).toEqual(Buffer.from(PNG));
    await expect(store.saveMedia(new TextEncoder().encode("<svg onload=alert(1)>"))).rejects.toThrow(ValidationError);
    expect(store.mediaFile("media/../../x.png")).toBeNull();
  });

  test("image can be set and removed on a question", async () => {
    const q = store.create({ title: "Q", questions: [{ type: "true_false", text: "x", correct: [0] }] });
    const qid = q.questions[0]!.id;
    const ref = await store.saveMedia(PNG);
    expect(store.updateQuestion(q.id, qid, { image: ref }).image).toBe(ref);
    expect(store.updateQuestion(q.id, qid, { image: null }).image).toBeUndefined();
  });

  test("duplicate", () => {
    const q = store.create({ title: "Orig", questions: [{ type: "true_false", text: "x", correct: [0] }] });
    const d = store.duplicate(q.id);
    expect(d.id).not.toBe(q.id);
    expect(d.title).toBe("Orig (copy)");
    expect(d.questions).toEqual(q.questions);
  });
});

describe("shrinkImage", () => {
  const source = readFileSync(join(import.meta.dir, "../src/client/shared/tower/lobby.webp"));
  const make = (w: number, h: number, as: (i: Bun.Image) => Bun.Image) => as(new Bun.Image(source).resize(w, h)).bytes();
  const size = (bytes: Uint8Array) => new Bun.Image(bytes).metadata();
  /** WebP stores lossless images in a VP8L chunk, lossy ones in VP8. */
  const webpChunk = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(12, 16));

  test("a large photo is scaled to MAX_IMAGE_SIDE as lossy WebP", async () => {
    const jpeg = await make(3000, 2000, (i) => i.jpeg({ quality: 95 }));
    const out = await shrinkImage(jpeg, "image/jpeg");
    expect(out.mime).toBe("image/webp");
    expect(webpChunk(out.bytes)).toBe("VP8 ");
    expect(await size(out.bytes)).toMatchObject({ width: MAX_IMAGE_SIDE, height: Math.round((MAX_IMAGE_SIDE * 2000) / 3000) });
    expect(out.bytes.length).toBeLessThan(jpeg.length);
  });

  test("a PNG becomes lossless WebP", async () => {
    const png = await make(1600, 1600, (i) => i.png());
    const out = await shrinkImage(png, "image/png");
    expect(out.mime).toBe("image/webp");
    expect(webpChunk(out.bytes)).toBe("VP8L");
    expect(await size(out.bytes)).toMatchObject({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE });
  });

  test("small images, GIFs and undecodable files are kept as they are", async () => {
    const small = await make(400, 300, (i) => i.png());
    expect(await shrinkImage(small, "image/png")).toEqual({ bytes: small, mime: "image/png" });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2, 3]);
    expect(await shrinkImage(gif, "image/gif")).toEqual({ bytes: gif, mime: "image/gif" });
    const junk = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(400_000).fill(0)]);
    expect(await shrinkImage(junk, "image/png")).toEqual({ bytes: junk, mime: "image/png" });
  });

  test("saveMedia stores the shrunk image, and the same upload maps to the same ref", async () => {
    const t = tempDir();
    try {
      const s = new QuizStore(t.dir);
      const jpeg = await make(3000, 2000, (i) => i.jpeg({ quality: 95 }));
      const ref = await s.saveMedia(jpeg);
      expect(ref).toMatch(/^media\/[0-9a-f]{20}\.webp$/);
      expect(sniffImageType(readFileSync(s.mediaFile(ref)!))).toBe("image/webp");
      expect(await s.saveMedia(jpeg)).toBe(ref);
    } finally {
      t.cleanup();
    }
  });
});
