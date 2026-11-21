import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SERVER = join(ROOT, "src/server");

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [path] : [];
  });
}

const sources = tsFiles(SERVER).map((path) => ({ path, lines: readFileSync(path, "utf8").split("\n") }));

/** Every line matching the pattern, as file:line and the line itself. */
function offending(pattern: RegExp): string[] {
  return sources.flatMap(({ path, lines }) =>
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

  test("no code asks which game class is running", () => {
    const pattern = new RegExp(`\\binstanceof\\s+(${gameClasses.join("|")})\\b`);
    expect(offending(pattern)).toEqual([]);
  });
});
