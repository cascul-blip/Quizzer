import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { SHARED_MODES } from "../src/shared/mode-entries.ts";
import { isNamedTimeField } from "../src/shared/view-time-fields.ts";

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

const CLIENT_FILES = ["src/client/host/main.tsx", "src/client/host/lobby.tsx", "src/client/host/music-cues.ts", "src/client/player/main.tsx"].map((path) =>
  read(join(ROOT, path)),
);

const QUOTE = "[\"'`]";
const MODE = `${QUOTE}(?:${Object.keys(SHARED_MODES).join("|")})${QUOTE}`;
const MODE_LITERAL = new RegExp(`\\b\\w*[mM]ode\\s*[!=]==?\\s*${QUOTE}|${QUOTE}\\w*${QUOTE}\\s*[!=]==?\\s*[\\w.]*[mM]ode\\b`);
const CLIENT_MODE_LITERAL = new RegExp(
  `\\b\\w*(?:[mM]ode|[kK]ind|[bB]anner)\\s*[!=]==?\\s*${MODE}|${MODE}\\s*[!=]==?\\s*[\\w.]*(?:[mM]ode|[kK]ind|[bB]anner)\\b|\\bcase\\s+${MODE}\\s*:`,
);

function offending(pattern: RegExp, files: Source[] = sources): string[] {
  return files.flatMap(({ path, lines }) => lines.flatMap((line, i) => (pattern.test(line) ? [`${relative(ROOT, path)}:${i + 1}: ${line.trim()}`] : [])));
}

const gameClasses = sources
  .filter(({ path }) => path.startsWith(join(SERVER, "game")))
  .flatMap(({ lines }) => lines.flatMap((line) => [...line.matchAll(/export class (\w*Game)\b/g)].map((m) => m[1]!)));

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

/** why: server timing goes through the injected Clock (src/server/game/common.ts) so tests can control it. */
const REAL_TIME = /(?<![.\w])(?:setTimeout|clearTimeout|setInterval|clearInterval)\s*\(|\bDate\s*\.\s*now\s*\(/;
/** why: realClock is the one real adapter; the quiz store stamps revisions with wall time, which no game rule reads. */
const REAL_TIME_ALLOWED = ["src/server/game/common.ts", "src/server/quiz/store.ts"];

describe("Coding standards: server time", () => {
  test("server code reads time and sets timers through the injected Clock", () => {
    const files = sources.filter(({ path }) => !REAL_TIME_ALLOWED.includes(relative(ROOT, path)));
    expect(offending(REAL_TIME, files)).toEqual([]);
  });

  test("the time guard flags real timers and Date.now, and accepts the Clock", () => {
    expect(REAL_TIME.test("this.timer = setTimeout(() => this.flush(), 100);")).toBe(true);
    expect(REAL_TIME.test("clearTimeout(this.timer);")).toBe(true);
    expect(REAL_TIME.test("const now = Date.now();")).toBe(true);
    expect(REAL_TIME.test("this.timer = this.clock.setTimeout(() => this.flush(), 100);")).toBe(false);
    expect(REAL_TIME.test("this.clock.clearTimeout(this.timer);")).toBe(false);
  });
});

const CLOCK_TIMER = /\bclock\s*\.\s*(?:setTimeout|clearTimeout)\b/;
const OWN_PHASE_TIME =
  /^\s*(?:(?:private|protected|public|readonly|static|override|get)\s+)*(?:remainingMs\s*(?:\(\s*\)|=)|phase(?:EndsAt|Deadline|Timer|Timeout|Start(?:edAt)?)\s*\??\s*[:=])/;

describe("Coding standards: phase timer", () => {
  test("no game mode file sets or clears a timer on the Clock directly", () => {
    const files = sources.filter(
      ({ path }) => path.startsWith(join(SERVER, "game")) && !["common.ts", "phase-timer.ts"].includes(relative(join(SERVER, "game"), path)),
    );
    expect(files.length).toBeGreaterThan(10);
    expect(offending(CLOCK_TIMER, files)).toEqual([]);
  });

  test("no game mode file keeps its own phase deadline or remainingMs method", () => {
    const files = sources.filter(
      ({ path }) => path.startsWith(join(SERVER, "game")) && !["common.ts", "phase-timer.ts"].includes(relative(join(SERVER, "game"), path)),
    );
    expect(offending(OWN_PHASE_TIME, files)).toEqual([]);
  });

  test("the phase time guard flags a remainingMs method or phase deadline field and accepts reading the phase timer", () => {
    expect(OWN_PHASE_TIME.test("  private remainingMs(): number {")).toBe(true);
    expect(OWN_PHASE_TIME.test("  remainingMs() {")).toBe(true);
    expect(OWN_PHASE_TIME.test("  private get remainingMs(): number {")).toBe(true);
    expect(OWN_PHASE_TIME.test("  private remainingMs = () => this.phases.remainingMs();")).toBe(true);
    expect(OWN_PHASE_TIME.test("  phaseEndsAt?: number;")).toBe(true);
    expect(OWN_PHASE_TIME.test("  private phaseEndsAt = 0;")).toBe(true);
    expect(OWN_PHASE_TIME.test("  private phaseTimer: unknown = null;")).toBe(true);
    expect(OWN_PHASE_TIME.test("  leapEndsAt: number;")).toBe(false);
    expect(OWN_PHASE_TIME.test("      remainingMs: this.phases.remainingMs(),")).toBe(false);
    expect(OWN_PHASE_TIME.test("    if (this.clock.now() >= this.phases.endsAt) return false;")).toBe(false);
  });

  test("the timer guard flags Clock timers and accepts the phase timer", () => {
    expect(CLOCK_TIMER.test("this.timer = this.clock.setTimeout(() => this.finish(), ms);")).toBe(true);
    expect(CLOCK_TIMER.test("this.clock.clearTimeout(this.timer);")).toBe(true);
    expect(CLOCK_TIMER.test('this.phases.after("warn", ms, () => this.markTargets());')).toBe(false);
  });
});

const DIRECT_SOCKET_OPEN = /\.\s*onOpen\s*\(/;
const FINALLY_CLEANUP = /\bfinally\s*\{[^}]*\.cleanup\(\)/;
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

/** why: single words like "board" have legitimate other uses, so only multi-word _Avoid_ phrases are checked. */
const AVOIDED_PHRASES = [...readFileSync(join(ROOT, "GLOSSARY.md"), "utf8").matchAll(/^_Avoid_: (.*)$/gm)].flatMap((m) =>
  m[1]!
    .replace(/\(.*?\)/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes(" ")),
);

function titles(text: string): string[] {
  return [...text.matchAll(/\b(?:test|describe)\((["'`])(.*?)\1/g)].map((m) => m[2]!);
}

const testFiles = readdirSync(join(ROOT, "tests"))
  // why: this file is left out because its guard checks quote the pattern.
  .filter((name) => /\.test\.tsx?$/.test(name) && name !== "standards.test.ts")
  .map((name) => ({ path: `tests/${name}`, text: readFileSync(join(ROOT, "tests", name), "utf8") }));

/** why: setTimeout(r, 0) only lets pending work run, so only a fixed delay counts as a wait. */
const SLEEP_WAIT = /\bBun\s*\.\s*sleep\s*\(|\bsetTimeout\s*\(\s*\w+\s*,\s*[1-9]/;

/** why: test helpers are scanned too: a wait hidden in a helper is still a wait. */
const testSources = readdirSync(join(ROOT, "tests"))
  .filter((name) => /\.tsx?$/.test(name) && name !== "standards.test.ts")
  .map((name) => ({ path: `tests/${name}`, text: readFileSync(join(ROOT, "tests", name), "utf8") }));

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

  test("tests and their helpers wait on an event or a controlled clock, not on real time", () => {
    expect(testSources.filter(({ text }) => SLEEP_WAIT.test(text)).map(({ path }) => path)).toEqual([]);
  });

  test("the sleep guard flags Bun.sleep and fixed timer delays, and accepts events, clocks and a zero delay", () => {
    expect(SLEEP_WAIT.test("await Bun.sleep(100);")).toBe(true);
    expect(SLEEP_WAIT.test("new Promise((r) => setTimeout(r, 200))")).toBe(true);
    expect(SLEEP_WAIT.test("await nextQr();")).toBe(false);
    expect(SLEEP_WAIT.test("clock.advance(100);")).toBe(false);
    expect(SLEEP_WAIT.test("new Promise((r) => setTimeout(r, 0))")).toBe(false);
    expect(SLEEP_WAIT.test("const timer = setTimeout(r, left);")).toBe(false);
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
  // why: a guard that stops matching passes every file, so check it against lines it must and mustn't flag.
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

function importsOf(path: string): string[] {
  const text = readFileSync(path, "utf8");
  const specs = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g)].map((m) => m[1]!);
  return specs.map((spec) => resolve(dirname(path), spec));
}

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

const KEYS_CAST = /\bObject\.keys\([^)]*\)\s*as\b/;

function codeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return codeFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("Coding standards: checked casts", () => {
  test("no code casts Object.keys", () => {
    const files = ["src", "tests"].flatMap((d) => codeFiles(join(ROOT, d))).map(read);
    expect(offending(KEYS_CAST, files)).toEqual([]);
  });
});

const SECTION_DIVIDER = /^\s*(?:\/\/|\/\*)\s*[-=]{3,}/;

/** why: review removed forwarding getters twice (3bdd870, be336b2); the hub still reads phase, players and podium through them, so this ratchets the count down. */
const KNOWN_FORWARDING_GETTERS: Record<string, number> = {
  "src/server/game/classic.ts": 9,
  "src/server/game/cup.ts": 6,
  "src/server/game/duel.ts": 9,
  "src/server/game/fight.ts": 4,
  "src/server/game/gift.ts": 4,
  "src/server/game/land.ts": 4,
  "src/server/game/lobby.ts": 1,
  "src/server/game/memory.ts": 6,
  "src/server/game/paced-round.ts": 1,
  "src/server/game/paced-session.ts": 5,
  "src/server/game/phase-timer.ts": 1,
  "src/server/game/racer.ts": 8,
  "src/server/game/robot.ts": 6,
  "src/server/game/siege.ts": 6,
  "src/server/game/streamed-session.ts": 4,
  "src/server/game/submarine.ts": 4,
  "src/server/game/tower.ts": 4,
};
const FORWARDING_GETTER = /\bget\s+\w+\(\)[^{]*\{\s*return\s+this(?:\.\w+){2,};?\s*\}/g;

function forwardingGetters(text: string): number {
  return [...text.matchAll(FORWARDING_GETTER)].length;
}

describe("Coding standards: single owner", () => {
  test("the forwarding getter guard flags a getter that returns another owner's field", () => {
    expect(forwardingGetters("get phase(): Ph {\n    return this.session.paced.phase;\n  }")).toBe(1);
    expect(forwardingGetters("get phase(): Ph {\n    return this.phases.phase === 'x';\n  }")).toBe(0);
    expect(forwardingGetters("get phase(): Ph {\n    return this.phase;\n  }")).toBe(0);
  });

  test("no server file adds a getter that forwards another owner's field; read the owner (session.paced, session.stream) instead", () => {
    const found = Object.fromEntries(
      sources.map(({ path, lines }) => [relative(ROOT, path), forwardingGetters(lines.join("\n"))] as const).filter(([, n]) => n > 0),
    );
    const grown = Object.entries(found).filter(([path, n]) => n > (KNOWN_FORWARDING_GETTERS[path] ?? 0));
    expect(grown).toEqual([]);
  });

  test("every known forwarding getter count is still reached, so a removed getter lowers the count", () => {
    const shrunk = Object.entries(KNOWN_FORWARDING_GETTERS).filter(([path, n]) => forwardingGetters(readFileSync(join(ROOT, path), "utf8")) < n);
    expect(shrunk).toEqual([]);
  });
});

describe("Coding standards: comments", () => {
  test("finds a section divider", () => {
    expect(SECTION_DIVIDER.test("  // ---------- the battle ----------")).toBe(true);
    expect(SECTION_DIVIDER.test("/* ==== effects ==== */")).toBe(true);
    expect(SECTION_DIVIDER.test("// a -> b")).toBe(false);
  });

  test("no code has a section divider comment", () => {
    const files = ["src", "tests", "scripts"].flatMap((d) => codeFiles(join(ROOT, d))).map(read);
    expect(offending(SECTION_DIVIDER, files)).toEqual([]);
  });
});

const VIEW_TYPE_FILES = [
  join(ROOT, "src/shared/mode-views.ts"),
  ...readdirSync(join(ROOT, "src/shared/modes")).map((name) => join(ROOT, "src/shared/modes", name)),
].map(read);
const TIME_FIELD = /\b(\w+Ms)\??\s*:/g;

describe("Coding standards: view time fields", () => {
  test("finds the view time fields", () => {
    const fields = VIEW_TYPE_FILES.flatMap(({ lines }) => lines.flatMap((line) => [...line.matchAll(TIME_FIELD)].map((m) => m[1]!)));
    expect(fields).toContain("phaseRemainingMs");
  });

  test("every view time field ends in RemainingMs, ElapsedMs or DurationMs", () => {
    const misnamed = VIEW_TYPE_FILES.flatMap(({ path, lines }) =>
      lines.flatMap((line, i) =>
        [...line.matchAll(TIME_FIELD)].filter((m) => !isNamedTimeField(m[1]!)).map((m) => `${relative(ROOT, path)}:${i + 1}: ${m[1]}`),
      ),
    );
    expect(misnamed).toEqual([]);
  });
});
