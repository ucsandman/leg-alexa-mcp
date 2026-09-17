/**
 * MCP Apps session dashboard (SEP-1865, the MCP Apps extension).
 *
 * Registers a `ui://` resource that renders the current Leg sessions as a
 * card dashboard. Hosts that negotiate the `io.modelcontextprotocol/ui`
 * extension render it in a sandboxed iframe; Amazon's Alexa+ Add-on Local
 * Inspector drives the MCP Apps postMessage bridge and screenshots the
 * widget in device frames (mobile, Echo Show 8/15, voice-only) for its
 * visual analysis mode. Hosts without UI support ignore the resource, and
 * the tools always return plain-text content, so everything degrades
 * gracefully.
 *
 * The widget is a server-rendered snapshot: session data is baked into the
 * HTML at read time, so the first paint needs no bridge round-trip and the
 * page works with scripting disabled. No external resources, no network.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSessionSummaries, type SessionSummary } from "./summary.js";

export const WIDGET_URI = "ui://leg-alexa-mcp/sessions";
export const WIDGET_MIME = "text/html;profile=mcp-app";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusColor(status: string): string {
  const t = status.toLowerCase();
  if (/error|fail|crash/.test(t)) return "#d64545";
  if (/run|active|work/.test(t)) return "#2f9e44";
  if (/warn|stuck|budget|cap|limit/.test(t)) return "#e8890c";
  return "#868e96";
}

function card(s: SessionSummary): string {
  const title = esc(s.task || s.id || "Untitled session");
  const idLine = s.id ? `<div class="id">${esc(s.id)}</div>` : "";
  const context = [s.agent, s.repo && s.branch ? `${s.repo} @ ${s.branch}` : s.repo || s.branch]
    .filter(Boolean)
    .join(" · ");
  const contextLine = context ? `<div class="context">${esc(context)}</div>` : "";
  const usageLine = s.usage ? `<div class="usage">${esc(s.usage)}</div>` : "";
  const eventLine = s.lastEvent
    ? `<div class="event">${esc(s.lastEvent)}</div>`
    : "";
  const badge = s.status
    ? `<span class="badge" style="background:${statusColor(s.status)}">${esc(s.status)}</span>`
    : "";
  const flag = s.needsAttention ? `<span class="flag">needs attention</span>` : "";
  return `<article class="card">${badge}${flag}<h2>${title}</h2>${idLine}${contextLine}${usageLine}${eventLine}</article>`;
}

export function renderSessionsWidget(sessions: SessionSummary[]): string {
  const when = new Date().toLocaleString();
  const head =
    `<header><h1>Leg sessions</h1>` +
    `<p>${sessions.length} session${sessions.length === 1 ? "" : "s"} · snapshot ${esc(when)}</p></header>`;
  const body =
    sessions.length === 0
      ? `<p class="empty">No Leg sessions right now.</p>`
      : `<main>${sessions.map(card).join("")}</main>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Leg sessions</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 16px; background: #f1f3f5; color: #212529; }
header h1 { font-size: 20px; margin: 0 0 4px; }
header p { margin: 0 0 16px; color: #868e96; font-size: 13px; }
main { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
.card { background: #fff; border: 1px solid #dee2e6; border-radius: 12px; padding: 14px; }
.card h2 { font-size: 15px; margin: 8px 0 6px; line-height: 1.35; }
.id { font-family: ui-monospace, monospace; font-size: 11px; color: #868e96; word-break: break-all; }
.context, .usage { font-size: 13px; color: #495057; margin-top: 4px; }
.event { font-size: 12px; color: #868e96; margin-top: 8px; border-top: 1px solid #e9ecef; padding-top: 8px; line-height: 1.4; }
.badge { display: inline-block; color: #fff; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; text-transform: capitalize; }
.flag { display: inline-block; font-size: 11px; font-weight: 600; color: #d64545; border: 1px solid #d64545; padding: 1px 8px; border-radius: 999px; margin-left: 6px; }
.empty { color: #868e96; }
@media (prefers-color-scheme: dark) {
  body { background: #16181d; color: #e9ecef; }
  header p { color: #adb5bd; }
  .card { background: #1e2126; border-color: #343a40; }
  .context, .usage { color: #ced4da; }
  .id, .event { color: #adb5bd; }
  .event { border-top-color: #343a40; }
  .empty { color: #adb5bd; }
}
</style>
</head>
<body>
${head}
${body}
</body>
</html>`;
}

export function registerWidget(server: McpServer): void {
  server.resource(
    "sessions_dashboard",
    WIDGET_URI,
    {
      mimeType: WIDGET_MIME,
      _meta: { ui: { prefersBorder: true } },
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: WIDGET_MIME,
          text: renderSessionsWidget(await getSessionSummaries()),
        },
      ],
    }),
  );
}
