import { Game } from "../../src/server/game/game.ts";
import { SiegeGame } from "../../src/server/game/siege.ts";
import { FakeClock, sampleQuiz } from "../../tests/helpers.ts";
const clock = new FakeClock();
const lobby = new Game(sampleQuiz({ title: "Christmas Toybox" }), { clock });
lobby.setMode("siege");
const player = lobby.join("Holly");
const game = SiegeGame.fromLobby(lobby, { clock });
game.start(); clock.advance(3000);
const fixture = { host: game.hostView(), phone: game.playerView(player.id) };
/** bun scripts/siege-preview/serve.ts — standalone host/phone artwork preview. */
import { resolve } from "node:path";
const outdir = "/tmp/quizzer-siege-preview";
const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, "host.tsx"), resolve(import.meta.dir, "phone.tsx")], outdir, target: "browser", splitting: true, loader: { ".webp": "file", ".mp3": "file" } });
if (!build.success) throw new Error(build.logs.join("\n"));
const server = Bun.serve({ port: 8095, hostname: "127.0.0.1", async fetch(req) {
  const path = new URL(req.url).pathname;
  if (path === "/fixture") return Response.json(fixture);
  if (path === "/" || path === "/phone") {
    const entry = path === "/phone" ? "phone" : "host";
    return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/${entry}.css"></head><body><div id="app"></div><script type="module" src="/${entry}.js"></script></body></html>`, { headers: { "Content-Type": "text/html" } });
  }
  if (path.includes("..")) return new Response("Not found", { status: 404 });
  const file = Bun.file(resolve(outdir, path.slice(1)));
  return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
} });
console.log(`Siege art preview: ${server.url}`);
