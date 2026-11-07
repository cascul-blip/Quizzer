import { resolve } from "node:path";
import { Game } from "../../src/server/game/game.ts";
import { DuelGame, INTRO_MS } from "../../src/server/game/duel.ts";
import { FakeClock, sampleQuiz } from "../../tests/helpers.ts";
const clock = new FakeClock();
const lobby = new Game(sampleQuiz({ title: "North Pole Snowball Showdown" }), { clock });
lobby.setMode("duel");
const avatars = ["penguin", "polarbear", "cat", "reindeer", "snowman", "robot", "fox", "bear", "kid1"] as const;
for (const [i, name] of ["Holly", "Noel", "Ivy", "Nicholas", "Robin", "Carol", "Frost", "Rudolph", "Snowdrop"].entries()) {
  const p = lobby.join(name); p.avatar = { avatar: avatars[i]!, accessory: "none" };
}
const game = DuelGame.fromLobby(lobby, { clock, rng: () => .99999 });
game.start();
const phoneId = [...game.players.keys()][1]!;
const fixture: Record<string, unknown> = {};
const capture = (phase: string) => { fixture[phase] = { host: game.hostView(), phone: game.playerView(phoneId) }; };
capture("intro"); clock.advance(INTRO_MS); capture("open");
for (const [i, p] of [...game.players.values()].entries()) {
  clock.advance(100);
  const q = game.currentQuestion!;
  game.answer(p.id, game.qIndex, i % 2 === 0 ? q.correct[0]! : q.options.findIndex((_, i) => !q.correct.includes(i)));
}
capture("reveal"); game.end(); capture("podium");
const outdir = "/tmp/quizzer-snowball-game-preview";
const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, "game-host.tsx"), resolve(import.meta.dir, "game-phone.tsx")], outdir, target: "browser", splitting: true, loader: { ".webp": "file", ".mp3": "file" } });
if (!build.success) throw new Error(build.logs.join("\n"));
const server = Bun.serve({ port: 8102, hostname: "127.0.0.1", async fetch(req) {
  const path = new URL(req.url).pathname;
  if (path === "/fixture") return Response.json(fixture);
  if (path === "/" || path === "/phone") {
    const entry = path === "/phone" ? "game-phone" : "game-host";
    return new Response(`<!doctype html><html lang="en"><head><title>Snowball Showdown game review</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/${entry}.css"></head><body><div id="app"></div><script type="module" src="/${entry}.js"></script></body></html>`, { headers: { "Content-Type": "text/html" } });
  }
  if (path.includes("..")) return new Response("Not found", { status: 404 });
  const file = Bun.file(resolve(outdir, path.slice(1)));
  return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
} });
console.log(`Production Snowball Showdown review: ${server.url}`);
