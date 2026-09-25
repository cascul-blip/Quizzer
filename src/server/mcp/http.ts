import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { QuizStore } from "../quiz/store.ts";
import { createMcpServer } from "./tools.ts";

/** Stateless Streamable HTTP: a fresh server + transport per request, JSON responses only. */
export async function handleMcpRequest(req: Request, store: QuizStore, version: string): Promise<Response> {
  const server = createMcpServer(store, version);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } finally {
    await transport.close();
    await server.close();
  }
}
