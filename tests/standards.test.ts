import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { MODE_NAMES } from "../src/shared/mode-names.ts";

const ROOT = resolve(import.meta.dir, "..");
const SERVER = join(ROOT, "src/server");

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [path] : [];
  });
}

type Source = { path: string; lines: string[] };

const read = (path: string): Source => ({ path, lines: readFileSync(path, "utf8").split("\n") });

const sources = tsFiles(SERVER).map(read);

/** The client files that look a mode up in its entry (src/client/host/modes.tsx, src/client/host/lobby-modes.tsx, src/client/player/modes.tsx) or its flags (src/shared/mode-flags.ts) instead of asking which mode is running. */
const CLIENT_FILES = ["src/client/host/main.tsx", "src/client/host/lobby.tsx", "src/client/player/main.tsx"].map((path) => read(join(ROOT, path)));

/** Every line matching the pattern, as file:line and the line itself. */
function offending(pattern: RegExp, files: Source[] = sources): string[] {
  return files.flatMap(({ path, lines }) =>
    lines.flatMap((line, i) => (pattern.test(line) ? [`${relative(ROOT, path)}:${i + 1}: ${line.trim()}`] : [])),
  );
}

/** The classes that run a game mode, read from the game files: Game (Classic and the lobby) and every XGame. */
const gameClasses = sources
  .filter(({ path }) => path.startsWith(join(SERVER, "game")))
  .flatMap(({ lines }) => lines.flatMap((line) => [...line.matchAll(/export class (\w*Game)\b/g)].map((m) => m[1]!)));

// A mode's server behaviour belongs in its entry (src/server/game/<mode>.ts, collected in MODES);
// code outside it looks the entry up by game.runningMode instead of asking which mode is running.
describe("Coding standards: mode entries", () => {
  test("finds the game classes", () => {
    expect(gameClasses).toContain("Game");
    expect(gameClasses).toContain("TowerGame");
  });

  test("no code compares a mode against a literal", () => {
    // mode === "tower", game.runningMode !== "siege", "duel" === mode, and the same with ' or `.
    const quote = "[\"'`]";
    const pattern = new RegExp(`\\b\\w*[mM]ode\\s*[!=]==?\\s*${quote}|${quote}\\w*${quote}\\s*[!=]==?\\s*[\\w.]*[mM]ode\\b`);
    expect(offending(pattern)).toEqual([]);
  });

  test("no client file that uses the mode entries compares a view's kind, mode or banner against a game mode", () => {
    // view.kind === "tower", view.mode !== "siege", view.banner === "siege", "duel" === view.kind, and case "racer":.
    const quote = "[\"'`]";
    const mode = `${quote}(?:${Object.keys(MODE_NAMES).join("|")})${quote}`;
    const pattern = new RegExp(`\\b\\w*(?:[mM]ode|[kK]ind|[bB]anner)\\s*[!=]==?\\s*${mode}|${mode}\\s*[!=]==?\\s*[\\w.]*(?:[mM]ode|[kK]ind|[bB]anner)\\b|\\bcase\\s+${mode}\\s*:`);
    expect(offending(pattern, CLIENT_FILES)).toEqual([]);
  });

  test("no code asks which game class is running", () => {
    const pattern = new RegExp(`\\binstanceof\\s+(${gameClasses.join("|")})\\b`);
    expect(offending(pattern)).toEqual([]);
  });
});
