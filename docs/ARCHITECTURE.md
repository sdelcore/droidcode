# Architecture

DroidCode is a single-stack Vite + React 19 client that talks directly to
[wagent](https://github.com/sdelcore/wagent) over HTTP+SSE. There is no
companion server, no SDK wrapper, no daemon-side persist driver — wagent
is the registry.

```
┌──────────────────────────────────────────────────────────┐
│  React app (Vite + TanStack Router)                      │
│  ┌────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │  routes/   │   │  components/ │   │   stores/    │    │
│  └─────┬──────┘   └──────┬───────┘   └──────┬───────┘    │
│        └──────── components read ──────────►│            │
│                                              │            │
│                            stores call …    │            │
│                                              ▼            │
│                                ┌─────────────────────┐    │
│                                │  services/wagent/   │    │
│                                │  createWagentClient │    │
│                                └──────────┬──────────┘    │
└───────────────────────────────────────────┼──────────────┘
                                            │ HTTP + SSE (v1)
                                            ▼
                                ┌─────────────────────┐
                                │  wagent (host)      │
                                │  Fastify + SQLite + │
                                │  agent supervisor   │
                                └─────────────────────┘
```

## Layers

### Routes (`src/routes/`)

TanStack Router file-based routing, three top-level routes:

| Route | Purpose |
|---|---|
| `/` | Flat session home — tiles, filter chips, fuzzy search, URL-backed filter state. |
| `/chat/$hostId/$sessionId?extra=hostId:sessionId,…` | Multi-pane chat. Up to 3 panes + sidebar. Panes can span hosts. |
| `/settings` | Hosts CRUD, theme, auto-accept, debug logs. |

Filter / pane state lives in URL search params so it's shareable and
survives back/forward.

### Components (`src/components/`)

* `ui/` — shadcn copy-paste primitives. Don't edit in place.
* `home/` — `HomePage`, `FilterBar`, `SessionTile`.
* `chat/` — `ChatPane`, `ChatInput`, `MessageBubble`, `PermissionBanner`,
  `SessionSidebar`, `AddPaneDialog`, `Markdown`.
* `settings/` — `HostsSection`.
* `NewSessionDialog.tsx` — unified creation modal (Sheet on mobile,
  Dialog on desktop, inline Add-host flow).
* `FolderCombobox.tsx` — inline folder picker for New Session, drives
  `client.listFsEntries(path)` against the selected host.

### Stores (`src/stores/`, Zustand)

| Store | Owns |
|---|---|
| `hostStore` | Local list of wagent endpoints + active host. Persisted to Dexie. |
| `sessionStore` | Session list per host, fetched from `client.listSessions()`. |
| `chatStore` | Per-session attachments: live SSE subscription, accumulator state, last seen `eventIndex`. |
| `sessionLiveStore` | Ephemeral pending-permission flags shown on home tiles. |
| `configStore` | Per-session config overrides (model, agent kind). |
| `settingsStore` | Theme, auto-accept toggle, debug-log toggle. |
| `visibilityStore` | Tab visibility / focus / online — drives catch-up polls. |

Architectural rules:

* **Components never call services directly.** Always go through a store.
* **Stores never hand-roll fetches against `/v1/...`.** Use
  `createWagentClient` / `connectToHost` from `services/wagent/`.
* **Don't `?? []` inside a selector** — it allocates a new reference on
  every call and triggers re-render loops. Use a module-level
  `EMPTY_FOO: Foo[] = []`.

### Services (`src/services/`)

* `wagent/` — Typed v1 client (`createWagentClient`, `subscribeEvents`)
  and re-exported types. Single source of truth for the wire.
* `messaging/` — `MessageAccumulator` reduces an `EventEnvelope[]`
  stream into a flat `Message[]` for rendering. Splits on
  `user_message_chunk` so each turn opens a fresh assistant bubble.
* `db/` — Dexie tables: `hosts`, `projects`, `sessionPreferences`,
  `hostModelDefaults`. Local-only UX state — wagent owns sessions,
  events, and projects.
* `sessions/` — Sort + filter helpers (`sortAndFilter`, `homeFilters`,
  `panes`).
* `errors/` — `WagentError` formatter (`formatError`) for toast text.
* `util/` — `randomId` (insecure-context fallback for
  `crypto.randomUUID`), small helpers.

## Event flow

```
wagent /v1/sessions/:id/events/stream  ──SSE──►  subscribeEvents
                                                     │
                                                     ▼
                                             chatStore (per-session
                                             attachment, accumulates)
                                                     │
                                                     ▼
                                       MessageAccumulator → Message[]
                                                     │
                                                     ▼
                                            ChatPane renders
```

* Each event has a monotonic `eventIndex`; the chatStore tracks
  `lastEventIndex` per attachment.
* On `visibilitychange` / `focus` / `online`, the store does a catch-up
  `client.listEvents(sessionId, { after: lastEventIndex })` to repair
  any silent SSE drop, then dedupes by `eventIndex`.
* SSE replay on reconnect is server-side: the client resumes by setting
  `Last-Event-ID` to its last index, and wagent replays everything past
  it before subscribing live.

## Permission flow

1. Agent emits `permission_request` with a `requestId` + tool-call info.
2. `chatStore.handlePermission` decides: auto-accept (if user enabled it
   for this kind) or surface a banner via `PermissionBanner`.
3. Resolution: `client.respondPermission(sessionId, requestId, outcome)`
   where outcome is `'allow_always' | 'allow_once' | 'reject'`.
4. wagent emits `permission_resolved`; the banner clears.

The home tile's `?` badge is driven by `sessionLiveStore`; it clears
when the resolution event arrives even if no chat pane is mounted.

## Local UX state in Dexie

| Table | Purpose |
|---|---|
| `hosts` | The wagent endpoints the user has added (or auto-seeded). |
| `projects` | Per-host remembered cwds (just for the folder picker). |
| `sessionPreferences` | Per-session text-input draft, picked agent, thinking-mode, attachments. |
| `hostModelDefaults` | Last-used model per host so creation defaults are sane. |

None of these sync cross-device — settings, filter state, host list are
intentionally per-browser.

## Tauri shell (`src-tauri/`)

Tauri 2 wraps the same Vite app for desktop (Linux AppImage primary)
and Android targets. Identifier `dev.sdelcore.droidcode`. The shell
doesn't add features — it's a window around the PWA.

## What's deliberately not in the architecture

* **No SDK wrapper.** The wagent client is the abstraction.
* **No worktree/spawn primitives.** wagent doesn't manage containers
  or sandboxes; it spawns coding-agent subprocesses on the host the
  user pointed at.
* **No companion server.** Removed in commit `afc6631`.
* **No client-side session registry.** `client.listSessions()` reads
  wagent's SQLite, not IndexedDB.
