/**
 * Adapter over the real `leg` CLI. We shell out with argv (never a shell string)
 * so the contract is the CLI reference itself:
 *   leg sessions ls [--json]
 *   leg sessions show|events <id>
 *   leg sessions handoff|end <id>
 * LEG_HOME / legacy ~/.baton fallback are leg's own business; we just pass the
 * environment through.
 *
 * Windows note: `leg` is usually an npm shim (leg.cmd / leg.ps1), which
 * CreateProcess cannot launch directly. A bare `leg` is resolved with where.exe
 * and shims are wrapped in their interpreter (cmd.exe / powershell.exe), so the
 * server works on a stock Windows install with no PATH surgery.
 */
import { execFile, execFileSync } from "node:child_process";

const TIMEOUT_MS = 15_000;

const whereCache = new Map<string, string | undefined>();

function resolveViaWhere(name: string): string | undefined {
  if (!whereCache.has(name)) {
    let found: string | undefined;
    try {
      const out = execFileSync("where.exe", [name], { encoding: "utf8" });
      const paths = out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      // Prefer directly executable forms: .exe, then .cmd/.bat, then .ps1.
      found =
        paths.find((p) => /\.exe$/i.test(p)) ??
        paths.find((p) => /\.(cmd|bat)$/i.test(p)) ??
        paths.find((p) => /\.ps1$/i.test(p)) ??
        paths[0];
    } catch {
      found = undefined;
    }
    whereCache.set(name, found);
  }
  return whereCache.get(name);
}

function quoteForCmd(a: string): string {
  return /[\s"]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a;
}

// Arguments we ever pass to `leg`: subcommands, flags, session ids. Anything
// outside this set is rejected rather than embedded in a cmd.exe command line.
const SAFE_ARG = /^[A-Za-z0-9_.\-/:]+$/;

/**
 * Build the actual { cmd, args } to exec. `platform` and `envBin` are
 * injectable so the Windows shim logic is unit-testable on any OS.
 */
export function legInvocation(
  subArgs: string[],
  platform: NodeJS.Platform = process.platform,
  envBin: string | undefined = process.env.LEG_BIN,
): { cmd: string; args: string[]; windowsVerbatimArguments?: boolean } {
  const raw = (envBin ?? "").trim() || "leg";
  let bin = raw;
  if (platform === "win32" && !/[\\/]/.test(raw)) {
    bin = resolveViaWhere(raw) ?? raw;
  }
  if (platform === "win32") {
    if (/\.ps1$/i.test(bin)) {
      return {
        cmd: "powershell.exe",
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", bin, ...subArgs],
      };
    }
    if (/\.(cmd|bat)$/i.test(bin)) {
      // cmd.exe gets ONE prebuilt command line. It must reach CreateProcess
      // verbatim: libuv's default MSVCRT-style quoting (\" escapes) is not
      // understood by cmd's own parser and breaks the invocation.
      for (const a of subArgs) {
        if (!SAFE_ARG.test(a)) {
          throw new Error(`refusing to pass unsafe argument to cmd.exe: ${JSON.stringify(a)}`);
        }
      }
      const line = [`"${bin}"`, ...subArgs.map(quoteForCmd)].join(" ");
      return { cmd: "cmd.exe", args: ["/d", "/c", line], windowsVerbatimArguments: true };
    }
  }
  return { cmd: bin, args: subArgs };
}

function runLeg(args: string[]): Promise<string> {
  const { cmd, args: argv, windowsVerbatimArguments } = legInvocation(args);
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      argv,
      { timeout: TIMEOUT_MS, env: process.env, windowsVerbatimArguments: windowsVerbatimArguments ?? false },
      (err, stdout, stderr) => {
        if (err) {
        const hint =
          (err as NodeJS.ErrnoException).code === "ENOENT"
            ? `${cmd} not found. Install LegCli (npm i -g @ucsandman/legcli) or set LEG_BIN.`
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
