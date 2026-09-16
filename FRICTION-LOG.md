# Friction log

Hackathon submissions with friction logs can earn up to a 10% judging bonus.
One entry per task attempted: what you tried, the steps, expected vs actual,
severity, workaround, and an actionable suggestion.

## Template

| Field | |
|---|---|
| Date | |
| Task attempted | |
| Steps taken | |
| Expected | |
| Actual | |
| Severity | low / medium / high |
| Workaround | |
| Actionable suggestion | |

## Entries

### 1. `cloudflared tunnel login` dead-ends on accounts with no Cloudflare zones

| Field | |
|---|---|
| Date | 2026-09-16 |
| Task attempted | Create a named Cloudflare Tunnel (`leg-alexa`) to expose the MCP server at a stable hostname |
| Steps taken | Installed `cloudflared` via Winget; ran `cloudflared tunnel login`; browser opened to the "Authorize Cloudflare Tunnel" page |
| Expected | Login completes, then `cloudflared tunnel create leg-alexa` |
| Actual | The authorize page requires selecting a Cloudflare zone, and the account has zero zones. There is no skip path, so the login can never complete. |
| Severity | high |
| Workaround | Abandoned the named tunnel; used an account-less quick tunnel (`cloudflared tunnel --url http://127.0.0.1:3000`) which needs no login. Stable hostname deferred until DNS is moved. |
| Actionable suggestion | Let `cloudflared tunnel login` complete without selecting a zone (tunnel creation and DNS routing are separate steps anyway), or show an explicit "no zones found, add one at dash.cloudflare.com" message instead of a dead form. |

### 2. Quick tunnel `--url http://localhost:3000` silently hit the wrong server

| Field | |
|---|---|
| Date | 2026-09-16 |
| Task attempted | Point a quick tunnel at the MCP server on port 3000 |
| Steps taken | Ran `cloudflared tunnel --url http://localhost:3000`; fetched `https://<tunnel>/health` from outside |
| Expected | `{"ok":true}` from the MCP server |
| Actual | Got a Next.js dev-mode 404 page. `localhost` resolved to IPv6 `::1`, where a different dev server (personal site) was listening; the MCP server was bound to IPv4 `127.0.0.1`. Nothing in the tunnel output indicated the mismatch. |
| Severity | medium |
| Workaround | `cloudflared tunnel --url http://127.0.0.1:3000` forces IPv4 and reaches the right server. |
| Actionable suggestion | Log the resolved origin address at tunnel startup (e.g. `origin: 127.0.0.1:3000` vs `[::1]:3000`) so a wrong-server mismatch is visible immediately. |

### 3. Node `execFile` cannot launch npm's Windows shims (`leg.cmd` / `leg.ps1`)

| Field | |
|---|---|
| Date | 2026-09-16 |
| Task attempted | Have the MCP server shell out to the globally installed `leg` CLI on Windows |
| Steps taken | Server used `execFile("leg", args)`. `leg` was on PATH as `leg.ps1`; call failed with "not found". Added `where.exe` resolution plus `cmd.exe`/`powershell.exe` wrapping; first attempt passed a prebuilt command line as one argv element and `cmd.exe` rejected it (`'"C:\...\leg.cmd"' is not recognized`) because libuv MSVCRT-escapes embedded quotes (`\"`), which cmd's parser does not understand. |
| Expected | `execFile` finds `leg` on PATH like any other binary |
| Actual | Two layered failures: CreateProcess cannot execute `.ps1`/`.cmd` shims directly, and libuv's argv quoting corrupts prebuilt `cmd.exe /c` command lines |
| Severity | high |
| Workaround | Fixed in product code (`src/leg.ts`): resolve the bare name with `where.exe`, prefer `.exe` then `.cmd`/`.bat` then `.ps1`; wrap `.ps1` in `powershell.exe -File` (separate argv, no quoting issue) and `.cmd` in `cmd.exe /d /c` with `windowsVerbatimArguments: true` plus an argument allowlist against injection. |
| Actionable suggestion | Node docs for `execFile` should call out that `.bat`/`.cmd`/`.ps1` are not directly executable on Windows and that `windowsVerbatimArguments` is required when handing `cmd.exe` a prebuilt command line. |
