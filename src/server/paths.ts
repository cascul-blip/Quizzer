import { dirname, join, resolve } from "node:path";

export function isCompiled(): boolean {
  return Bun.main.startsWith("/$bunfs/") || /^[A-Za-z]:[\\/]~BUN[\\/]/.test(Bun.main);
}

export function defaultDataDir(): string {
  return isCompiled() ? join(dirname(process.execPath), "data") : resolve("data");
}

export function siegeRecordsPath(dataDir: string): string {
  return join(dataDir, "siege-records.json");
}
