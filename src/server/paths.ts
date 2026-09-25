import { dirname, join, resolve } from "node:path";

/** True when running from a `bun build --compile` executable. */
export function isCompiled(): boolean {
  return Bun.main.startsWith("/$bunfs/") || /^[A-Za-z]:[\\/]~BUN[\\/]/.test(Bun.main);
}

/** Data lives next to the executable when compiled, otherwise in ./data. */
export function defaultDataDir(): string {
  return isCompiled() ? join(dirname(process.execPath), "data") : resolve("data");
}
