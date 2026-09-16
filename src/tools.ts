import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listSessions, showSession, sessionEvents, handoffSession } from "./leg.js";

const SessionId = z.string().min(1).describe("Leg session id, as returned by list_sessions");

type TextResult = { content: [{ type: "text"; text: string }] };
const text = (t: string): TextResult => ({ content: [{ type: "text" as const, text: t }] });

export function registerTools(server: McpServer): void {
  server.tool(
    "list_sessions",
    "List every Leg agent session: id, agent, repo, branch, task, status, and 5h/7d usage. Start here.",
    {},
    async () => text(JSON.stringify(await listSessions(), null, 2)),
  );

  server.tool(
    "show_session",
    "Show full detail for one Leg session: what it is working on, files touched, usage, and state.",
    { id: SessionId },
    async ({ id }) => text(await showSession(id)),
  );

  server.tool(
    "session_events",
    "Recent timeline events for one Leg session: warnings, handoffs, landings, errors.",
    { id: SessionId },
    async ({ id }) => text(await sessionEvents(id)),
  );

  server.tool(
    "handoff_session",
    "Hand off a session NOW: stops the running agent and starts the next one from the handoff bundle. " +
      "Same as the board's Hand off now button. This ends the current agent process; confirm with the human first.",
    { id: SessionId },
    async ({ id }) => text(await handoffSession(id)),
  );
}
