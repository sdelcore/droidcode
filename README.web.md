# web/ — droidcode client

Vite 7 + React 19 + Tailwind v4 + shadcn/ui + TanStack Router, packaged
as a PWA (`vite-plugin-pwa`) and optionally wrapped in Tauri 2.

All commands run inside `nix develop` (direnv handles it automatically).

## Dev

```
npm install
npm run dev                     # localhost:5173 only
npm run dev -- --host 0.0.0.0   # LAN / Tailnet visible
```

Tailscale / LAN hostnames that vite-server rejects by default are
pre-allowed in `vite.config.ts` (`allowedHosts`). Add more there if
you're deploying under a new hostname.

## Production build

```
npm run build      # emits dist/ + SW + workbox + PWA manifest
npm run preview    # serve the build locally
```

## Smoke / validation

```
npm run typecheck      # tsc -b --noEmit
npm run lint           # eslint
npm run smoke          # connect to daemon at $SANDBOX_AGENT_URL,
                       # prompt $SMOKE_AGENT (default claude),
                       # dump accumulator output. Proves the SDK +
                       # accumulator path still works end-to-end.
```

Override via env:

```
SANDBOX_AGENT_URL=http://nightman:2468 SMOKE_AGENT=opencode npm run smoke
```

## Tauri desktop (optional)

Needs Rust + webkit2gtk (already in the root flake). The Tauri shell
is committed at `src-tauri/` and points at Vite's `dist/`.

```
cargo tauri dev       # runs npm run dev under the hood, opens window
cargo tauri build     # npm run build + native bundle
```

Identifier is `dev.sdelcore.droidcode`; updater endpoint is not yet
wired (Phase 8).

## Routes

```
/                                                  — flat session home:
                                                     tiles grouped by
                                                     host/project/status,
                                                     filter chips + fuzzy
                                                     search. URL-backed
                                                     filter state.
/chat/$hostId/$sessionId?extra=hostId:sessionId,…  — chat, up to 3 panes +
                                                     sidebar. Panes can
                                                     span hosts (tuple
                                                     format).
/settings                                          — hosts CRUD, theme,
                                                     auto-accept, debug
                                                     logs
```

### Home-page URL filter state

```
/?q=search&h=1,2&p=/abs/path&s=running,completed&sort=alpha
```

- `q` — fuzzy text (alias, cwd, hostname, agent)
- `h` — comma-separated hostIds
- `p` — comma-separated project directories (cwd paths)
- `s` — comma-separated statuses: `running | completed`
- `sort` — `recent | created | alpha` (`recent` is the default)

Project chips cascade from the host selection. Filters serialize
verbatim into the URL so they're shareable and survive back/forward.

## Store + service map

```
stores/
  hostStore         — Dexie-backed; bootstraps on module load via
                      readyPromise, exports requireHost() for gated
                      reads.
  projectStore      — Dexie projects (cwds); mirrors to
                      metadataStore on upsert/remove.
  sessionStore      — calls sdk.listSessions / createSession /
                      destroySession; mirrors to metadataStore too.
                      loadAllHosts() fans out listSessions across every
                      registered host in parallel (home page calls this).
  chatStore         — session-keyed Map of { messages, status,
                      pendingPermission, isStreaming }. Uses the
                      SDK's Session handle + our accumulator.
                      Auto-accepts permissions unless settings say
                      otherwise. Mirrors every event via eventMirror.
  configStore       — per-host agents via listAgents({config:true})
                      + hostModelDefaults from Dexie.
  settingsStore     — theme + autoAcceptPermissions + debug logs,
                      zustand-persist via idb-keyval.
  visibilityStore   — tracks which (hostId, sessionId) is in foreground
                      to gate notifications.
  sessionLiveStore  — ref-counted watch/unwatch for tile live status
                      (streaming dot, needs-input badge, file/tool
                      counts). Used by dashboard + sidebar.
  metadataStore     — shared session + project metadata talking to
                      the droidcode-server companion at /v1/*.
services/
  sandboxAgent/
    client.ts             — connectToHost / disconnectHost cache +
                             Tauri-compatible SandboxAgent.connect.
                             Runs bootstrapFromMetadata after connect.
    persist-indexeddb.ts  — vendored Rivet Inspector driver.
  messaging/accumulator.ts— turns SessionEvent stream into Message[];
                             strips the SDK's replay-prefix prompt.
  db/                     — Dexie v1: hosts, projects, sessionPreferences,
                             hostModelDefaults.
  sessions/
    sortAndFilter.ts      — pure fns: mode/cwd/running, 6 sort presets.
    homeFilters.ts        — URL search schema, facet derivation, flat
                             session projection, home-grid filter + sort.
    panes.ts              — PaneRef tuple encode/parse for cross-host
                             extra= param.
  sync/
    companion.ts          — REST client for droidcode-server. Includes
                             fetchBootstrapMeta() used on first run to
                             seed a default Host from os.hostname().
    eventMirror.ts        — per-session debounced POST queue.
    bootstrapFromMetadata.ts — hydrate SDK persist + Dexie +
                                sessionPreferences on first connect.
  errors/formatError.ts   — unwraps AcpRpcError / AcpHttpError.
  util/id.ts              — crypto.randomUUID fallback.
```

## Things that still live per-browser (not synced)

* `settingsStore` (theme, auto-accept, debug logs) — by design.
* `sessionStore.filters` (mode chips, sort preset) — by design.
* `hostStore.hosts` — by design; you add your own URLs.
* `sessionLiveStore` state — ephemeral.

Everything else (aliases, project folders, chat history) follows you
across browsers pointed at the same daemon + companion.
