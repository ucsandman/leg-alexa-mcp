/**
 * Adapter over the real `leg` CLI. We shell out with argv (never a shell string)
 * so the contract is the CLI reference itself:
 *   leg sessions ls [--json]
 *   leg sessions show|events <id>
 *   leg sessions handoff|end <id>
 * LEG_HOME / legacy ~/.baton fallback are leg's own business; we just pass the
 * environment through.
 */
import { execFile } from "node:child_process";

const LEG_BIN = process.env.LEG_BIN ?? "leg";
const TIMEOUT_MS = 15_000;

function runLeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(LEG_BIN, args, { timeout: TIMEOUT_MS, env: process.env }, (err, stdout, stderr) => {
      if (err) {
        const hint =
          (err as NodeJS.ErrnoException).code === "ENOENT"
            ? `${LEG_BIN} not found on PATH. Install LegCli (npm i -g @ucsandman/legcli) or set LEG_BIN.`
            : (stderr || err.message).trim();
        reject(new Error(`leg ${args.join(" ")} failed: ${hint}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function parseJsonArray(stdout: string): unknown[] {
  const parsed: unknown = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** Every session and its usage. Mirrors `leg sessions ls --json`. */
export async function listSessions(): Promise<unknown[]> {
  return parseJsonArray(await runLeg(["sessions", "ls", "--json"]));
}

/**
 * Detail for one session. `show` has no documented --json flag, so we return
 * raw text and let the model read it.
 */
export async function showSession(id: string): Promise<string> {
  return (await runLeg(["sessions", "show", id])).trim();
}

/** Timeline / event log for one session. Raw text, same reason as show. */
export async function sessionEvents(id: string): Promise<string> {
  return (await runLeg(["sessions", "events", id])).trim();
}

/**
 * Hand off NOW: stops the current agent and starts the next one from the
 * handoff bundle. Same as the board's "Hand off now" button.
 */
export async function handoffSession(id: string): Promise<string> {
  const out = (await runLeg(["sessions", "handoff", id])).trim();
  return out || `Handoff requested for session ${id}.`;
}
