# droidcode-server

Small companion service that runs on the same host as `sandbox-agent` and
holds shared metadata + mirrored event history in SQLite so multiple
droidcode web/Tauri clients can see the same sessions.

## What it stores

- **sessions** — id, agent, agentSessionId, lastConnectionId, alias,
  sessionInit snapshot, timestamps
- **events** — mirrored SessionEvent rows keyed by `(session_id, id)`,
  indexed by eventIndex for cheap range reads
- **projects** — remembered cwds (directory + display name)

## API (REST, JSON)

```
GET    /v1/health
GET    /v1/sessions
GET    /v1/sessions/:id
PUT    /v1/sessions/:id                 (upsert)
DELETE /v1/sessions/:id                 (cascades events)
GET    /v1/sessions/:id/events?after=N&limit=500
POST   /v1/sessions/:id/events          (one event or { events: [...] })
GET    /v1/projects
PUT    /v1/projects                     (upsert by directory)
DELETE /v1/projects?directory=/abs/path
```

## Running

```
cd server
npm install
npm run start
```

Environment:

| Var | Default | Purpose |
|---|---|---|
| `DROIDCODE_HOST` | `0.0.0.0` | listen host |
| `DROIDCODE_PORT` | `2469` | listen port (daemon is 2468) |
| `DROIDCODE_DB` | `~/.local/share/droidcode/server.sqlite` | SQLite path |
| `DROIDCODE_TOKEN` | *(unset)* | if set, clients must send `Authorization: Bearer <token>` |
| `DROIDCODE_CORS` | `*` | comma-separated origins (e.g. `http://nightman:5173,http://localhost:5173`) |
| `LOG_LEVEL` | `info` | fastify logger level |

## Deployment

Run as a systemd user service alongside `sandbox-agent`. Tailscale Serve
can front both ports:

```
tailscale serve https / proxy 2468   # daemon
tailscale serve https /api proxy 2469  # companion (TODO — pick a prefix)
```
