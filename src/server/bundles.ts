import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { HTMLBundle } from "bun";

type Handler = (req: Request) => Response;

const TEXT_LOADERS = new Set(["html", "js", "css"]);

// why: q=0 in Accept-Encoding rules gzip out even when it is listed.
export function acceptsGzip(req: Request): boolean {
  const header = req.headers.get("accept-encoding");
  if (!header) return false;
  return header.split(",").some((part) => {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    if (name !== "gzip" && name !== "*") return false;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    return q === undefined || Number(q.slice(2)) > 0;
  });
}

function fileHandler(file: NonNullable<HTMLBundle["files"]>[number], cacheControl: string): Handler {
  const text = TEXT_LOADERS.has(file.loader);
  const raw = text ? new Uint8Array(readFileSync(file.path)) : null;
  const gzipped = raw ? Bun.gzipSync(raw, { level: 9 }) : null;
  const headers = { "content-type": file.headers["content-type"], "cache-control": cacheControl, ...(gzipped ? { vary: "accept-encoding" } : {}) };
  return (req) => {
    const gzip = gzipped !== null && acceptsGzip(req);
    const etag = `"${file.headers.etag}${gzip ? "-gz" : ""}"`;
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ...headers, etag } });
    if (gzip) return new Response(gzipped, { headers: { ...headers, etag, "content-encoding": "gzip" } });
    return new Response(raw ?? Bun.file(file.path), { headers: { ...headers, etag } });
  };
}

export function pageRoutes(pages: Record<string, HTMLBundle>): Record<string, HTMLBundle | Handler> {
  const bundles = Object.values(pages);
  if (!bundles.every((b) => b.files)) return pages;
  const routes: Record<string, HTMLBundle | Handler> = {};
  for (const [path, bundle] of Object.entries(pages)) {
    for (const file of bundle.files!) {
      if (file.path === bundle.index) routes[path] = fileHandler(file, "no-cache");
      else if (file.loader !== "html") routes[`/${basename(file.path)}`] ??= fileHandler(file, "public, max-age=31536000, immutable");
    }
  }
  return routes;
}
