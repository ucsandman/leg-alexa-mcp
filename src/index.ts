/**
 * leg-alexa-mcp: self-hosted MCP server over Streamable HTTP.
 *
 * Track requirement: MCP spec 2025-11-25 or later, Streamable HTTP transport.
 * Stateless mode (no session ids) keeps the Alexa+ integration simple: every
 * POST to /mcp is a complete JSON-RPC message. Following the SDK's stateless
 * pattern, each request gets a fresh McpServer + transport, both closed when
 * the response finishes.
 *
 * Auth: set MCP_AUTH_TOKEN and every POST to /mcp needs
 * `Authorization: Bearer <token>` (constant-time compare). Binding to a
 * non-loopback address without a token is refused at startup.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN ?? "";

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

if (!AUTH_TOKEN) {
  if (!LOOPBACK.has(HOST)) {
    console.error(
      `refusing to bind ${HOST} without MCP_AUTH_TOKEN: set a bearer token before exposing this server.`,
    );
    process.exit(1);
  }
  console.warn("WARNING: no MCP_AUTH_TOKEN set; the server trusts all loopback clients.");
}

function authorized(req: IncomingMessage): boolean {
  if (!AUTH_TOKEN) return true; // loopback-only by the check above
  const header = req.headers.authorization ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const presented = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(AUTH_TOKEN);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

const METHOD_NOT_ALLOWED = JSON.stringify({
  jsonrpc: "2.0",
  error: { code: -32000, message: "Method not allowed." },
  id: null,
});

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    return;
  }
  if (req.url !== "/mcp") {
    res.writeHead(404).end("not found");
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405).end(METHOD_NOT_ALLOWED);
    return;
  }
  if (!authorized(req)) {
    res.writeHead(401, { "www-authenticate": "Bearer" }).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing or invalid bearer token." },
        id: null,
      }),
    );
    return;
  }
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    res.writeHead(400).end("invalid JSON");
    return;
  }

  const server = new McpServer({ name: "leg-alexa-mcp", version: "0.1.0" });
  registerTools(server);
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (err) {
    console.error("request failed:", err);
    if (!res.headersSent) {
      res.writeHead(500).end(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }),
      );
    }
  }
});

httpServer.listen(PORT, HOST, () => {
  console.log(`leg-alexa-mcp listening on http://${HOST}:${PORT}/mcp`);
});
