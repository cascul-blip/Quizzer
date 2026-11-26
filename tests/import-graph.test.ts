import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { keysOf } from "../src/shared/keys-of.ts";
import { SHARED_MODES } from "../src/shared/mode-entries.ts";

const ROOT = resolve(import.meta.dir, "..");
const DIRS = ["src/server", "src/shared"].map((d) => join(ROOT, d));

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return name.endsWith(".ts") ? [path] : [];
  });
}

// why: This suite checks the static runtime graph. The standards suite separately checks type-only dependencies.
const transpiler = new Bun.Transpiler({ loader: "ts" });

function runtimeImports(file: string): string[] {
  return transpiler
    .scanImports(readFileSync(file, "utf8"))
    .filter((i) => i.kind !== "dynamic-import" && i.path.startsWith(".") && i.path.endsWith(".ts"))
    .map((i) => resolve(dirname(file), i.path));
}

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

const MODES_DIR = join(ROOT, "src/shared/modes");
const MODE_FILES = keysOf(SHARED_MODES).map((m) => `${m}.ts`);

function allImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/(?:import|export)\s[^;]*?\bfrom\s+["'](\.[^"']+)["']/g)].map((m) => resolve(dirname(file), m[1]!));
}

function exportedNames(source: string): string[] {
  return [...source.matchAll(/^export\s+(?:declare\s+)?(?:type|interface|const|let|function|enum|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]!);
}

describe("Mode protocol files", () => {
  const modeFiles = tsFiles(MODES_DIR);

  test("every migrated mode has a file", () => {
    expect(MODE_FILES.filter((m) => !modeFiles.includes(join(MODES_DIR, m)))).toEqual([]);
  });

  test("mode files import neither other mode files nor protocol.ts", () => {
    const protocol = join(ROOT, "src/shared/protocol.ts");
    const crossings = modeFiles.flatMap((file) =>
      allImports(file)
        .filter((dep) => dep === protocol || (dep !== file && dirname(dep) === MODES_DIR))
        .map((dep) => `${relative(ROOT, file)} → ${relative(ROOT, dep)}`),
    );
    expect(crossings).toEqual([]);
  });

  test("mode types are not declared in protocol.ts, and protocol.ts re-exports nothing", () => {
    const protocol = readFileSync(join(ROOT, "src/shared/protocol.ts"), "utf8");
    const declared = new Set(exportedNames(protocol));
    const reexports = /^export\s[^;]*?\bfrom\s+["']/m.test(protocol);
    const leaked = MODE_FILES.flatMap((m) =>
      exportedNames(readFileSync(join(MODES_DIR, m), "utf8"))
        .filter((name) => declared.has(name))
        .map((name) => `${m}: ${name}`),
    );
    expect({ leaked, reexports }).toEqual({ leaked: [], reexports: false });
  });

  test("answer messages use StreamAnswerMsg or PacedAnswerMsg from mode-views.ts", () => {
    const handWritten = modeFiles
      .filter((file) => /\.answer"\s*;\s*(?:seq|index)\s*:/.test(readFileSync(file, "utf8")))
      .map(
        (file) =>
          `${relative(ROOT, file)}: write the answer message as StreamAnswerMsg<"prefix"> (streamed question) or PacedAnswerMsg<"prefix"> (paced question)`,
      );
    expect(handWritten).toEqual([]);
  });
});
