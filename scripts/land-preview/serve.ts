/** bun scripts/land-preview/serve.ts — standalone host/phone artwork preview. */
import { resolve } from "node:path";
const outdir = "/tmp/quizzer-land-preview";
const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, "host.tsx"), resolve(import.meta.dir, "phone.tsx"), resolve(import.meta.dir, "music.ts")], outdir, target: "browser", splitting: true, loader: { ".webp": "file", ".mp3": "file" } });
if (!build.success) throw new Error(build.logs.join("\n"));
const server = Bun.serve({ port: 8095, hostname: "127.0.0.1", async fetch(req) {
  const path = new URL(req.url).pathname;
  if (path === "/" || path === "/phone" || path === "/music") {
    const entry = path === "/music" ? "music" : path === "/phone" ? "phone" : "host";
    return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${entry === "music" ? "" : `<link rel="stylesheet" href="/${entry}.css">`}</head><body><div id="app"></div><script type="module" src="/${entry}.js"></script></body></html>`, { headers: { "Content-Type": "text/html" } });
  }
  if (path.includes("..")) return new Response("Not found", { status: 404 });
  const file = Bun.file(resolve(outdir, path.slice(1)));
  return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
} });
console.log(`Land art preview: ${server.url}`);
