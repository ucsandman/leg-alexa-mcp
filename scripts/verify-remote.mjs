/**
 * End-to-end check of a deployed leg-alexa-mcp over HTTPS.
 *
 * Reads MCP_URL and MCP_AUTH_TOKEN from the environment (.env supported),
 * connects through the public tunnel URL, lists the tools, and calls
 * list_sessions against the real leg CLI on the host. Proves the full
 * chain: public URL -> tunnel -> MCP server -> leg sessions.
 *
 * Usage:
 *   MCP_URL=https://<your-tunnel>/mcp node scripts/verify-remote.mjs
 */
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.MCP_URL;
if (!url) {
  console.error("set MCP_URL to the public /mcp endpoint, e.g. MCP_URL=https://xxx.trycloudflare.com/mcp");
  process.exit(1);
}
const token = process.env.MCP_AUTH_TOKEN ?? "";

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
});
const client = new Client({ name: "verify-remote", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const sessions = await client.callTool({ name: "list_sessions", arguments: {} });
const text = sessions.content[0].text;
console.log("list_sessions ok, first 400 chars:");
console.log(text.slice(0, 400));

await client.close();
console.log("REMOTE VERIFY PASSED");
