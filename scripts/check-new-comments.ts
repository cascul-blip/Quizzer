import { $ } from "bun";

const MARKERS = /^(why|checked):/;
const DIRECTIVES = /^(biome-ignore|@ts-expect-error|@ts-ignore|eslint-disable)/;
const PATHS = ["src/*.ts", "src/*.tsx", "tests/*.ts", "tests/*.tsx", "scripts/*.ts"];

const PENDING_LIST = "scripts/comment-audit-pending.txt";
const wholeRepo = process.argv.includes("--all");

type CommentStart = { text: string; column: number };

function withoutStrings(line: string): string {
  return line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\`[^\`]*\`/g, '""');
}

function commentIn(line: string): CommentStart | null {
  const code = withoutStrings(line);
  const continuation = /^\s*\*(?!\/)/.exec(code);
  if (continuation) return { text: line.slice(continuation[0].length).trim(), column: -1 };
  const match = /(?:^|(?<=\s))(?:\/\/|\/\*)/.exec(code);
  if (!match) return null;
  return {
    text: code
      .slice(match.index + 2)
      .replace(/^\*/, "")
      .trim(),
    column: match.index,
  };
}

function blockOpening(lines: string[], index: number): string {
  for (let i = index; i >= 0; i--) {
    const code = withoutStrings(lines[i] ?? "");
    const opens = code.indexOf("/*");
    if (opens >= 0)
      return code
        .slice(opens + 2)
        .replace(/^\*/, "")
        .trim();
  }
  return "";
}

function lineCommentOpening(lines: string[], index: number): string {
  let first = index;
  while (first > 0 && /^\s*\/\//.test(lines[first - 1] ?? "")) first--;
  return (lines[first] ?? "").replace(/^\s*\/\/\s*/, "");
}

function justified(lines: string[], index: number, comment: CommentStart): boolean {
  if (DIRECTIVES.test(comment.text)) return true;
  const line = lines[index] ?? "";
  const opening = comment.column === -1 ? blockOpening(lines, index) : /^\s*\/\//.test(line) ? lineCommentOpening(lines, index) : comment.text;
  return MARKERS.test(opening.replace(/^\*\s*/, ""));
}

const failures: string[] = [];
async function checkFile(path: string, lineNumbers: number[] | "all", into = failures) {
  const lines = (await Bun.file(path).text()).split("\n");
  const numbers = lineNumbers === "all" ? lines.map((_, i) => i + 1) : lineNumbers;
  for (const number of numbers) {
    const comment = commentIn(lines[number - 1] ?? "");
    if (comment && !justified(lines, number - 1, comment)) {
      into.push(`${path}:${number}: ${(lines[number - 1] ?? "").trim()}`);
    }
  }
}

async function checkChangedLines() {
  const emptyTree = (await $`git hash-object -t tree /dev/null`.text()).trim();
  const envBase = process.env.BASE_SHA;
  const base = envBase && !/^0+$/.test(envBase) ? envBase : (await $`git merge-base main HEAD`.nothrow().text()).trim() || emptyTree;
  const tracked = await $`git -c core.quotePath=false diff --no-ext-diff --no-color --src-prefix=a/ --dst-prefix=b/ --unified=0 ${base} -- ${PATHS}`.text();
  const untracked = (await $`git -c core.quotePath=false ls-files --others --exclude-standard -- ${PATHS}`.text()).split("\n").filter(Boolean);

  const added = new Map<string, number[]>();
  let file = "";
  for (const row of tracked.split("\n")) {
    if (row.startsWith("+++ ")) file = row.slice(4).replace(/^b\//, "");
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(row);
    if (hunk && file !== "/dev/null") {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      const lines = added.get(file) ?? [];
      for (let n = 0; n < count; n++) lines.push(start + n);
      added.set(file, lines);
    }
  }

  for (const [path, numbers] of added) await checkFile(path, numbers);
  for (const path of untracked) await checkFile(path, "all");
}

async function checkWholeRepo() {
  const pendingFile = Bun.file(PENDING_LIST);
  const pending = new Set(
    ((await pendingFile.exists()) ? await pendingFile.text() : "")
      .split("\n")
      .map((row) => row.trim())
      .filter(Boolean),
  );
  const files = (await $`git -c core.quotePath=false ls-files --cached --others --exclude-standard -- ${PATHS}`.text()).split("\n").filter(Boolean);
  for (const path of files) {
    if (!(await Bun.file(path).exists())) continue;
    if (!pending.has(path)) {
      await checkFile(path, "all");
      continue;
    }
    const found: string[] = [];
    await checkFile(path, "all", found);
    if (found.length === 0) failures.push(`${PENDING_LIST}: ${path} has no unmarked comments left; remove it from the list.`);
  }
}

if (wholeRepo) await checkWholeRepo();
else await checkChangedLines();

if (failures.length > 0) {
  console.error(failures.join("\n"));
  console.error(
    `\n${failures.length} new comment line(s). Rename or extract until the code says it, or start the comment with "why:" for a reason the code can't carry (CODING_STANDARDS.md, Comments).`,
  );
  process.exit(1);
}
