import { resolve, sep } from "node:path";
const outdir = "/tmp/quizzer-duel-christmas-preview";
const assets = resolve(import.meta.dir, "../../output/duel-christmas-prototype");
const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, "preview.tsx")], outdir, target: "browser", external: ["/art/*"], loader: { ".webp": "file" } });
if (!build.success) throw new Error(build.logs.join("\n"));
const server = Bun.serve({ port: 8101, hostname: "127.0.0.1", async fetch(req) {
  const path = decodeURIComponent(new URL(req.url).pathname);
  if (path === "/") return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Snowball Showdown prototype</title><link rel="stylesheet" href="/preview.css"></head><body><div id="app"></div><script type="module" src="/preview.js"></script></body></html>`, { headers: { "Content-Type": "text/html" } });
  const root = path.startsWith("/art/") ? assets : outdir;
  const filePath = resolve(root, path.replace(/^\/art\//, "").replace(/^\//, ""));
  if (!filePath.startsWith(root + sep)) return new Response("Not found", { status: 404 });
  const file = Bun.file(filePath);
  return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
} });
console.log(`Snowball prototype: ${server.url}`);
