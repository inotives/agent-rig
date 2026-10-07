import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorkflowApi } from "./api.js";

const host = "127.0.0.1";
const defaultPort = 8787;
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

export function createUiServer(cwd: string, assetsDir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "dist")): Server {
  const api = createWorkflowApi(cwd);
  const missing = ["index.html", "ui.css", "ui/pages/task-board/index.js"].filter((asset) => !existsSync(join(assetsDir, asset)));
  if (missing.length) throw new Error(`UI assets are missing from ${assetsDir}: ${missing.join(", ")}`);

  return createServer((request, response) => handleRequest(request, response, api, assetsDir));
}

export async function runUi(args: string[], cwd: string): Promise<number> {
  const port = parsePort(args);
  if (port === null) return 1;

  let server: Server;
  try {
    server = createUiServer(cwd);
  } catch (error) {
    console.error(`Unable to start UI: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    console.error(`Unable to start UI on ${host}:${port}: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  console.log(`AgentRig UI listening at http://${host}:${port}`);
  return await new Promise<number>(() => undefined);
}

function parsePort(args: string[]): number | null {
  if (args.length === 0) return defaultPort;
  if (args.length !== 2 || args[0] !== "--port") {
    console.error("Usage: agent-rig ui [--port <1-65535>]");
    return null;
  }
  const port = Number(args[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("UI port must be an integer between 1 and 65535");
    return null;
  }
  return port;
}

function handleRequest(request: IncomingMessage, response: ServerResponse, api: ReturnType<typeof createWorkflowApi>, assetsDir: string) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    const result = api(request.method ?? "", url.pathname + url.search);
    response.writeHead(result.status, result.headers);
    response.end(result.body);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(assetsDir, requested));
  if (relative(assetsDir, filePath).startsWith("..") || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream" });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
}
