import { readFileSync, statSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { QUESTION_ID_RE, QuestionDraft, QuizSettings, ValidationError } from "../../shared/quiz-schema.ts";
import { MAX_MEDIA_BYTES, NotFoundError, type QuizStore } from "../quiz/store.ts";

export const SERVER_INSTRUCTIONS = `Quizzer stores Kahoot-style quizzes that are played live on a projector with players answering on their phones.

Quiz format rules:
- Question types: "multiple_choice" (2–4 options) and "true_false" (options are always ["True","False"]; omit options).
- "correct" is a list of 0-based option indices. For true_false use [0] for True or [1] for False.
  A multiple_choice question may list several correct indices; picking ANY of them counts as correct.
- timeLimitSec is 5–120 (default 20). Keep question text under 300 chars and each option under 120 chars (shorter reads better on phones).
- Players tap a single option. Speed matters for scoring, so keep questions readable in a few seconds.

Workflow tips: call list_quizzes first to find ids; get_quiz returns question ids for per-question edits.
Prefer create_quiz with the full question list when authoring a new quiz.`;

const ok = (data: unknown): CallToolResult => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const fail = (message: string): CallToolResult => ({ isError: true, content: [{ type: "text", text: message }] });

async function run(fn: () => unknown | Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof ValidationError) return fail(`Invalid input: ${e.message}`);
    if (e instanceof NotFoundError) return fail(e.message);
    return fail(`Error: ${(e as Error).message}`);
  }
}

const quizId = z.string().describe("Quiz id from list_quizzes");
const questionId = z.string().regex(QUESTION_ID_RE).describe("Question id from get_quiz");

async function loadImageBytes(input: { path?: string; base64?: string; url?: string }): Promise<Uint8Array> {
  const given = [input.path, input.base64, input.url].filter((v) => v !== undefined).length;
  if (given !== 1) throw new ValidationError("Provide exactly one of path, base64 or url");
  if (input.path !== undefined) {
    const size = statSync(input.path).size;
    if (size > MAX_MEDIA_BYTES) throw new ValidationError("Image file is larger than 5 MB");
    return new Uint8Array(readFileSync(input.path));
  }
  if (input.base64 !== undefined) {
    const b64 = input.base64.replace(/^data:[^;]+;base64,/, "");
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const url = new URL(input.url!);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ValidationError("url must be http(s)");
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new ValidationError(`Download failed: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_MEDIA_BYTES) throw new ValidationError("Downloaded image is larger than 5 MB");
  return buf;
}

export function createMcpServer(store: QuizStore, version: string): McpServer {
  const server = new McpServer({ name: "quizzer", version }, { instructions: SERVER_INSTRUCTIONS });

  server.registerTool(
    "list_quizzes",
    {
      description: "List all stored quizzes with id, title, description, question count and last update time.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => run(() => store.list()),
  );

  server.registerTool(
    "get_quiz",
    {
      description: "Get a quiz with all its questions (including question ids and correct answers).",
      inputSchema: { id: quizId },
      annotations: { readOnlyHint: true },
    },
    ({ id }) => run(() => store.get(id)),
  );

  server.registerTool(
    "create_quiz",
    {
      description: "Create a new quiz, optionally with its questions. Returns the saved quiz including its generated id.",
      inputSchema: {
        title: z.string().min(1).max(120),
        description: z.string().max(1000).optional(),
        settings: QuizSettings.partial().optional(),
        questions: z.array(QuestionDraft).optional().describe("Questions in play order"),
      },
    },
    (args) => run(() => store.create(args)),
  );

  server.registerTool(
    "update_quiz",
    {
      description: "Change a quiz's title, description and/or settings. Use the question tools to edit questions.",
      inputSchema: {
        id: quizId,
        title: z.string().min(1).max(120).optional(),
        description: z.string().max(1000).optional(),
        settings: QuizSettings.partial().optional(),
      },
    },
    ({ id, ...patch }) => run(() => store.update(id, patch)),
  );

  server.registerTool(
    "delete_quiz",
    {
      description: "Permanently delete a quiz.",
      inputSchema: { id: quizId },
      annotations: { destructiveHint: true },
    },
    ({ id }) =>
      run(() => {
        store.delete(id);
        return `Deleted quiz ${id}`;
      }),
  );

  server.registerTool(
    "add_question",
    {
      description: "Add a question to a quiz. Returns the saved question with its id.",
      inputSchema: {
        quizId,
        question: QuestionDraft,
        position: z.number().int().min(0).optional().describe("0-based insert position; default is the end"),
      },
    },
    ({ quizId, question, position }) => run(() => store.addQuestion(quizId, question, position)),
  );

  server.registerTool(
    "update_question",
    {
      description:
        "Change fields of an existing question. Only the fields you pass are changed. When changing options, also pass correct if indices shift.",
      inputSchema: {
        quizId,
        questionId,
        type: QuestionDraft.shape.type.optional(),
        text: QuestionDraft.shape.text.optional(),
        options: QuestionDraft.shape.options,
        correct: QuestionDraft.shape.correct.optional(),
        timeLimitSec: QuestionDraft.shape.timeLimitSec,
        image: QuestionDraft.shape.image,
      },
    },
    ({ quizId, questionId, ...patch }) =>
      run(() => {
        const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
        return store.updateQuestion(quizId, questionId, defined);
      }),
  );

  server.registerTool(
    "delete_question",
    {
      description: "Remove a question from a quiz.",
      inputSchema: { quizId, questionId },
      annotations: { destructiveHint: true },
    },
    ({ quizId, questionId }) =>
      run(() => {
        store.deleteQuestion(quizId, questionId);
        return `Deleted question ${questionId}`;
      }),
  );

  server.registerTool(
    "reorder_questions",
    {
      description: "Set the question order. questionIds must contain every question id of the quiz exactly once.",
      inputSchema: { quizId, questionIds: z.array(questionId) },
    },
    ({ quizId, questionIds }) => run(() => store.reorderQuestions(quizId, questionIds).questions.map((q) => q.id)),
  );

  server.registerTool(
    "set_question_image",
    {
      description:
        "Attach an image (PNG, JPEG, GIF or WebP, max 5 MB) to a question, shown on the projector. Give exactly one of: path (local file on the host computer), base64 (file contents), or url (http/https to download).",
      inputSchema: {
        quizId,
        questionId,
        path: z.string().optional(),
        base64: z.string().optional(),
        url: z.string().optional(),
      },
    },
    ({ quizId, questionId, ...src }) =>
      run(async () => {
        store.get(quizId); // fail fast on a bad id before downloading
        const ref = store.saveMedia(await loadImageBytes(src));
        return store.updateQuestion(quizId, questionId, { image: ref });
      }),
  );

  server.registerTool(
    "remove_question_image",
    {
      description: "Remove the image from a question.",
      inputSchema: { quizId, questionId },
    },
    ({ quizId, questionId }) => run(() => store.updateQuestion(quizId, questionId, { image: null })),
  );

  return server;
}
