import { rmSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };

const argv = process.argv.slice(2);
const outdirAt = argv.indexOf("--outdir");
const outdir = outdirAt >= 0 ? argv[outdirAt + 1] : "dist";
if (!outdir) throw new Error("--outdir needs a directory");
const only = argv.find((a, i) => !a.startsWith("--") && (outdirAt < 0 || i !== outdirAt + 1));

const targets = [
  { target: "bun-linux-x64", out: join(outdir, "quizzer-linux-x64") },
  { target: "bun-windows-x64", out: join(outdir, "quizzer-windows-x64.exe") },
] as const;

for (const { target, out } of targets) {
  if (only && !target.includes(only)) continue;
  console.log(`Building ${out} (${target})…`);
  rmSync(out, { force: true });
  const args = ["build", "src/server/main.ts", "--compile", "--minify", `--target=${target}`, `--outfile=${out}`];
  // why: Bun accepts the exe metadata flags only when building on Windows itself.
  if (target.includes("windows") && process.platform === "win32") {
    args.push("--windows-title=Quizzer", `--windows-version=${pkg.version}.0`, "--windows-description=Quizzer quiz server");
  }
  const proc = Bun.spawnSync(["bun", ...args], { stdout: "inherit", stderr: "inherit", env: { ...process.env, NODE_ENV: "production" } });
  if (proc.exitCode !== 0) process.exit(proc.exitCode ?? 1);
}
console.log("Done.");
