# DroidCode

Web + desktop + (Android) Tauri client for
[Rivet sandbox-agent](https://github.com/rivet-dev/sandbox-agent). Drives
Claude, Codex, OpenCode, and Amp through a single backend. Mobile-first
flat session home (filter chips + fuzzy search), multi-pane chat that
can span hosts, and a small SQLite companion that also supervises the
daemon so one command gets you a running environment.

> **Status:** mid-migration from the legacy React Native / Expo app at
> the repo root to a Vite + Tauri stack in `web/`. Legacy code still
> builds until Phase 10 cutover.

## Repo layout

```
web/        Vite + React 19 + Tailwind v4 + shadcn + TanStack Router.
            Also contains the Tauri 2 shell under web/src-tauri.
server/     Companion service (Fastify + better-sqlite3) that stores
            shared session metadata + mirrored event history so
            multiple browsers/devices pointed at the same daemon
            converge.
docs/       ARCHITECTURE.md, DATA_MODELS.md, TROUBLESHOOTING.md.
            Note: ARCHITECTURE.md still describes the legacy Expo
            stack — the new stack is documented in migration.md +
            AGENTS.md until cutover.
migration.md  End-to-end plan driving the Expo → Vite/Tauri move.
AGENTS.md     Code style for agents working in this repo.

Legacy (root): app/, components/, stores/, services/, types/ — the
current Expo app. Gets retired in migration Phase 10.
```

## What exists in the new stack

### `web/`
* Vite 7 + React 19 + Tailwind v4 + shadcn/ui.
* TanStack Router (file-based), routes under `web/src/routes/`.
* `sandbox-agent` TypeScript SDK with a vendored IndexedDB persist
  driver.
* Zustand stores (`web/src/stores/`): host / project / session / chat /
  config / settings / visibility / metadata / sessionLive.
* Tauri 2 shell in `web/src-tauri/` (Linux only in dev so far; Android
  lands in Phase 9).

### `server/`
* `droidcode-server` — Node + Fastify + `better-sqlite3`, default port
  `2469`. Runs next to `sandbox-agent` on the daemon host.
* REST endpoints:
  * `GET/PUT/DELETE /v1/sessions[/:id]`
  * `GET/POST       /v1/sessions/:id/events`
  * `GET/PUT/DELETE /v1/projects`
  * `GET            /v1/health`
* See `server/README.md` for env vars + deployment notes.

## Running locally

All commands assume `nix develop` (direnv picks it up automatically).
The `sandbox-agent` binary is supplied by the `wagent` flake input and
is on PATH inside the dev shell. The companion spawns it as a child on
startup, so there are only two processes to manage.

### 1. Start the companion (which also spawns the daemon on :2468)

```
cd server
npm install
npm run start
```

Listens on `:2469`, spawns `sandbox-agent server` on `:2468`, stores
its SQLite DB at `~/.local/share/droidcode/server.sqlite`. Crashes
of either get restarted automatically; SIGTERM/SIGINT propagate
cleanly. Set `DROIDCODE_NO_DAEMON=1` to skip child-spawning if you
run your own daemon.

### 2. Start the web client

```
cd web
npm install
npm run dev -- --host 0.0.0.0    # drop --host for localhost only
```

Open `http://<host>:5173`. On first load the client auto-seeds a Host
using the companion's `/v1/meta` hostname — no manual host-add step.
Delete it from `/settings` if you want to start over.

### 3. Legacy Expo app (still buildable)

```
npm install    # root
npx expo start
```

Retires in Phase 10.

## Cross-device story

With the companion running, every browser pointed at the same
daemon + companion sees:

* **Same session list** (daemon doesn't expose one — companion does).
* **Same aliases and project folder names** (mirrored via companion).
* **Same chat history** — events are mirrored as they stream. Fresh
  browser opening a session fetches history from the companion and
  replays it through the accumulator.

Without the companion, the web app still works per-browser; metadata
and history just stay local. Set a per-host companion URL when adding
the host (or leave blank and we default to `http://<host>:2469`).

## Key docs

* `migration.md` — phased plan, decisions, risks.
* `AGENTS.md` — code style for the web app.
* `web/README.md` — web-specific dev notes.
* `server/README.md` — companion service runbook.
* `docs/ARCHITECTURE.md` — legacy Expo architecture (retires with
  Phase 10).

## License

MIT.
