import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

interface CommentBlock {
  file: string;
  startLine: number;
  endLine: number;
  text: string;
}

const root = fileURLToPath(new URL("../", import.meta.url));
const files = Bun.spawnSync(["git", "ls-files", "--deduplicate", "-z"], { cwd: root, stderr: "inherit" });
if (files.exitCode !== 0) process.exit(files.exitCode);

const blocks: CommentBlock[] = [];
let filesScanned = 0;
for (const file of files.stdout.toString().split("\0")) {
  if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file)) continue;
  const sourceFile = Bun.file(join(root, file));
  if (!(await sourceFile.exists())) continue;
  const source = await sourceFile.text();
  const syntax = parse(source, {
    sourceFilename: file,
    sourceType: "unambiguous",
    plugins: [...(/\.tsx?$/.test(file) ? (["typescript"] as const) : []), ...(/\.[jt]sx$/.test(file) ? (["jsx"] as const) : [])],
  });
  filesScanned++;

  let previousLineBlock: CommentBlock | undefined;
  for (const comment of syntax.comments ?? []) {
    const { loc, start: offset, end: endOffset } = comment;
    if (!loc || offset === undefined || endOffset === undefined) throw new Error(`Missing comment position in ${file}`);
    const { start, end } = loc;
    const text = source.slice(offset, endOffset);
    const standaloneLine = comment.type === "CommentLine" && !source.slice(offset - start.column, offset).trim();
    const canGroup = standaloneLine && !/^\/\/\s*(?:checked:|biome-ignore\b|@ts-)/.test(text);
    if (canGroup && previousLineBlock?.endLine === start.line - 1) {
      previousLineBlock.endLine = end.line;
      previousLineBlock.text += `\n${text}`;
    } else {
      const block = { file, startLine: start.line, endLine: end.line, text };
      blocks.push(block);
      previousLineBlock = canGroup ? block : undefined;
    }
  }
}

console.log(JSON.stringify({ filesScanned, totalBlocks: blocks.length, blocks }, null, 2));
