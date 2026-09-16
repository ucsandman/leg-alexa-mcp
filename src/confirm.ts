/**
 * One-time confirmation tokens for destructive tools.
 *
 * A destructive action (handoff) never executes on a single tool call.
 * The first call returns a preview plus an opaque token; the second call
 * must present that token. Tokens are single-use, bound to one session id,
 * and expire after 5 minutes. This enforces the pause wes wants: the human
 * sees the preview in the conversation before anything irreversible runs.
 *
 * Module-level store: the MCP server spins a fresh McpServer per request,
 * but this module is loaded once per process, so tokens survive across
 * requests. A process restart invalidates pending tokens (fail closed).
 */
import { randomBytes } from "node:crypto";

const TTL_MS = 5 * 60 * 1_000;

type Entry = { sessionId: string; expires: number };
const tokens = new Map<string, Entry>();

function sweep(): void {
  const now = Date.now();
  for (const [tok, e] of tokens) {
    if (e.expires <= now) tokens.delete(tok);
  }
}

/** Issue a single-use token for a destructive action on this session. */
export function issueHandoffToken(sessionId: string): string {
  sweep();
  const token = randomBytes(32).toString("hex");
  tokens.set(token, { sessionId, expires: Date.now() + TTL_MS });
  return token;
}

/**
 * Consume a token. Returns true only if the token exists, is unexpired,
 * matches this session id, and has not been used before.
 */
export function consumeHandoffToken(sessionId: string, token: string): boolean {
  sweep();
  const e = tokens.get(token);
  if (!e) return false;
  tokens.delete(token);
  return e.sessionId === sessionId && e.expires > Date.now();
}
