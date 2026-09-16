# leg-alexa-mcp

A self-hosted MCP server that exposes [LegCli](https://github.com/ucsandman/legcli) agent sessions to Alexa+.
Ask what your coding agents did while you were away, check usage before a wall hits, and hand a session off by voice.

Built for the **Amazon Developer Hackathon 2026** (Alexa+ track): self-hosted MCP server, spec 2025-11-25+, Streamable HTTP.

## Tools

| Tool | What it does |
|---|---|
| `list_sessions` | Every Leg session: id, agent, repo, branch, task, status, 5h/7d usage |
| `show_session` | Full detail for one session |
| `session_events` | Timeline: warnings, handoffs, landings, errors |
| `handoff_session` | Hand off now: stops the agent, starts the next one from the bundle. Confirm with the human first. |

The server shells out to the real `leg` binary with argv (never a shell string), so the contract is Leg's own CLI reference. `LEG_HOME` and the legacy `~/.baton` fallback are leg's business, not ours.

## Quickstart

```bash
npm install
npm run build
npm start   # listens on http://127.0.0.1:3000/mcp
```

Requires `leg` on PATH (`npm i -g @ucsandman/legcli`) with an activated license. Override with `LEG_BIN`, `PORT`, `HOST` (see `.env.example`). On Windows the server resolves the npm shim (`leg.cmd` / `leg.ps1`) automatically, no PATH surgery needed.

Smoke test (with MCP_AUTH_TOKEN set):

```bash
curl -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0.1.0"}}}'
```

`GET /health` returns `{"ok":true}` with no auth, for load-balancer checks.

## Wiring to Alexa+

Register `http(s)://<your-host>/mcp` as a self-hosted MCP server in the Alexa+ developer tooling (see the hackathon's Alexa+ track resources). The server is stateless: no session ids, every POST is a complete JSON-RPC request.

Security: this server binds loopback by default. Before exposing it past localhost, set `MCP_AUTH_TOKEN` to a long random string; every POST to /mcp then needs `Authorization: Bearer <token>` (constant-time compare), and binding a non-loopback HOST without a token is refused at startup. `handoff_session` is the one dangerous tool: it ends a running agent process and runs in two enforced steps. The first call returns a preview plus a single-use token that expires in 5 minutes; only a second call with that token executes. The server, not convention, enforces the pause.

## Assumptions (to verify against the track docs)

1. `leg sessions show <id>` and `leg sessions events <id>` have no documented `--json` flag, so those two tools return raw text for the model to read.
2. Alexa+ registration details for self-hosted MCP servers were not re-verified while scaffolding; confirm the exact registration flow in the hackathon's Alexa+ track resources before the demo.

## Hackathon submission checklist

- [ ] Repo public on GitHub with the MIT license visible (About section)
- [ ] Demo video under 3 minutes, public, English, no third-party trademarks/music
- [ ] Product feedback on every tool/SDK used (MCP SDK, Alexa+ tooling)
- [ ] Friction log entries (see `FRICTION-LOG.md`, up to 10% judging bonus)
- [ ] Track: Alexa+. Mini challenges: AWS Builder (host on Bedrock AgentCore or build the agent with Strands), Open Source (this repo)
- [ ] If building on existing work, document what changed during the submission window

## License

MIT. This server is independent open-source software; it shells out to a `leg` install, which is commercial software under its own license.
