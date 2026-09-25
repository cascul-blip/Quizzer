import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startServer, type RunningServer } from "../src/server/http.ts";
import { createMcpServer } from "../src/server/mcp/tools.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import { tempDir } from "./helpers.ts";

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

let t: ReturnType<typeof tempDir>;
let store: QuizStore;
let client: Client;

async function call(name: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; data: any; text: string }> {
  const r = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = r.content[0]!.text;
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // plain text
  }
  return { ok: !r.isError, data, text };
}

beforeAll(async () => {
  t = tempDir();
  store = new QuizStore(t.dir);
  const server = createMcpServer(store, "test");
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "1" });
  await client.connect(b);
});
afterAll(() => t.cleanup());

describe("MCP tools", () => {
  test("lists all tools with instructions", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((x) => x.name).sort()).toEqual(
      [
        "add_question",
        "create_quiz",
        "delete_question",
        "delete_quiz",
        "get_quiz",
        "list_quizzes",
        "remove_question_image",
        "reorder_questions",
        "set_question_image",
        "update_question",
        "update_quiz",
      ].sort(),
    );
    expect(client.getInstructions()).toContain("true_false");
  });

  test("authoring workflow", async () => {
    const created = await call("create_quiz", {
      title: "Planets",
      questions: [
        { type: "multiple_choice", text: "Largest planet?", options: ["Mars", "Jupiter", "Venus"], correct: [1] },
        { type: "true_false", text: "Pluto is a planet", correct: [1], timeLimitSec: 10 },
      ],
    });
    expect(created.ok).toBe(true);
    const id = created.data.id as string;

    expect((await call("list_quizzes")).data[0]).toMatchObject({ id, questionCount: 2 });

    const added = await call("add_question", { quizId: id, question: { type: "true_false", text: "Earth is round", correct: [0] }, position: 0 });
    expect(added.ok).toBe(true);

    const [q0, q1, q2] = (await call("get_quiz", { id })).data.questions;
    expect(q0.text).toBe("Earth is round");

    const upd = await call("update_question", { quizId: id, questionId: q1.id, options: ["Saturn", "Jupiter"], correct: [0, 1] });
    expect(upd.data).toMatchObject({ options: ["Saturn", "Jupiter"], correct: [0, 1] });

    expect((await call("reorder_questions", { quizId: id, questionIds: [q2.id, q1.id, q0.id] })).data).toEqual([q2.id, q1.id, q0.id]);
    expect((await call("update_quiz", { id, title: "Space", settings: { shuffleAnswers: true } })).data).toMatchObject({
      title: "Space",
      settings: { shuffleQuestions: false, shuffleAnswers: true },
    });
    expect((await call("delete_question", { quizId: id, questionId: q0.id })).ok).toBe(true);
    expect(store.get(id).questions).toHaveLength(2);

    // images
    const png = join(t.dir, "x.png");
    writeFileSync(png, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]));
    const img = await call("set_question_image", { quizId: id, questionId: q1.id, path: png });
    expect(img.data.image).toMatch(/^media\/.*\.png$/);
    const img64 = await call("set_question_image", { quizId: id, questionId: q2.id, base64: "iVBORw0KGgoAAAABAgM=" });
    expect(img64.ok).toBe(true);
    expect((await call("remove_question_image", { quizId: id, questionId: q1.id })).data.image).toBeUndefined();

    expect((await call("delete_quiz", { id })).ok).toBe(true);
    expect(store.list()).toEqual([]);
  });

  test("validation errors come back as tool errors, not crashes", async () => {
    const bad = await call("create_quiz", { title: "Bad", questions: [{ type: "multiple_choice", text: "x", options: ["a", "b"], correct: [5] }] });
    expect(bad.ok).toBe(false);
    expect(bad.text).toContain("out of range");
    const missing = await call("get_quiz", { id: "nope-1234" });
    expect(missing.ok).toBe(false);
    const img = await call("set_question_image", { quizId: "nope-1234", questionId: "q1", path: "/x", url: "http://x" });
    expect(img.ok).toBe(false);
  });
});

describe("MCP over HTTP", () => {
  let srv: RunningServer;
  beforeAll(() => {
    srv = startServer({ store, port: 0, version: "test" });
  });
  afterAll(() => srv.stop());

  test("Streamable HTTP endpoint works on localhost", async () => {
    const c = new Client({ name: "http-test", version: "1" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${srv.port}/mcp`)));
    const r = (await c.callTool({ name: "create_quiz", arguments: { title: "Via HTTP" } })) as ToolResult;
    expect(r.isError).toBeFalsy();
    expect(store.list().some((q) => q.title === "Via HTTP")).toBe(true);
    await c.close();
  });
});
