import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const SCRIPT = join(import.meta.dir, "..", "scripts", "check-new-comments.ts");
let repo = "";

beforeEach(async () => {
  repo = mkdtempSync(join(tmpdir(), "comment-check-"));
  mkdirSync(join(repo, "src"));
  mkdirSync(join(repo, "scripts"));
  await $`git init -q`.cwd(repo);
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

async function wholeRepoCheck(files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) writeFileSync(join(repo, path), text);
  await $`git add -A`.cwd(repo);
  const result = await $`bun ${SCRIPT} --all`.cwd(repo).nothrow().quiet();
  return { exitCode: result.exitCode, output: result.stderr.toString() };
}

describe("whole-repo comment check", () => {
  test("fails an unmarked comment in a tracked file", async () => {
    const result = await wholeRepoCheck({ "src/a.ts": "// Walking.\nexport const a = 1;\n" });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("src/a.ts:1");
  });

  test("passes why:, checked:, directives and a multi-line why: block", async () => {
    const result = await wholeRepoCheck({
      "src/a.ts": [
        "// why: the server clamps this",
        "export const a = 1 as number; // checked: literal widening",
        "// biome-ignore lint/style/noNonNullAssertion: fixture",
        "// @ts-expect-error fixture",
        "/** why: a reason that",
        " * spans two lines",
        " */",
        "// why: another reason that",
        "// spans two line comments",
        "export const b = 2;",
        "",
      ].join("\n"),
    });
    expect(result.exitCode).toBe(0);
  });

  test("passes a generator method, which is not a comment continuation", async () => {
    const result = await wholeRepoCheck({
      "src/a.ts": ["export class Players {", "  *forPlayer() {", "    yield 1;", "  }", "}", ""].join("\n"),
    });
    expect(result.exitCode).toBe(0);
  });
});

test("the repo has no unmarked comments", async () => {
  const root = join(import.meta.dir, "..");
  const result = await $`bun ${SCRIPT} --all`.cwd(root).nothrow().quiet();
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
});
