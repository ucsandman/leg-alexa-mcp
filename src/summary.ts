/**
 * Shared session summaries for the dashboard widget and the catch-up digest.
 *
 * Normalizes the raw `leg sessions ls --json` rows defensively (field names
 * come from the CLI, not a schema) and attaches each session's latest event.
 * Event reads run in parallel; a failed read degrades to an empty string
 * rather than failing the whole summary.
 */
import { listSessions, sessionEvents } from "./leg.js";

export type SessionSummary = {
  id: string;
  agent: string;
  repo: string;
  branch: string;
  task: string;
  status: string;
  usage: string;
  lastEvent: string;
  needsAttention: boolean;
};

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function str(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

const ATTENTION = /error|fail|warn|stuck|budget|cap\b|limit|exceed|crash/i;

export async function getSessionSummaries(): Promise<SessionSummary[]> {
  const rows = await listSessions();
  return Promise.all(
    rows.map(async (row) => {
      const r = asRecord(row);
      const id = str(r, "id", "sessionId", "session_id");
      let lastEvent = "";
      if (id) {
        try {
          const events = await sessionEvents(id);
          const lines = events
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          lastEvent = (lines[lines.length - 1] ?? "").slice(0, 220);
        } catch {
          lastEvent = "";
        }
      }
      const status = str(r, "status", "state");
      const usage5h = str(r, "usage5h", "usage_5h", "usage5H");
      const usage7d = str(r, "usage7d", "usage_7d", "usage7D");
      const usage = [usage5h && `5h ${usage5h}`, usage7d && `7d ${usage7d}`]
        .filter(Boolean)
        .join(" · ");
      return {
        id,
        agent: str(r, "agent"),
        repo: str(r, "repo", "repository"),
        branch: str(r, "branch"),
        task: str(r, "task", "title", "name"),
        status,
        usage,
        lastEvent,
        needsAttention: ATTENTION.test(`${status} ${lastEvent}`),
      };
    }),
  );
}
