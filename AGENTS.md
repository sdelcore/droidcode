# Agent Guidelines for DroidCode

Single stack — Vite + React 19 + Tailwind v4 + shadcn + TanStack Router
at the repo root. The previous Fastify companion under `server/` was
retired alongside the wagent migration (commit `afc6631`); the client
talks to [wagent](https://github.com/sdelcore/wagent) v1 directly. The
legacy React Native / Expo app was retired in Phase 10 cutover (see
`migration.md`). All work happens here.

## Commands (inside `nix develop`)

```
# web (at repo root)
npm run dev                       # vite dev, port 5173
npm run dev -- --host 0.0.0.0     # LAN / tailnet
npm run build                     # prod build (tsc -b && vite build + PWA)
npm run typecheck                 # tsc -b --noEmit (run before commits)
npm run lint                      # eslint
npm run smoke                     # end-to-end against a live wagent
                                  # (WAGENT_URL, SMOKE_AGENT env)

# tauri (root)
cargo tauri dev
cargo tauri build
```

wagent runs separately — `nix run github:sdelcore/wagent` for the
published v0.1.0, or `cd ~/src/wagent && npm run dev` for working-tree
iteration.

## Project layout

```
src/
  routes/              # TanStack Router — flat set:
                       # /, /chat/$hostId/$sessionId, /settings
  components/
    ui/                # shadcn — copy/paste; don't edit in place
    home/              # HomePage, FilterBar, SessionTile
    chat/              # ChatPane, ChatInput, MessageBubble,
                       # PermissionBanner, SessionSidebar, AddPaneDialog
    settings/          # HostsSection (host CRUD lives here, not a route)
    NewSessionDialog.tsx   # unified creation modal — Sheet on mobile,
                           # Dialog on desktop, inline Add-host flow
    FolderCombobox.tsx     # inline folder picker for New Session
  stores/              # zustand stores
  services/
    wagent/            # HTTP+SSE client (createWagentClient, types,
                       # subscribeEvents). Single source of truth for
                       # the v1 wire — speak to it from stores.
    messaging/         # accumulator
    sessions/          # sessionRegistry (one SSE per session, sticky+refcount),
                       # homeView (URL state + cascade), sessionFields (shared
                       # session-shape helpers), panes (cross-host tuples)
    db/                # Dexie tables (local-only UX state)
    errors/, util/
  types/domain.ts      # Host, ProjectFolder, SessionPreferences, etc.

src-tauri/             # Tauri 2 shell (Linux + Android)
public/                # Vite static assets
scripts/               # Smoke + tooling
```

## Architecture rules

* **Stores call services, never raw fetch/DB directly from components.**
* **Don't hand-roll fetches against `/v1/...`.** Use
  `createWagentClient` / `connectToHost` from `services/wagent/`. If
  the typed client is missing a method, add it there — don't bypass.
* **Don't add a `?? []` / `?? {}` inside a zustand selector.** It
  allocates a new reference on each call → re-render loops. Use a
  module-level `EMPTY_FOO: Foo[] = []` constant.
* **Don't mirror wagent state into Dexie.** Sessions, events, projects
  live on wagent. Dexie is for purely local UX state (host list,
  per-session preferences, host-model defaults).
* **Don't throw on stale permission responses.** wagent treats
  `POST /v1/sessions/:id/permissions/:requestId` for an unknown
  requestId as a no-op (`status: noop`); don't surface it as an error.
* **Don't re-introduce the `~`-path shortcut.** wagent rejects
  `~`-prefixed cwd / project directories with `invalid_cwd` /
  `invalid_directory`. Validate absolute paths client-side before
  calling `createSession` for a friendlier message.
* **Don't add a new top-level route for a new feature unless it really
  needs a distinct URL.** The flat home (`/`) + `/chat/...` + `/settings`
  are the canonical surface. New filters / facets go into the home
  URL search params (`?q=&h=&p=&s=&sort=`). New settings go into cards
  in `/settings`. Don't re-nest hosts/projects/sessions.
* **Put creation UX through the unified `NewSessionDialog`.** It does
  host + folder pickers inline; don't spawn extra drill-downs. Pass
  `initialHostId` / `initialCwd` when called from a context that already
  knows them (e.g. the chat sidebar).
* **Cross-host panes go through the tuple format.** `?extra=` values
  are `hostId:sessionId,…`. Use `services/sessions/panes.ts`'s parse /
  serialize / paneKey helpers — don't hand-roll encoding. Bare
  sessionIds are accepted for legacy URLs only.
* **Chat attachments are app-scoped, not component-scoped.** Use
  `useStickyChat(hostId, sessionId)` from `services/sessions/sessionRegistry`,
  which pins the SSE stream open until `sessionStore.destroySession` calls
  `destroySessionData`. Do NOT add a release/teardown in a React `useEffect`
  cleanup — every unmount (StrictMode, layout swap, nav away + back) would
  detach + re-subscribe an SSE stream, dropping the live event index in the
  gap. Live tiles (sidebar, home grid) can use the ref-counted
  `useWatchLive` / `useWatchLiveMany`; the registry de-dupes streams by
  sessionId, so a sticky chat keeps the wire open even if every tile
  releases.
* **Don't emoji in code.** Unicode icons are fine when they're part of
  the design system (lucide-react).

## Code style (new stack)

### TypeScript
* Strict mode. No `any`.
* `interface` for object shapes, `type` for unions / aliases.
* `import type` for type-only imports.
* Types centralize in `web/src/types/`.

### Formatting (Prettier config)
* 2 spaces. No tabs.
* Single quotes in JS/TS, double in JSX props.
* No semicolons.
* Trailing commas in multiline objects/arrays.

### Naming
* PascalCase: React components (`MessageBubble.tsx`).
* camelCase: everything else (`sessionRegistry.ts`, `homeView.ts`).
* `SCREAMING_SNAKE_CASE`: constants.
* Booleans: `is`/`has`/`can` prefix.
* Handlers: `handleX`. Props callbacks: `onX`.

### Imports (4 sections, in order)
1. React / node core
2. Third-party (tanstack, zustand, sonner, lucide, …)
3. Local `@/…`
4. Relative `./…` (same directory only)

### Zustand stores
* Actions are async and wrap in try/catch.
* Set `isLoading: true, error: null` at start; update on finish.
* Use selector hooks in components: `useChatStore((s) => s.byId[id])`.
* Avoid `?? []` in selectors.

### Errors
* Use `formatError` for toast text to unwrap `WagentError` (parses the
  `{ error: { code, message } }` envelope from wagent v1).
* Store errors as `string | null` in state.

## Testing

* `scripts/phase2-smoke.ts` is the current end-to-end proof. Runs via
  `npm run smoke`. Keep it passing.
* No formal test suite yet (Phase 11 follow-up).

## Docs upkeep

**After any non-trivial change**, update:
1. `README.md` (top-level) — if a new component, top-level feature, or
   layout changes. Store/service/route map lives here too.
2. `migration.md` — if a phase milestone was hit or a decision changed.
3. This file — if a new convention / rule / pitfall is worth
   capturing for future agents.
4. `docs/SDK_LIMITATIONS.md` — most rows are sandbox-agent-era and
   now obsolete. Don't add new sandbox-agent rows. If you discover a
   wagent-side quirk worth documenting, add it under a clearly
   labelled "wagent" section so the history isn't conflated. The
   bigger lever is upstream — file an issue / PR on
   `github.com/sdelcore/wagent` rather than papering over it here.

If a change spans multiple docs, list them in the commit body so
future-you can verify coverage.

## Commit style

Follow the existing history (`git log --oneline`). Subject: `feat:` /
`fix:` / `refactor:` + concise summary. Body explains *why*, not
*what*. Multi-commit features allowed; prefer logical separation over
one mega-commit.

## Visual testing

Not currently wired up for the Vite stack. For mobile testing, run
the dev server with `--host 0.0.0.0` and point the phone at
`http://<hostname>:5173`. Configure wagent with the phone's origin —
either `WAGENT_CORS=*` for dev, or pass an explicit allowlist
(`https://droidcode.example.ts.net,...`).
