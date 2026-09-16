/**
 * leg-alexa-mcp: self-hosted MCP server over Streamable HTTP.
 *
 * Track requirement: MCP spec 2025-11-25 or later, Streamable HTTP transport.
 * Stateless mode (no session ids) keeps the Alexa+ integration simple: every
 * POST to /mcp is a complete JSON-RPC message. Following the SDK's stateless
 * pattern, each request gets a fresh McpServer + transport, both closed when
 * the response finishes.
 *
 * Binds loopback by default. Expose beyond localhost only behind auth you add
 * yourself; see README.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";

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
  if (req.url !== "/mcp") {
    res.writeHead(404).end("not found");
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405).end(METHOD_NOT_ALLOWED);
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
