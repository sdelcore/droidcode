# DroidCode

Web + desktop + (Android) Tauri client for
[wagent](https://github.com/sdelcore/wagent), a self-hosted daemon that
runs coding agents (Claude, pi) over HTTP+SSE. Mobile-first flat session
home (filter chips + fuzzy search), multi-pane chat that can span hosts,
and direct talk to wagent — no intermediate companion service.

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
docs/                 ARCHITECTURE, DATA_MODELS, SDK_LIMITATIONS,
                      TROUBLESHOOTING.
flake.nix             Nix dev shell — Node, Rust + cargo-tauri, Tauri
                      Linux deps, Android SDK + NDK 27. wagent runs
                      separately (see Running locally).
package.json          The web app's deps + scripts (root level).
```

## Stack

* Vite 7 + React 19 + Tailwind v4 + shadcn/ui.
* TanStack Router (file-based), routes under `src/routes/`.
* Typed wagent client (`src/services/wagent/`) — fetch + native
  EventSource. No SDK wrapper, no persist driver.
* Zustand stores under `src/stores/`: host / session / chat / config /
  settings / visibility / sessionLive.
* Tauri 2 shell at `src-tauri/` (Linux + Android targets).
* PWA via `vite-plugin-pwa` (Workbox).

## Running locally

All commands assume `nix develop` (direnv picks it up automatically).
There are exactly two processes: wagent on `:2468` and Vite on `:5173`.

### 1. wagent daemon

wagent lives in its own repo (`~/src/wagent`) and is published as a
flake + npm tarball. Pick whichever is convenient:

```bash
# Run a published release on any host with Nix:
nix run github:sdelcore/wagent

# Or, on NixOS, enable the systemd service via the flake:
#   imports = [ inputs.wagent.nixosModules.default ];
#   services.wagent.enable = true;

# Or, when iterating against a working tree:
cd ~/src/wagent && npm run dev
```

Listens on `:2468`, stores SQLite at `~/.local/share/wagent/wagent.sqlite`
by default. See [wagent's README](https://github.com/sdelcore/wagent)
for `WAGENT_TOKEN`, CORS, and NixOS module options.

### 2. Web client (Vite, root)

```
npm install
npm run dev -- --host 0.0.0.0    # drop --host for localhost only
```

Open `http://<host>:5173`. On first load the client auto-seeds a Host
using wagent's `/v1/meta` hostname — no manual host-add step. Delete
it from `/settings` if you want to start over.

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
npm run smoke          # connect to wagent at $WAGENT_URL, prompt
                       # $SMOKE_AGENT (default claude), dump accumulator.
                       # Drives the same client the React app uses.
```

Override smoke target:
```
WAGENT_URL=http://nightman:2468 SMOKE_AGENT=echo npm run smoke
```

`SMOKE_AGENT=echo` runs against wagent's stub agent and needs no
credentials — the cheapest way to confirm the wire is healthy.

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

wagent is the registry. Every browser pointed at the same wagent sees:

* **Same session list** — `GET /v1/sessions` reads wagent's SQLite.
* **Same aliases** — stored on the session row; `PATCH /v1/sessions/:id`.
* **Same chat history** — events live in wagent's `events` table; SSE
  streams from there with monotonic indices and `Last-Event-ID` resume.
* **Same project folders** — `GET/POST/DELETE /v1/projects`.

Aliases / projects / history follow you across browsers automatically —
nothing client-side to mirror.

## Things that stay per-browser (by design)

* `settingsStore` — theme, auto-accept, debug logs.
* Filter draft state (URL-backed but not synced cross-device).
* `hostStore.hosts` — you add your own URLs.
* `sessionLiveStore` — ephemeral pending-permission state.

## Key docs

* `migration.md` — phased history, decisions, risks.
* `AGENTS.md` — code style + architectural rules for new contributors.
* `CLAUDE.md` — Claude Code guidance for this repo.
* `docs/SDK_LIMITATIONS.md` — historical workarounds from the
  sandbox-agent era; most are obsolete after the wagent cutover but
  kept as a record.
* `docs/ARCHITECTURE.md`, `docs/DATA_MODELS.md`, `docs/TROUBLESHOOTING.md`.

## License

MIT.
