import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const DIRS = ["src/server", "src/shared"].map((d) => join(ROOT, d));

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return name.endsWith(".ts") ? [path] : [];
  });
}

// scanImports leaves out type-only imports (`import type`, and `import { type X }` when every name is a type),
// which Bun erases; dynamic imports load late and can't form an initialisation cycle.
const transpiler = new Bun.Transpiler({ loader: "ts" });

function runtimeImports(file: string): string[] {
  return transpiler
    .scanImports(readFileSync(file, "utf8"))
    .filter((i) => i.kind !== "dynamic-import" && i.path.startsWith(".") && i.path.endsWith(".ts"))
    .map((i) => resolve(dirname(file), i.path));
}

/** Import cycles, each as its path of files starting and ending at the same file; a graph with any cycle yields at least one. */
function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const visit = (file: string) => {
    seen.add(file);
    stack.push(file);
    onStack.add(file);
    for (const dep of graph.get(file) ?? []) {
      if (onStack.has(dep)) cycles.push([...stack.slice(stack.indexOf(dep)), dep]);
      else if (!seen.has(dep)) visit(dep);
    }
    stack.pop();
    onStack.delete(file);
  };
  for (const file of graph.keys()) if (!seen.has(file)) visit(file);
  return cycles;
}

describe("Server import graph", () => {
  const files = DIRS.flatMap(tsFiles);
  const graph = new Map(files.map((f) => [f, runtimeImports(f)]));

  test("every relative .ts import resolves to a file", () => {
    const missing = [...graph].flatMap(([file, deps]) => deps.filter((d) => !graph.has(d)).map((d) => `${relative(ROOT, file)} → ${relative(ROOT, d)}`));
    expect(missing).toEqual([]);
  });

  test("has no runtime import cycles", () => {
    const cycles = findCycles(graph).map((c) => c.map((f) => relative(join(ROOT, "src"), f)).join(" → "));
    expect(cycles).toEqual([]);
  });
});

// Each mode's protocol types live in src/shared/modes/<mode>.ts, imported directly (no re-exports from protocol.ts).
// When a mode migrates, add its file here; its exports must not come back to protocol.ts.
const MODES_DIR = join(ROOT, "src/shared/modes");
const MIGRATED_MODES = ["submarine.ts", "tower.ts", "fight.ts", "robot.ts", "cup.ts"];

/** Every relative import path in a file, type-only ones included. */
function allImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/(?:import|export)\s[^;]*?\bfrom\s+["'](\.[^"']+)["']/g)].map((m) => resolve(dirname(file), m[1]!));
}

/** Names a file declares with `export type|interface|const|function|enum|class`. */
function exportedNames(source: string): string[] {
  return [...source.matchAll(/^export\s+(?:declare\s+)?(?:type|interface|const|let|function|enum|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]!);
}

describe("Mode protocol files", () => {
  const modeFiles = tsFiles(MODES_DIR);

  test("every migrated mode has a file", () => {
    expect(MIGRATED_MODES.filter((m) => !modeFiles.includes(join(MODES_DIR, m)))).toEqual([]);
  });

  test("no mode file imports another mode file", () => {
    const crossings = modeFiles.flatMap((file) =>
      allImports(file)
        .filter((dep) => dep !== file && dirname(dep) === MODES_DIR)
        .map((dep) => `${relative(ROOT, file)} → ${relative(ROOT, dep)}`),
    );
    expect(crossings).toEqual([]);
  });

  test("migrated modes' types are not declared or re-exported in protocol.ts", () => {
    const protocol = readFileSync(join(ROOT, "src/shared/protocol.ts"), "utf8");
    const declared = new Set(exportedNames(protocol));
    const reexports = /^export\s[^;]*?\bfrom\s+["']\.\/modes\//m.test(protocol);
    const leaked = MIGRATED_MODES.flatMap((m) =>
      exportedNames(readFileSync(join(MODES_DIR, m), "utf8"))
        .filter((name) => declared.has(name))
        .map((name) => `${m}: ${name}`),
    );
    expect({ leaked, reexports }).toEqual({ leaked: [], reexports: false });
  });
});
