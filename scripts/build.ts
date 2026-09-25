// Cross-compiles single-file executables for Linux and Windows into dist/.
import { rmSync } from "node:fs";
import pkg from "../package.json" with { type: "json" };

const targets = [
  { target: "bun-linux-x64", out: "dist/quizzer-linux-x64" },
  { target: "bun-windows-x64", out: "dist/quizzer-windows-x64.exe" },
] as const;

const only = process.argv[2];
rmSync("dist", { recursive: true, force: true });

for (const { target, out } of targets) {
  if (only && !target.includes(only)) continue;
  console.log(`Building ${out} (${target})…`);
  const args = ["build", "src/server/main.ts", "--compile", "--minify", `--target=${target}`, `--outfile=${out}`];
  // Exe metadata flags only work when building on Windows itself.
  if (target.includes("windows") && process.platform === "win32") {
    args.push("--windows-title=Quizzer", `--windows-version=${pkg.version}.0`, "--windows-description=Quizzer quiz server");
  }
  const proc = Bun.spawnSync(["bun", ...args], { stdout: "inherit", stderr: "inherit", env: { ...process.env, NODE_ENV: "production" } });
  if (proc.exitCode !== 0) process.exit(proc.exitCode ?? 1);
}
console.log("Done.");
