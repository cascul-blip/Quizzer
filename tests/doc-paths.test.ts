import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const DOCS = ["GLOSSARY.md", "AGENTS.md", "CODING_STANDARDS.md", ...readdirSync(join(ROOT, "docs/agents")).map((f) => `docs/agents/${f}`)];

function concretePathsInBackticks(source: string): string[] {
  return [...source.matchAll(/`((?:src|tests|scripts|docs)\/[^`\s]+)`/g)].map((m) => m[1]!).filter((path) => !/[<>*{]/.test(path));
}

describe("Agent docs", () => {
  test("name repo paths", () => {
    expect(DOCS.flatMap((doc) => concretePathsInBackticks(readFileSync(join(ROOT, doc), "utf8"))).length).toBeGreaterThan(10);
  });

  test("every repo path they name exists", () => {
    const missing = DOCS.flatMap((doc) =>
      concretePathsInBackticks(readFileSync(join(ROOT, doc), "utf8"))
        .filter((path) => !existsSync(join(ROOT, path)))
        .map((path) => `${doc}: ${path}`),
    );
    expect(missing).toEqual([]);
  });
});
