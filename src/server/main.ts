import { parseArgs } from "node:util";
import { resolve } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { defaultDataDir, isCompiled } from "./paths.ts";
import { QuizStore } from "./quiz/store.ts";

const HELP = `Quizzer ${pkg.version}: Kahoot-style quiz games on your local network

Usage:
  quizzer [serve] [options]   Start the quiz server (default)
  quizzer mcp [options]       Run the MCP server over stdio (for AI agents)

Options:
  -p, --port <n>        Port to listen on (default 8080)
      --host <ip>       Address to put in the join URL/QR code (default: auto-detect)
  -d, --data-dir <dir>  Where quizzes, images and results are stored
                        (default: "data" folder next to the program)
      --no-open         Don't open the admin page in a browser
  -h, --help            Show this help
  -v, --version         Show the version
`;

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32" ? ["cmd", "/c", "start", "", url] : process.platform === "darwin" ? ["open", url] : ["xdg-open", url];
  try {
    Bun.spawn(cmd, { stdio: ["ignore", "ignore", "ignore"] }).unref();
  } catch {
    // No browser available; the URL is printed anyway.
  }
}

/**
 * Print an error and exit. When the Windows exe was double-clicked, the console
 * window would vanish instantly, so wait for Enter first.
 */
async function fail(message: string, code = 1): Promise<never> {
  console.error(message);
  if (process.platform === "win32" && isCompiled() && process.stdin.isTTY) {
    console.error("\nPress Enter to close this window.");
    for await (const _ of console) break;
  }
  process.exit(code);
}

async function main(): Promise<void> {
  let args;
  try {
    args = parseArgs({
      allowPositionals: true,
      options: {
        port: { type: "string", short: "p", default: "8080" },
        host: { type: "string" },
        "data-dir": { type: "string", short: "d" },
        "no-open": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });
  } catch (e) {
    return fail(`${(e as Error).message}\n\n${HELP}`, 2);
  }
  const { values, positionals } = args;
  if (values.help) return void console.log(HELP);
  if (values.version) return void console.log(pkg.version);

  const command = positionals[0] ?? "serve";
  const dataDir = values["data-dir"] ? resolve(values["data-dir"]) : defaultDataDir();
  const store = new QuizStore(dataDir);

  if (command === "mcp") {
    const { runStdioMcp } = await import("./mcp/stdio.ts");
    return runStdioMcp(store, pkg.version);
  }
  if (command !== "serve") return fail(`Unknown command "${command}"\n\n${HELP}`, 2);

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fail(`Invalid port "${values.port}"`, 2);

  const { startServer } = await import("./http.ts");
  let running;
  try {
    running = startServer({
      store,
      port,
      version: pkg.version,
      address: values.host,
      development: !isCompiled() && process.env.NODE_ENV !== "production",
      log: (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`),
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    return fail(
      code === "EADDRINUSE"
        ? `Port ${port} is already in use. Is Quizzer already running? Try --port ${port + 1}`
        : `Could not start the server: ${(e as Error).message}`,
    );
  }

  const adminUrl = `http://localhost:${running.port}/admin`;
  console.log(`
  Quizzer ${pkg.version}

  Admin (this computer only):  ${adminUrl}
  Players join at:             ${running.hub.joinUrl()}
  MCP (HTTP, this computer):   http://localhost:${running.port}/mcp
  Data folder:                 ${dataDir}

  If phones can't connect, make sure they are on the same Wi-Fi and that the
  firewall allows incoming connections on port ${running.port}.
  Press Ctrl+C to stop.
`);
  if (!values["no-open"]) openBrowser(adminUrl);

  const shutdown = async () => {
    await running.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

await main();
