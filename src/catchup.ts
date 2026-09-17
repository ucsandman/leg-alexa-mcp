/**
 * "What happened while I was away" digest.
 *
 * Composes list_sessions + session_events into one spoken-style summary:
 * what changed, what needs attention, what is stuck. Plain sentences, no
 * markdown, so it reads naturally when spoken by a voice assistant.
 */
import { getSessionSummaries } from "./summary.js";

export async function catchUp(): Promise<string> {
  const sessions = await getSessionSummaries();
  if (sessions.length === 0) {
    return "No Leg sessions right now. Nothing to catch up on.";
  }
  const n = sessions.length;
  const running = sessions.filter((s) => /run|active|work/i.test(s.status)).length;
  const lines: string[] = [
    `Catch-up: ${n} session${n === 1 ? "" : "s"}. ${running} running, ${n - running} not running.`,
  ];
  for (const s of sessions) {
    const name = s.task || s.agent || s.id || "A session";
    const bits = [`${name}: ${s.status || "status unknown"}`];
    if (s.lastEvent) bits.push(`Latest: ${s.lastEvent}`);
    lines.push(bits.join(". ") + ".");
  }
  const flagged = sessions.filter((s) => s.needsAttention);
  lines.push(
    flagged.length > 0
      ? `Needs attention: ${flagged.map((s) => s.task || s.id || "a session").join(", ")}.`
      : "Nothing looks stuck or broken.",
  );
  return lines.join(" ");
}
