/** Local offline-audio QA using the production sequencer and sampled instruments. */
import { resolve } from "node:path";
const outdir = "/tmp/quizzer-siege-music-preview";
const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, "../winter-art/music-preview.ts")], outdir, target: "browser", loader: { ".mp3": "file" } });
if (!build.success) throw new Error(build.logs.join("\n"));
const server = Bun.serve({ hostname: "127.0.0.1", port: 8092, async fetch(req) {
  const path = new URL(req.url).pathname;
  if (path === "/") return new Response('<!doctype html><title>Patapan audio review</title><script type="module" src="/music-preview.js"></script>', { headers: { "Content-Type": "text/html" } });
  if (path.includes("..")) return new Response("Not found", { status: 404 });
  const file = Bun.file(resolve(outdir, path.slice(1)));
  return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
} });
console.log(`Patapan audio review: ${server.url}`);
