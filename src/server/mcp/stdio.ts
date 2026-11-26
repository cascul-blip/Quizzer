import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { QuizStore } from "../quiz/store.ts";
import { createMcpServer } from "./tools.ts";

// why: stdout carries the MCP protocol, so nothing else may write to it in this mode.
export async function runStdioMcp(store: QuizStore, version: string): Promise<void> {
  const server = createMcpServer(store, version);
  await server.connect(new StdioServerTransport());
  console.error(`Quizzer MCP server (stdio) ready. Data: ${store.dataDir}`);
}
