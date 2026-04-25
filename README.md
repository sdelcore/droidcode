# DroidCode

Web + desktop + (Android) Tauri client for
[Rivet sandbox-agent](https://github.com/rivet-dev/sandbox-agent). Drives
Claude, Codex, OpenCode, and Amp through a single backend. Mobile-first
flat session home (filter chips + fuzzy search), multi-pane chat that can
span hosts, and a small SQLite companion that also supervises the daemon
so one command gets you a running environment.

> The legacy React Native / Expo app at the repo root has been removed.
> The Vite + Tauri stack now lives at the repo root. See `migration.md`
> for the full Phase 0–10 history.

## Repo layout

```
src/                  Vite + React 19 + Tailwind v4 + shadcn + TanStack
                      Router app source.
src-tauri/            Tauri 2 shell (desktop + Android target).
public/               Vite static assets.
scripts/              Smoke + tooling scripts (TypeScript).
server/               Companion service (Fastify + better-sqlite3) that
                      stores shared session metadata + mirrored event
                      history and supervises the sandbox-agent daemon
                      as a child process.
docs/                 SDK_LIMITATIONS.md (workarounds for sandbox-agent
                      quirks) and any future architecture notes.
flake.nix             Nix dev shell — Node, Rust + cargo-tauri, Tauri
                      Linux deps, Android SDK + NDK 27, sandbox-agent
                      via the wagent flake input.
package.json          The web app's deps + scripts (root level).
```

## Stack

* Vite 7 + React 19 + Tailwind v4 + shadcn/ui.
* TanStack Router (file-based), routes under `src/routes/`.
* `sandbox-agent` TypeScript SDK with a vendored IndexedDB persist driver.
* Zustand stores under `src/stores/`: host / project / session / chat /
  config / settings / visibility / metadata / sessionLive.
* Tauri 2 shell at `src-tauri/` (Linux + Android targets).
* PWA via `vite-plugin-pwa` (Workbox).
* Companion: Node + Fastify + `better-sqlite3` at `server/`, default port
  `2469`.

## Running locally

All commands assume `nix develop` (direnv picks it up automatically).
The `sandbox-agent` binary is supplied by the `wagent` flake input and
is on PATH in the dev shell. The companion spawns it as a child on
startup, so there are only two processes to manage.

### 1. Companion (also spawns the daemon on :2468)

```
cd server
npm install
npm run start
```

Listens on `:2469`, spawns `sandbox-agent server` on `:2468`, stores its
SQLite DB at `~/.local/share/droidcode/server.sqlite`. Crashes of either
get restarted automatically; SIGTERM/SIGINT propagate cleanly. Set
`DROIDCODE_NO_DAEMON=1` to skip child-spawning when running your own
daemon.

### 2. Web client (Vite, root)

```
npm install
npm run dev -- --host 0.0.0.0    # drop --host for localhost only
```

Open `http://<host>:5173`. On first load the client auto-seeds a Host
using the companion's `/v1/meta` hostname — no manual host-add step.
Delete it from `/settings` if you want to start over.

### 3. Tauri (optional)

```
cargo tauri dev       # opens a native window pointed at the Vite dev server
cargo tauri build     # production native bundle (Linux AppImage primary)
```

Identifier is `dev.sdelcore.droidcode`. Updater endpoint not yet wired
(Phase 8).

## Smoke / validation

```
npm run typecheck      # tsc -b --noEmit
npm run lint           # eslint
npm run smoke          # connect to daemon at $SANDBOX_AGENT_URL,
                       # prompt $SMOKE_AGENT (default claude),
                       # dump accumulator output. End-to-end SDK proof.
```

Override smoke target:
```
SANDBOX_AGENT_URL=http://nightman:2468 SMOKE_AGENT=opencode npm run smoke
```

## Routes

```
/                                                  flat session home —
                                                   tiles, filter chips
                                                   (host/project/status),
                                                   fuzzy search, URL-backed
                                                   filter state.
/chat/$hostId/$sessionId?extra=hostId:sessionId,…  chat, up to 3 panes +
                                                   sidebar. Panes can span
                                                   hosts.
/settings                                          hosts CRUD, theme,
                                                   auto-accept, debug logs.
```

### Home-page URL filter state

```
/?q=search&h=1,2&p=/abs/path&s=running,completed&sort=alpha
```

* `q` — fuzzy text (alias, cwd, hostname, agent)
* `h` — comma-separated hostIds
* `p` — comma-separated project directories
* `s` — comma-separated statuses: `running | completed`
* `sort` — `recent | created | alpha` (`recent` default)

Project chips cascade from host selection. Filters serialize verbatim
into the URL so they're shareable and survive back/forward.

## Cross-device story

With the companion running, every browser pointed at the same
daemon + companion sees:

* **Same session list** (daemon doesn't expose one — companion does).
* **Same aliases and project folder names** (mirrored via companion).
* **Same chat history** — events mirrored as they stream. Fresh browser
  opening a session fetches history from the companion and replays
  through the accumulator.

Without the companion, the app still works per-browser; metadata and
history just stay local. Set a per-host companion URL when adding the
host (or leave blank — defaults to `http://<host>:2469`).

## Things that stay per-browser (by design)

* `settingsStore` — theme, auto-accept, debug logs.
* Filter draft state (URL-backed but not synced cross-device).
* `hostStore.hosts` — you add your own URLs.
* `sessionLiveStore` — ephemeral.

Everything else (aliases, project folders, chat history) follows you
across browsers pointed at the same daemon + companion.

## Key docs

* `migration.md` — phased history, decisions, risks.
* `AGENTS.md` — code style + architectural rules for new contributors.
* `CLAUDE.md` — Claude Code guidance for this repo.
* `server/README.md` — companion service runbook + env vars.
* `docs/SDK_LIMITATIONS.md` — sandbox-agent / Rivet quirks we work around.

## License

MIT.
