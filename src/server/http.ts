import { existsSync } from "node:fs";
import type { Server } from "bun";
import adminPage from "../client/admin/index.html";
import hostPage from "../client/host/index.html";
import playerPage from "../client/player/index.html";
import { ValidationError } from "../shared/quiz-schema.ts";
import type { Clock } from "./game/game.ts";
import { handleMcpRequest } from "./mcp/http.ts";
import { isAdminRequest } from "./network.ts";
import { isCompiled } from "./paths.ts";
import { MAX_MEDIA_BYTES, MEDIA_MIME, NotFoundError, type QuizStore } from "./quiz/store.ts";
import { GameHub, type SocketData } from "./ws.ts";

export interface ServerOptions {
  store: QuizStore;
  port: number;
  version: string;
  /** Forced join address (--host). */
  address?: string;
  development?: boolean;
  clock?: Clock;
  log?: (msg: string) => void;
}

export interface RunningServer {
  server: Server<SocketData>;
  hub: GameHub;
  port: number;
  stop(): Promise<void>;
}

const json = (data: unknown, status = 200) => Response.json(data, { status });
const errorJson = (message: string, status: number) => json({ error: message }, status);

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

export function startServer(opts: ServerOptions): RunningServer {
  const { store, version } = opts;
  const log = opts.log ?? (() => {});
  const hub = new GameHub(store, { address: opts.address, clock: opts.clock, log });

  async function api(req: Request, url: URL): Promise<Response> {
    const path = url.pathname;
    const method = req.method;

    if (path === "/api/quizzes") {
      if (method === "GET") return json(store.list());
      if (method === "POST") return json(store.create(await readJson(req)), 201);
    }

    const m = path.match(/^\/api\/quizzes\/([^/]+)(\/duplicate)?$/);
    if (m) {
      const id = decodeURIComponent(m[1]!);
      if (m[2]) {
        if (method === "POST") return json(store.duplicate(id), 201);
      } else {
        if (method === "GET") return json(store.get(id));
        if (method === "PUT") return json(store.replace(id, await readJson(req)));
        if (method === "DELETE") {
          store.delete(id);
          return new Response(null, { status: 204 });
        }
      }
    }

    if (path === "/api/media" && method === "POST") {
      const len = Number(req.headers.get("content-length") ?? 0);
      if (len > MAX_MEDIA_BYTES) throw new ValidationError("Image is larger than 5 MB");
      const ref = store.saveMedia(new Uint8Array(await req.arrayBuffer()));
      return json({ ref }, 201);
    }

    if (path === "/api/info" && method === "GET") {
      return json({
        version,
        dataDir: store.dataDir,
        port: server.port,
        joinUrl: hub.joinUrl(),
        mcp: { httpUrl: `http://localhost:${server.port}/mcp`, stdioCommand: [process.execPath, ...(isCompiled() ? [] : [Bun.main]), "mcp", "--data-dir", store.dataDir] },
      });
    }

    if (path === "/api/results/latest.csv" && method === "GET") {
      const r = hub.lastResults;
      if (!r) return errorJson("No finished game yet", 404);
      return new Response(r.csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${r.file?.split(/[\\/]/).pop() ?? "results.csv"}"`,
        },
      });
    }

    return errorJson("Not found", 404);
  }

  const server: Server<SocketData> = Bun.serve<SocketData>({
    port: opts.port,
    hostname: "0.0.0.0",
    development: opts.development ?? false,
    routes: {
      "/": playerPage,
      "/admin": adminPage,
      "/host": hostPage,
    },
    async fetch(req, srv) {
      const url = new URL(req.url);
      const path = url.pathname;
      const admin = isAdminRequest(srv.requestIP(req)?.address, req.headers);

      if (path === "/ws") {
        if (srv.upgrade(req, { data: { admin, role: "player", playerId: null } })) return undefined;
        return new Response("Expected a WebSocket upgrade", { status: 426 });
      }

      if (path.startsWith("/media/")) {
        const file = store.mediaFile(path.slice(1));
        if (!file || !existsSync(file)) return new Response("Not found", { status: 404 });
        const ext = file.slice(file.lastIndexOf(".") + 1);
        return new Response(Bun.file(file), {
          headers: { "content-type": MEDIA_MIME[ext] ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
        });
      }

      if (path === "/mcp" || path.startsWith("/api/")) {
        if (!admin) return errorJson("Only available on the host computer via http://localhost", 403);
        try {
          if (path === "/mcp") return await handleMcpRequest(req, store, version);
          return await api(req, url);
        } catch (e) {
          if (e instanceof ValidationError) return errorJson(e.message, 400);
          if (e instanceof NotFoundError) return errorJson(e.message, 404);
          log(`API error ${req.method} ${path}: ${(e as Error).stack ?? e}`);
          return errorJson("Internal error", 500);
        }
      }

      return new Response("Not found", { status: 404 });
    },
    websocket: {
      maxPayloadLength: 16 * 1024,
      idleTimeout: 60,
      sendPings: true,
      open: (ws) => hub.onOpen(ws),
      message: (ws, msg) => hub.onMessage(ws, msg),
      close: (ws) => hub.onClose(ws),
    },
  });

  hub.port = server.port!;

  return {
    server,
    hub,
    port: server.port!,
    async stop() {
      hub.game?.dispose();
      await server.stop(true);
    },
  };
}
