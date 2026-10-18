import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HTMLBundle } from "bun";
import { acceptsGzip, pageRoutes } from "../src/server/bundles.ts";

const dir = mkdtempSync(join(tmpdir(), "quizzer-bundles-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function file(name: string, loader: string, contentType: string, body: string | Uint8Array) {
  const path = join(dir, name);
  writeFileSync(path, body);
  return { input: "index.html", path, loader: loader as never, isEntry: true, headers: { etag: `tag-${name}`, "content-type": contentType } };
}

/** What the compiled exe sees: two pages sharing one chunk. */
function builtPages(): Record<string, HTMLBundle> {
  const js = file("chunk-shared.js", "js", "text/javascript;charset=utf-8", "console.log('hello');".repeat(200));
  const img = file("cat-abc123.webp", "file", "image/webp", new Uint8Array([82, 73, 70, 70, 1, 2, 3]));
  const a = file("index-a.html", "html", "text/html;charset=utf-8", "<!doctype html><script src=/chunk-shared.js></script>");
  const b = file("index-b.html", "html", "text/html;charset=utf-8", "<!doctype html><p>admin</p>");
  return { "/": { index: a.path, files: [a, js, img] }, "/admin": { index: b.path, files: [b, js] } };
}

const get = (accept?: string, etag?: string) =>
  new Request("http://x/", { headers: { ...(accept ? { "accept-encoding": accept } : {}), ...(etag ? { "if-none-match": etag } : {}) } });

describe("acceptsGzip", () => {
  test("reads Accept-Encoding, including q values and *", () => {
    expect(acceptsGzip(get("gzip, deflate"))).toBe(true);
    expect(acceptsGzip(get("br;q=1.0, gzip;q=0.8"))).toBe(true);
    expect(acceptsGzip(get("*"))).toBe(true);
    expect(acceptsGzip(get("gzip;q=0"))).toBe(false);
    expect(acceptsGzip(get("deflate, br"))).toBe(false);
    expect(acceptsGzip(get())).toBe(false);
  });
});

describe("pageRoutes", () => {
  test("running from source (no built file list) hands the pages to Bun unchanged", () => {
    const pages = { "/": { index: "index.html" } as HTMLBundle };
    expect(pageRoutes(pages)).toBe(pages);
  });

  test("routes every page and asset once", () => {
    expect(Object.keys(pageRoutes(builtPages())).sort()).toEqual(["/", "/admin", "/cat-abc123.webp", "/chunk-shared.js"]);
  });

  test("text is gzipped when accepted and plain otherwise", async () => {
    const routes = pageRoutes(builtPages()) as Record<string, (req: Request) => Response>;
    const plain = routes["/chunk-shared.js"]!(get());
    const zipped = routes["/chunk-shared.js"]!(get("gzip, deflate"));
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect(zipped.headers.get("content-encoding")).toBe("gzip");
    expect(zipped.headers.get("vary")).toBe("accept-encoding");
    expect(zipped.headers.get("cache-control")).toContain("immutable");
    const body = new Uint8Array(await zipped.arrayBuffer());
    expect(new TextDecoder().decode(Bun.gunzipSync(body))).toBe(await plain.text());
    expect(body.length).toBeLessThan(200);
  });

  test("pages are revalidated, images are never gzipped", () => {
    const routes = pageRoutes(builtPages()) as Record<string, (req: Request) => Response>;
    const page = routes["/"]!(get("gzip"));
    expect(page.headers.get("cache-control")).toBe("no-cache");
    expect(page.headers.get("content-type")).toBe("text/html;charset=utf-8");
    const img = routes["/cat-abc123.webp"]!(get("gzip"));
    expect(img.headers.get("content-encoding")).toBeNull();
    expect(img.headers.get("content-type")).toBe("image/webp");
  });

  test("a matching If-None-Match gets 304, and the gzip and plain copies have different ETags", () => {
    const routes = pageRoutes(builtPages()) as Record<string, (req: Request) => Response>;
    const etag = routes["/chunk-shared.js"]!(get("gzip")).headers.get("etag")!;
    expect(etag).not.toBe(routes["/chunk-shared.js"]!(get()).headers.get("etag"));
    expect(routes["/chunk-shared.js"]!(get("gzip", etag)).status).toBe(304);
    expect(routes["/chunk-shared.js"]!(get(undefined, etag)).status).toBe(200);
  });
});
