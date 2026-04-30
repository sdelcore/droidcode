# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repo.

## Repo overview

DroidCode is a web + desktop + Android Tauri client for
[wagent](https://github.com/sdelcore/wagent), a self-hosted HTTP+SSE
daemon that runs coding agents (Claude, pi). The Vite + Tauri stack is
the only stack — the legacy React Native / Expo app was deleted in
Phase 10 cutover (see `migration.md`).

* **Web app lives at the repo root** — `src/`, `src-tauri/`, `public/`,
  `package.json`, `vite.config.ts`. All new work goes here.
* **No companion server.** The previous `server/` Fastify+SQLite
  service was retired in commit `afc6631` ("migrate droidcode from
  Rivet SDK to wagent HTTP+SSE client"). Sessions, events, projects
  all live on wagent now; the client speaks v1 directly.

For conventions, architecture rules, and pitfalls, **read `AGENTS.md`
first.** It's the canonical style guide.

For the end-to-end migration plan and decisions, **read `migration.md`.**

## Running locally

Everything assumes `nix develop` (direnv handles it automatically).
Two processes: wagent on `:2468`, Vite on `:5173`.

```bash
# 1. wagent daemon — pick one
nix run github:sdelcore/wagent             # published v0.1.0
cd ~/src/wagent && npm run dev             # working-tree iteration

# 2. Web client
npm install && npm run dev                  # vite on :5173
```

Open `http://localhost:5173`. On first load the client auto-seeds a
Host from wagent's `/v1/meta` hostname — no manual "Add host" step
for the common single-machine case.

wagent config lives in its own repo. Common env vars:

| Var | Default | Purpose |
|---|---|---|
| `WAGENT_HOST` | `0.0.0.0` | listen host |
| `WAGENT_PORT` | `2468` | listen port |
| `WAGENT_DB` | `~/.local/share/wagent/wagent.sqlite` | SQLite path |
| `WAGENT_TOKEN` | *(unset)* | bearer token |
| `WAGENT_CORS` | `*` | comma-separated origin allowlist |

## Key commands (inside `nix develop`)

```bash
npm run dev                        # vite dev
npm run dev -- --host 0.0.0.0      # bind LAN / tailnet
npm run build                      # prod (tsc + vite + PWA)
npm run typecheck                  # tsc -b --noEmit
npm run lint                       # eslint
npm run smoke                      # end-to-end against a live wagent
                                   # (WAGENT_URL, SMOKE_AGENT env)

cargo tauri dev
cargo tauri build
```

## Project layout

```
src/
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
    FolderCombobox.tsx (inline folder picker for New Session)
  stores/              zustand — see AGENTS.md / store map
  services/
    wagent/            HTTP+SSE client (createWagentClient, types,
                       subscribeEvents). Single source of truth for
                       the v1 wire.
    messaging/         event accumulator → Message[]
    db/                Dexie (hosts, projects, sessionPreferences,
                       hostModelDefaults) — local-only UX state
    sessions/          sessionRegistry (one SSE per session — chat +
                       live status), homeView (URL ↔ filters cascade),
                       sessionFields (shared session-shape helpers),
                       panes (cross-host pane tuples)
    errors/, util/
  types/domain.ts      Host, ProjectFolder, SessionPreferences, …

src-tauri/             Tauri 2 shell (Linux + Android targets).
public/                Vite static assets.
scripts/               Smoke (phase2-smoke.ts) + tooling.
```

## Cross-device model

* wagent is the registry. `GET /v1/sessions` returns server-side rows,
  not a client-side persist driver.
* **Sessions / aliases / event history / projects** all live on
  wagent's SQLite; any browser pointed at the same wagent sees the
  same state.
* **Settings / filter state / host list** stay per-browser by design.
* SSE has monotonic event indices + `Last-Event-ID` resume; the chat
  store does a catch-up `listEvents({ after })` poll on
  `visibilitychange`/`focus`/`online` to survive silent SSE drops.

## Doc policy

**Keep docs up to date alongside code.** After any non-trivial change:

1. `README.md` (repo root) — if a top-level component, layout, or
   user-facing feature changes. The store/service/route map lives
   here too now.
2. `AGENTS.md` — if a new convention, rule, or pitfall is worth
   recording for future agents.
3. `migration.md` — if a phase milestone was hit or a decision
   changed.
4. `CLAUDE.md` (this file) — if the top-level orientation changes.
5. `docs/SDK_LIMITATIONS.md` — most rows are sandbox-agent-era and
   now obsolete; don't add new sandbox-agent rows. If you discover a
   wagent-side quirk worth documenting, add it under a clearly
   labelled "wagent" section so the history isn't conflated. The
   bigger lever is upstream — file an issue / PR on
   `github.com/sdelcore/wagent` rather than papering over it here.

When a single change spans multiple docs, enumerate them in the
commit body so the coverage is auditable.

**Don't create new *.md files unless explicitly asked.** Prefer updating
existing ones.

## Style pointers (see `AGENTS.md` for the full list)

* TypeScript strict, no `any`.
* 2 spaces, single quotes, no semicolons, trailing commas.
* `interface` for object shapes, `type` for unions.
* Use `createWagentClient` / `connectToHost` from `services/wagent/`;
  don't hand-roll fetches against `/v1/...`.
* For per-session state (messages, live counters, pending permissions),
  go through `sessionRegistry` — `useStickyChat` for chat panes,
  `useWatchLive` / `useWatchLiveMany` for live tiles. Don't subscribe
  to SSE outside the registry.
* Never `?? []` inside a zustand selector — allocate a module-level
  `EMPTY_FOO` instead.
* Use `formatError` from `services/errors/` for toast text.
* Absolute cwd paths only — wagent rejects `~`-prefixed paths with
  `invalid_cwd` (validate client-side for a friendlier message).
* Only use emojis when the user explicitly asks.

## Useful URLs

* wagent: <https://github.com/sdelcore/wagent>
* Migration plan: `./migration.md`
* Code style: `./AGENTS.md`
