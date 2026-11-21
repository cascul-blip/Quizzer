import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { SHARED_MODES } from "../src/shared/mode-entries.ts";

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

/** The client files that look a mode up in its entry (src/client/host/modes.tsx or src/client/player/modes.tsx) or its shared mode entry (src/shared/mode-entries.ts) instead of asking which mode is running. */
const CLIENT_FILES = ["src/client/host/main.tsx", "src/client/host/lobby.tsx", "src/client/host/music-cues.ts", "src/client/player/main.tsx"].map((path) =>
  read(join(ROOT, path)),
);

const QUOTE = "[\"'`]";
const MODE = `${QUOTE}(?:${Object.keys(SHARED_MODES).join("|")})${QUOTE}`;
/** mode === "tower", game.runningMode !== "siege", "duel" === mode, and the same with ' or `. */
const MODE_LITERAL = new RegExp(`\\b\\w*[mM]ode\\s*[!=]==?\\s*${QUOTE}|${QUOTE}\\w*${QUOTE}\\s*[!=]==?\\s*[\\w.]*[mM]ode\\b`);
/** view.kind === "tower", view.mode !== "siege", view.banner === "siege", "duel" === view.kind, and case "racer":. */
const CLIENT_MODE_LITERAL = new RegExp(
  `\\b\\w*(?:[mM]ode|[kK]ind|[bB]anner)\\s*[!=]==?\\s*${MODE}|${MODE}\\s*[!=]==?\\s*[\\w.]*(?:[mM]ode|[kK]ind|[bB]anner)\\b|\\bcase\\s+${MODE}\\s*:`,
);

/** Every line matching the pattern, as file:line and the line itself. */
function offending(pattern: RegExp, files: Source[] = sources): string[] {
  return files.flatMap(({ path, lines }) => lines.flatMap((line, i) => (pattern.test(line) ? [`${relative(ROOT, path)}:${i + 1}: ${line.trim()}`] : [])));
}

/** The classes that run a game mode, read from the game files: ClassicGame and every other mode game. */
const gameClasses = sources
  .filter(({ path }) => path.startsWith(join(SERVER, "game")))
  .flatMap(({ lines }) => lines.flatMap((line) => [...line.matchAll(/export class (\w*Game)\b/g)].map((m) => m[1]!)));

// A mode's server behaviour belongs in its entry (src/server/game/<mode>.ts, collected in MODES);
// code outside it looks the entry up by game.runningMode instead of asking which mode is running.
describe("Coding standards: mode entries", () => {
  test("finds the game classes", () => {
    expect(gameClasses).toContain("ClassicGame");
    expect(gameClasses).toContain("TowerGame");
  });

  test("no code compares a mode against a literal", () => {
    expect(offending(MODE_LITERAL)).toEqual([]);
  });

  test("no client file that uses the mode entries compares a view's kind, mode or banner against a game mode", () => {
    expect(offending(CLIENT_MODE_LITERAL, CLIENT_FILES)).toEqual([]);
  });

  test("server code does not ask which game class is running", () => {
    const pattern = new RegExp(`\\binstanceof\\s+(${gameClasses.join("|")})\\b`);
    expect(offending(pattern)).toEqual([]);
  });
});

/** HubSocket owns opening in-memory sockets. */
const DIRECT_SOCKET_OPEN = /\.\s*onOpen\s*\(/;
/** A temp directory cleaned up in a test's own finally block instead of an afterEach. */
const FINALLY_CLEANUP = /\bfinally\s*\{[^}]*\.cleanup\(\)/;
/** Find fixture declarations or assignments at the describe callback's own indentation. */
function describeTempDirs(text: string): number[] {
  const lines = text.split("\n");
  const matches: number[] = [];
  for (const [index, line] of lines.entries()) {
    const describe = /^( *)describe\s*\(.*=>\s*\{\s*$/.exec(line);
    if (!describe) continue;
    const indent = describe[1] + "  ";
    for (let body = index + 1; body < lines.length; body++) {
      const statement = lines[body]!;
      if (!statement.trim()) continue;
      if (!statement.startsWith(indent)) break;
      if (/^(?:(?:const|let|var) +)?\w+\s*=\s*tempDir\s*\(/.test(statement.slice(indent.length))) matches.push(body + 1);
    }
  }
  return matches;
}

/** The multi-word _Avoid_ phrases in GLOSSARY.md, such as "results CSV". Single words like "board" have legitimate other uses, so the reviewer judges those. */
const AVOIDED_PHRASES = [...readFileSync(join(ROOT, "GLOSSARY.md"), "utf8").matchAll(/^_Avoid_: (.*)$/gm)].flatMap((m) =>
  m[1]!
    .replace(/\(.*?\)/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes(" ")),
);

/** The titles of every test and describe block in the file. */
function titles(text: string): string[] {
  return [...text.matchAll(/\b(?:test|describe)\((["'`])(.*?)\1/g)].map((m) => m[2]!);
}

const testFiles = readdirSync(join(ROOT, "tests"))
  // This file is left out: its guard checks quote the pattern.
  .filter((name) => /\.test\.tsx?$/.test(name) && name !== "standards.test.ts")
  .map((name) => ({ path: `tests/${name}`, text: readFileSync(join(ROOT, "tests", name), "utf8") }));

/** Bun.sleep or a timer-based pause used as a wait in a test. */
const SLEEP_WAIT = /\bBun\s*\.\s*sleep\s*\(/;

describe("Coding standards: tests", () => {
  test("finds the test files", () => {
    expect(testFiles.some(({ path }) => path === "tests/store.test.ts")).toBe(true);
  });

  test("hub tests open in-memory sockets through HubSocket", () => {
    expect(testFiles.filter(({ text }) => DIRECT_SOCKET_OPEN.test(text)).map(({ path }) => path)).toEqual([]);
  });

  test("the socket guard flags direct onOpen calls", () => {
    expect(DIRECT_SOCKET_OPEN.test("hub.onOpen(socket)")).toBe(true);
    expect(DIRECT_SOCKET_OPEN.test("new HubSocket(hub)")).toBe(false);
  });

  test("tests wait on an event or the controlled clock, not on Bun.sleep", () => {
    expect(testFiles.filter(({ text }) => SLEEP_WAIT.test(text)).map(({ path }) => path)).toEqual([]);
  });

  test("the sleep guard flags Bun.sleep and accepts awaiting an event", () => {
    expect(SLEEP_WAIT.test("await Bun.sleep(100);")).toBe(true);
    expect(SLEEP_WAIT.test("await nextQr();")).toBe(false);
  });

  test("shared temp directories are created in setup hooks", () => {
    expect(testFiles.flatMap(({ path, text }) => describeTempDirs(text).map((line) => `${path}:${line}`))).toEqual([]);
  });

  test("the fixture guard flags direct describe setup and accepts a setup hook", () => {
    expect(describeTempDirs('describe("hub", () => {\n  const t = tempDir();\n});')).toEqual([2]);
    expect(describeTempDirs('  describe("hub", () => {\n    let t;\n    t = tempDir();\n  });')).toEqual([3]);
    expect(describeTempDirs('describe("hub", () => {\n  beforeEach(() => {\n    t = tempDir();\n  });\n});')).toEqual([]);
    expect(describeTempDirs('describe("hub", () => {\n  beforeAll(() => { t = tempDir(); });\n});')).toEqual([]);
  });

  test("test and describe titles use glossary terms, not the phrases GLOSSARY.md says to avoid", () => {
    expect(AVOIDED_PHRASES).toContain("results CSV");
    const found = testFiles.flatMap(({ path, text }) =>
      titles(text).flatMap((title) =>
        AVOIDED_PHRASES.filter((p) => title.toLowerCase().includes(p.toLowerCase())).map((p) => `${path}: "${title}" uses "${p}"`),
      ),
    );
    expect(found).toEqual([]);
  });

  test("the title guard reads test and describe titles", () => {
    expect(titles("describe(\"Lobby handoff\", () => {\n  test('the results CSV', () => {});")).toEqual(["Lobby handoff", "the results CSV"]);
  });

  test("shared fixtures are cleaned up in afterEach or afterAll, not in a test's finally block", () => {
    expect(testFiles.filter(({ text }) => FINALLY_CLEANUP.test(text)).map(({ path }) => path)).toEqual([]);
  });

  test("the guard flags a finally block that cleans up a temp directory", () => {
    expect(FINALLY_CLEANUP.test("    } finally {\n      t.cleanup();\n    }")).toBe(true);
    expect(FINALLY_CLEANUP.test("    } finally {\n      host.close();\n    }")).toBe(false);
    expect(FINALLY_CLEANUP.test("afterEach(() => t.cleanup());")).toBe(false);
  });
});

describe("Coding standards: the mode-literal guards themselves", () => {
  // Written by hand: a guard that stops matching passes every file, so check it against lines it must and mustn't flag.
  test("the server guard flags a mode compared against a literal", () => {
    for (const line of [`if (mode === "tower")`, `game.runningMode !== 'siege'`, `"duel" === mode`]) expect(MODE_LITERAL.test(line)).toBe(true);
    for (const line of [`const mode = "tower";`, `MODES[game.runningMode]`]) expect(MODE_LITERAL.test(line)).toBe(false);
  });

  test("the client guard flags a view's kind, mode or banner compared against a game mode", () => {
    for (const line of [`view.kind === "classic"`, `view.mode !== "siege"`, `view.banner === "siege"`, `"duel" === view.kind`, `case "racer":`])
      expect(CLIENT_MODE_LITERAL.test(line)).toBe(true);
    for (const line of [`role: "player"`, `view.phase === "lobby"`, `view.kind === "none"`, `view.kind === "idle"`])
      expect(CLIENT_MODE_LITERAL.test(line)).toBe(false);
  });
});

/** The relative imports of a source file, type-only ones included, as absolute paths. */
function importsOf(path: string): string[] {
  const text = readFileSync(path, "utf8");
  const specs = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g)].map((m) => m[1]!);
  return specs.map((spec) => resolve(dirname(path), spec));
}

/** Every import cycle under src/, each written once as a.ts -> b.ts -> a.ts. */
function importCycles(): string[] {
  const files = srcFiles(join(ROOT, "src"));
  const known = new Set(files);
  const graph = new Map(files.map((f) => [f, importsOf(f).filter((g) => known.has(g))]));
  const cycles = new Set<string>();
  const state = new Map<string, "open" | "done">();
  const stack: string[] = [];
  const visit = (f: string) => {
    state.set(f, "open");
    stack.push(f);
    for (const g of graph.get(f)!) {
      if (state.get(g) === "open") {
        const loop = stack.slice(stack.indexOf(g)).map((p) => relative(ROOT, p));
        const start = loop.indexOf([...loop].sort()[0]!);
        const turned = [...loop.slice(start), ...loop.slice(0, start)];
        cycles.add([...turned, turned[0]].join(" -> "));
      } else if (!state.has(g)) visit(g);
    }
    stack.pop();
    state.set(f, "done");
  };
  for (const f of files) if (!state.has(f)) visit(f);
  return [...cycles].sort();
}

function srcFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return srcFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * The mode entries and their shared types import one another.
 * These cycles predate the check; remove a line when a refactor breaks its cycle. Add none.
 */
const KNOWN_CYCLES = [
  "src/server/game/cup.ts -> src/server/game/mode-entry.ts -> src/server/game/cup.ts",
  "src/server/game/duel.ts -> src/server/game/mode-entry.ts -> src/server/game/duel.ts",
  "src/server/game/fight.ts -> src/server/game/mode-entry.ts -> src/server/game/fight.ts",
  "src/server/game/gift.ts -> src/server/game/mode-entry.ts -> src/server/game/gift.ts",
  "src/server/game/land.ts -> src/server/game/mode-entry.ts -> src/server/game/land.ts",
  "src/server/game/mode-entry.ts -> src/server/game/racer.ts -> src/server/game/mode-entry.ts",
  "src/server/game/mode-entry.ts -> src/server/game/robot.ts -> src/server/game/mode-entry.ts",
  "src/server/game/mode-entry.ts -> src/server/game/siege.ts -> src/server/game/mode-entry.ts",
  "src/server/game/mode-entry.ts -> src/server/game/submarine.ts -> src/server/game/mode-entry.ts",
  "src/server/game/mode-entry.ts -> src/server/game/tower.ts -> src/server/game/mode-entry.ts",
];

// Imports point one way: a module that imports another, even only for a type, is never imported back.
// Move the shared piece down into the lower module (or a new one) instead.
describe("Coding standards: import graph", () => {
  test("finds the client's imports", () => {
    expect(importsOf(join(ROOT, "src/client/player/modes.tsx"))).toContain(join(ROOT, "src/client/player/common.tsx"));
  });

  test("no module imports itself back through another", () => {
    expect(importCycles().filter((c) => !KNOWN_CYCLES.includes(c))).toEqual([]);
  });

  test("every known cycle still exists, so a broken one leaves the list", () => {
    expect(KNOWN_CYCLES.filter((c) => !importCycles().includes(c))).toEqual([]);
  });
});

/** A cast of Object.keys to a key type, which claims the type without checking it. */
const KEYS_CAST = /\bObject\.keys\([^)]*\)\s*as\b/;

function codeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return codeFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

// A table's keys come from keysOf (src/shared/keys-of.ts), which checks each key against the table.
describe("Coding standards: checked casts", () => {
  test("no code casts Object.keys", () => {
    const files = ["src", "tests"].flatMap((d) => codeFiles(join(ROOT, d))).map(read);
    expect(offending(KEYS_CAST, files)).toEqual([]);
  });
});
