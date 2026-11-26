import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// why: the agent docs are the map of where to edit; a path they name that no longer exists sends the next reader the wrong way.
const ROOT = resolve(import.meta.dir, "..");
const DOCS = ["GLOSSARY.md", "AGENTS.md", "CODING_STANDARDS.md", ...readdirSync(join(ROOT, "docs/agents")).map((f) => `docs/agents/${f}`)];

/** why: repo paths written in backticks, such as `src/shared/mode-entries.ts`; placeholder paths with <mode> are left out. */
function namedPaths(source: string): string[] {
  return [...source.matchAll(/`((?:src|tests|scripts|docs)\/[^`\s]+)`/g)].map((m) => m[1]!).filter((path) => !/[<>*{]/.test(path));
}

describe("Agent docs", () => {
  test("name repo paths", () => {
    expect(DOCS.flatMap((doc) => namedPaths(readFileSync(join(ROOT, doc), "utf8"))).length).toBeGreaterThan(10);
  });

  test("every repo path they name exists", () => {
    const missing = DOCS.flatMap((doc) =>
      namedPaths(readFileSync(join(ROOT, doc), "utf8"))
        .filter((path) => !existsSync(join(ROOT, path)))
        .map((path) => `${doc}: ${path}`),
    );
    expect(missing).toEqual([]);
  });
});
