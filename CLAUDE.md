# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repo.

## Repo overview

DroidCode is a web + desktop + Android Tauri client for
[Rivet sandbox-agent](https://github.com/rivet-dev/sandbox-agent). It's
mid-migration from a React Native / Expo app at the repo root to a
Vite + Tauri stack under `web/`.

* **New stack lives in `web/` and `server/`** — all new work goes here.
* **Legacy stack is everything else at the repo root** — frozen, retires
  in Phase 10 of `migration.md`.
* **`server/` is a new Node + Fastify + SQLite companion** (port 2469)
  that sits next to `sandbox-agent` (port 2468) to hold shared session
  metadata + mirrored event history so multiple browsers converge.

For conventions, architecture rules, and pitfalls, **read `AGENTS.md`
first.** It's the canonical style guide for new-stack work.

For the end-to-end migration plan and decisions, **read `migration.md`.**

## Running locally

Everything assumes `nix develop` (direnv handles it automatically). The
`sandbox-agent` binary ships via the `wagent` flake input, and the
companion server spawns it as a child on startup — so you only manage
two processes instead of three.

```bash
# 1. Companion (also spawns sandbox-agent on :2468 as a child)
cd server && npm install && npm run start    # listens on :2469

# 2. Web client
cd web && npm install && npm run dev          # vite on :5173
```

Open `http://localhost:5173`. On first load the client auto-seeds a
Host using the companion's `/v1/meta` hostname — no manual "Add host"
step for the common single-machine case.

Override daemon / companion behavior with env vars:

| Var | Default | Purpose |
|---|---|---|
| `DROIDCODE_NO_DAEMON` | *unset* | Set to `1` to skip child-spawning the daemon (use when running your own) |
| `DROIDCODE_DAEMON_BIN` | `sandbox-agent` | Override the daemon binary |
| `DROIDCODE_DAEMON_PORT` | `2468` | Daemon port |
| `DROIDCODE_DAEMON_HOST` | `0.0.0.0` | Daemon bind host |
| `DROIDCODE_DAEMON_CORS` | *(empty)* | Comma-separated extra CORS origins appended to the defaults |
| `DROIDCODE_VITE_PORT` | `5173` | Port used when building the default CORS origin list |

## Key commands (inside `nix develop`)

```bash
# web
cd web
npm run dev                        # vite dev
npm run dev -- --host 0.0.0.0      # bind LAN / tailnet
npm run build                      # prod (tsc + vite + PWA)
npm run typecheck                  # tsc -b --noEmit
npm run lint                       # eslint
npm run smoke                      # end-to-end SDK test

# tauri (same directory)
cargo tauri dev
cargo tauri build

# server
cd server
npm run start
npm run typecheck

# legacy expo app (still works — don't add features)
npm start                          # at repo root
npm run typecheck
npm run lint
```

## Project layout (new stack)

```
web/src/
  routes/              TanStack Router file routes:
                         /                 (flat session home, URL-backed filters)
                         /chat/$hostId/$sessionId?extra=hostId:sessionId,…
                         /settings         (hosts + theme + auto-accept + debug)
  components/
    ui/                shadcn components (copy/paste, don't edit)
    home/              HomePage, FilterBar, SessionTile
    chat/              ChatPane, ChatInput, MessageBubble,
                       PermissionBanner, SessionSidebar,
                       AddPaneDialog, Markdown
    settings/          HostsSection
    NewSessionDialog.tsx   (unified: Sheet on mobile, Dialog on desktop,
                            inline Add-host flow)
  stores/              zustand — see web/README.md for the map
  services/
    sandboxAgent/      SDK connect + cached IndexedDB persist driver
    messaging/         event accumulator → Message[]
    db/                Dexie (hosts, projects, sessionPreferences,
                       hostModelDefaults)
    sync/              companion REST client + eventMirror + meta fetch
    sessions/          sort + filter helpers (sortAndFilter, homeFilters,
                       panes)
    errors/, util/
  types/domain.ts      Host, ProjectFolder, SessionPreferences, …

server/src/
  server.ts            fastify entry + daemon child-spawn wiring
  daemon.ts            sandbox-agent lifecycle manager (spawn/restart/stop)
  db.ts                better-sqlite3 + migrations
  routes/              sessions, events, projects, health, (meta in server.ts)
```

## Cross-device model

* The sandbox-agent daemon is NOT a session registry — its
  `SDK.listSessions()` reads the client-side IndexedDB persist driver.
* **Sessions / aliases / project folders / event history** all sync via
  the companion server's REST API (see `server/README.md` and
  `web/src/services/sync/`).
* **Settings / filter state / host list** stay per-browser by design.
* A fresh browser connecting to the same daemon + companion sees the
  same sessions + history as any other browser.

## Doc policy

**Keep docs up to date alongside code.** After any non-trivial change:

1. `README.md` (repo root) — if a top-level component or user-facing
   feature changes.
2. `web/README.md` — if a store / service / route was added / renamed.
3. `server/README.md` — if the companion's API or config changed.
4. `AGENTS.md` — if a new convention, rule, or pitfall is worth
   recording for future agents.
5. `migration.md` — if a phase milestone was hit or a decision
   changed.
6. `CLAUDE.md` (this file) — if the top-level orientation changes.
7. `docs/SDK_LIMITATIONS.md` — **any time you work around a sandbox-agent
   SDK or Rivet daemon limitation**. If you add a `catch` to swallow an
   expected SDK error, cast around a wrong type, introduce a client
   mirror / cache / companion endpoint because a primitive is missing,
   rewrite an event payload because the raw stream is unusable, or
   validate input client-side because the daemon error is garbage —
   append a row to that table. See its "When to update this file"
   section for the exact triggers. Don't delete rows when upstream
   ships a fix; strike them through and note the SDK version.

When a single change spans multiple docs, enumerate them in the
commit body so the coverage is auditable.

**Don't create new *.md files unless explicitly asked.** Prefer updating
existing ones.

## Style pointers (see `AGENTS.md` for the full list)

* TypeScript strict, no `any`.
* 2 spaces, single quotes, no semicolons, trailing commas.
* `interface` for object shapes, `type` for unions.
* Don't wrap the `sandbox-agent` SDK — speak to it from stores.
* Never `?? []` inside a zustand selector — allocate a module-level
  `EMPTY_FOO` instead.
* Use `formatError` from `services/errors/` for toast text.
* Absolute cwd paths only — the daemon doesn't expand `~`.
* Only use emojis when the user explicitly asks.

## Useful URLs

* Rivet sandbox-agent: <https://github.com/rivet-dev/sandbox-agent>
* Rivet SDK docs: <https://sandboxagent.dev/docs/sdks/typescript>
* Migration plan: `./migration.md`
* Code style: `./AGENTS.md`
