import { existsSync } from "node:fs";
import type { Server } from "bun";
import adminPage from "../client/admin/index.html";
import hostPage from "../client/host/index.html";
import playerPage from "../client/player/index.html";
import { MUSIC_EXTENSIONS } from "../shared/music-tracks.ts";
import { BASE_VERSION_HEADER, QUIZ_REVISION_HEADER } from "../shared/quiz-constants.ts";
import { ValidationError } from "../shared/quiz-schema.ts";
import { pageRoutes } from "./bundles.ts";
import type { Clock } from "./game/classic.ts";
import { handleMcpRequest } from "./mcp/http.ts";
import { isAdminRequest } from "./network.ts";
import { isCompiled } from "./paths.ts";
import type { QuizStore } from "./quiz/store.ts";
import { ConflictError, MAX_MEDIA_BYTES, MEDIA_MIME, NotFoundError } from "./quiz/store.ts";
import type { SocketData } from "./ws.ts";
import { GameHub } from "./ws.ts";

interface ServerOptions {
  store: QuizStore;
  port: number;
  version: string;
  forcedAddress?: string;
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

function decodePath(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

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
  const hub = new GameHub(store, { forcedAddress: opts.forcedAddress, clock: opts.clock, log });

  async function api(req: Request, url: URL): Promise<Response> {
    const path = url.pathname;
    const method = req.method;

    if (path === "/api/quizzes") {
      if (method === "GET") return json(store.list());
      if (method === "POST") return json(await store.create(await readJson(req)), 201);
    }

    const m = path.match(/^\/api\/quizzes\/([^/]+)(\/duplicate)?$/);
    if (m) {
      const id = decodePath(m[1]!);
      if (id === null) return errorJson("Quiz not found", 404);
      if (m[2]) {
        if (method === "POST") return json(await store.duplicate(id), 201);
      } else {
        if (method === "GET") return json(store.get(id));
        if (method === "PUT") {
          const revision = req.headers.get(QUIZ_REVISION_HEADER);
          const base = revision === null ? (req.headers.get(BASE_VERSION_HEADER) ?? undefined) : { revision };
          return json(await store.replace(id, await readJson(req), base));
        }
        if (method === "DELETE") {
          await store.delete(id);
          return new Response(null, { status: 204 });
        }
      }
    }

    if (path === "/api/media" && method === "POST") {
      const len = Number(req.headers.get("content-length") ?? 0);
      if (len > MAX_MEDIA_BYTES) throw new ValidationError("Image is larger than 5 MB");
      const ref = await store.saveMedia(new Uint8Array(await req.arrayBuffer()));
      return json({ ref }, 201);
    }

    if (path === "/api/music" && method === "GET") {
      const files = Object.fromEntries(Object.entries(store.musicFiles()).map(([id, name]) => [id, `/music/${encodeURIComponent(name)}`]));
      return json({ dir: store.musicDir, files });
    }

    if (path === "/api/info" && method === "GET") {
      return json({
        version,
        dataDir: store.dataDir,
        musicDir: store.musicDir,
        port: server.port,
        joinUrl: hub.join.url(),
        mcp: {
          httpUrl: `http://localhost:${server.port}/mcp`,
          stdioCommand: [process.execPath, ...(isCompiled() ? [] : [Bun.main]), "mcp", "--data-dir", store.dataDir],
        },
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
    routes: pageRoutes({ "/": playerPage, "/admin": adminPage, "/host": hostPage }),
    async fetch(req, srv) {
      const url = new URL(req.url);
      const path = url.pathname;
      const ip = srv.requestIP(req)?.address ?? "";
      const admin = isAdminRequest(ip, req.headers);

      if (path === "/ws") {
        if (hub.socketLimitReached(ip)) return new Response("Too many connections from this device", { status: 429 });
        if (srv.upgrade(req, { data: { admin, ip, role: "player" } })) return undefined;
        return new Response("Expected a WebSocket upgrade", { status: 426 });
      }

      if (path.startsWith("/music/")) {
        const name = decodePath(path.slice("/music/".length));
        const file = name === null ? null : store.musicFile(name);
        if (!file) return new Response("Not found", { status: 404 });
        const ext = name!.slice(name!.lastIndexOf(".") + 1).toLowerCase();
        return new Response(Bun.file(file), { headers: { "content-type": MUSIC_EXTENSIONS[ext] ?? "application/octet-stream", "cache-control": "no-cache" } });
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
          if (e instanceof ConflictError) return errorJson(e.message, 409);
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
      // why: halves the Wi-Fi traffic to phones; the shared compressor measured smaller than per-socket windows.
      perMessageDeflate: true,
      open: (ws) => hub.onOpen(ws),
      message: (ws, msg) => hub.onMessage(ws, msg),
      drain: (ws) => hub.onDrain(ws),
      close: (ws) => hub.onClose(ws),
    },
  });

  hub.join.port = server.port!;

  return {
    server,
    hub,
    port: server.port!,
    async stop() {
      hub.closeGame();
      await server.stop(true);
    },
  };
}
