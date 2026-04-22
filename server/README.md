# droidcode-server

Companion service that owns two things on the daemon host:

1. **Shared metadata + event history** for droidcode clients —
   sessions, aliases, project folders, mirrored SessionEvent rows.
   Persists to SQLite so multiple browsers/devices converge.
2. **The `sandbox-agent` daemon itself.** The server spawns
   `sandbox-agent server` as a child process on startup, pipes its
   stdout/stderr into the Fastify logger, restarts it with exponential
   backoff on crash, and shuts it down cleanly on SIGTERM/SIGINT. A
   single `npm run start` gets you both services. Disable with
   `DROIDCODE_NO_DAEMON=1` if you're running the daemon yourself.

## What it stores

- **sessions** — id, agent, agentSessionId, lastConnectionId, alias,
  sessionInit snapshot, timestamps
- **events** — mirrored SessionEvent rows keyed by `(session_id, id)`,
  indexed by eventIndex for cheap range reads
- **projects** — remembered cwds (directory + display name)

## API (REST, JSON)

```
GET    /v1/health
GET    /v1/meta                         { hostname, daemon: { enabled, port,
                                          running, pid, lastStartedAt,
                                          lastExitCode, corsOrigins } }
                                         — used by fresh web clients to
                                          seed a default Host on first run
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

### Companion

| Var | Default | Purpose |
|---|---|---|
| `DROIDCODE_HOST` | `0.0.0.0` | listen host |
| `DROIDCODE_PORT` | `2469` | listen port (daemon is 2468) |
| `DROIDCODE_DB` | `~/.local/share/droidcode/server.sqlite` | SQLite path |
| `DROIDCODE_TOKEN` | *(unset)* | if set, clients must send `Authorization: Bearer <token>` |
| `DROIDCODE_CORS` | `*` | comma-separated client origins allowed against companion endpoints |
| `LOG_LEVEL` | `info` | fastify logger level |

### Embedded daemon

| Var | Default | Purpose |
|---|---|---|
| `DROIDCODE_NO_DAEMON` | *unset* | Set to `1` to skip child-spawning sandbox-agent (when you run your own) |
| `DROIDCODE_DAEMON_BIN` | `sandbox-agent` | Binary to exec (must be on PATH; `nix develop` provides it via wagent) |
| `DROIDCODE_DAEMON_PORT` | `2468` | Daemon port |
| `DROIDCODE_DAEMON_HOST` | `0.0.0.0` | Daemon bind address |
| `DROIDCODE_DAEMON_CORS` | *(empty)* | Comma-separated extra CORS origins appended to the defaults. sandbox-agent doesn't accept `*`; list explicit origins |
| `DROIDCODE_VITE_PORT` | `5173` | Port used when building the default daemon CORS origin list (localhost / 127.0.0.1 / os.hostname() at this port) |

## Deployment

Run as a systemd user service alongside `sandbox-agent`. Tailscale Serve
can front both ports:

```
tailscale serve https / proxy 2468   # daemon
tailscale serve https /api proxy 2469  # companion (TODO — pick a prefix)
```
