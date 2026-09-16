import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listSessions, showSession, sessionEvents, handoffSession } from "./leg.js";
import { issueHandoffToken, consumeHandoffToken } from "./confirm.js";

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
      "Same as the board's Hand off now button. This is destructive and runs in TWO steps, enforced by the server, not by convention. " +
      "Step 1: call with only the session id. You get back a preview of exactly what will happen plus a one-time confirm_token. " +
      "Show that preview to the human. Step 2: only after the human approves, call again with the same id AND the confirm_token. " +
      "The token is single-use, expires in 5 minutes, and cannot be guessed. There is no way to skip step 1.",
    {
      id: SessionId,
      confirm_token: z
        .string()
        .optional()
        .describe("One-time token from the step-1 preview. Omit for step 1; required for step 2."),
    },
    async ({ id, confirm_token }) => {
      if (!confirm_token || !consumeHandoffToken(id, confirm_token)) {
        let detail: string;
        try {
          detail = await showSession(id);
        } catch (e) {
          detail = `Could not read session detail: ${(e as Error).message}`;
        }
        const token = issueHandoffToken(id);
        return text(
          "HANDOFF PREVIEW, nothing has happened yet.\n\n" +
            `Calling step 2 will stop the running agent on session "${id}" and start the next one from its handoff bundle. ` +
            "This ends the current agent process.\n\n" +
            "Session detail:\n" +
            detail +
            "\n\n" +
            "To execute, the human must approve, then call handoff_session again with this one-time token " +
            "(expires in 5 minutes, single use):\n" +
            `confirm_token: ${token}`,
        );
      }
      return text(await handoffSession(id));
    },
  );
}
