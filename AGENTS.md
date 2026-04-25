# Agent Guidelines for DroidCode

Single stack — Vite + React 19 + Tailwind v4 + shadcn + TanStack Router
at the repo root, plus a small Node/Fastify companion under `server/`.
The legacy React Native / Expo app was retired in Phase 10 cutover (see
`migration.md`). All work happens here.

## Commands (inside `nix develop`)

```
# web (at repo root)
npm run dev                       # vite dev, port 5173
npm run dev -- --host 0.0.0.0     # LAN / tailnet
npm run build                     # prod build (tsc -b && vite build + PWA)
npm run typecheck                 # tsc -b --noEmit (run before commits)
npm run lint                      # eslint
npm run smoke                     # end-to-end SDK test against a live daemon

# tauri (root)
cargo tauri dev
cargo tauri build

# companion server
cd server
npm run start                     # fastify on :2469
npm run typecheck
```

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
    sandboxAgent/      # SDK connect + fs browse + persist driver
    messaging/         # accumulator
    sessions/          # sortAndFilter, homeFilters (URL state), panes (cross-host tuples)
    db/                # Dexie tables
    sync/              # companion REST client + eventMirror + /v1/meta bootstrap
    errors/, util/
  types/domain.ts      # Host, ProjectFolder, SessionPreferences, etc.

src-tauri/             # Tauri 2 shell (Linux + Android)
public/                # Vite static assets
scripts/               # Smoke + tooling

server/src/
  server.ts            # fastify entry + daemon child-spawn wiring
  daemon.ts            # sandbox-agent lifecycle manager
  db.ts                # better-sqlite3 + migrations
  routes/              # sessions, events, projects, health (meta in server.ts)
```

## Architecture rules

* **Stores call services, never raw SDK/DB directly from components.**
* **Don't wrap the sandbox-agent SDK in another abstraction.** Speak
  to it directly from stores. The SDK *is* the abstraction. The only
  exception is `connectToHost` (caches instances + seeds metadata).
* **Don't add a `?? []` / `?? {}` inside a zustand selector.** It
  allocates a new reference on each call → re-render loops. Use a
  module-level `EMPTY_FOO: Foo[] = []` constant.
* **Don't touch the daemon's filesystem for state sync.** Everything
  shared across clients goes through the companion REST API
  (`services/sync/companion.ts`).
* **Don't throw on missing permissions for stale requests.** SDK's
  `respondPermission` throws "permission not found" when the id was
  already consumed — treat that as a no-op, not a surfaced error.
* **Don't re-introduce the `~`-path shortcut.** The daemon doesn't
  expand tilde. Absolute paths only; `NewSessionDialog` validates
  client-side before `createSession`.
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
* **Chat attachments are app-scoped, not component-scoped.** Do NOT
  call `chatStore.closeSession` from a React `useEffect` cleanup in
  `ChatPane`. Every unmount (StrictMode, layout swap, nav away + back)
  would detach → next mount calls `sdk.resumeSession` → SDK fires a
  new `session/new` + replay-prefix prompt (SDK limitation #6). Five
  of those stacks make the agent forget what's going on. Detach only
  on explicit session destroy (`sessionStore.destroySession` handles
  this) or future explicit disconnect flows.
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
* camelCase: everything else (`chatStore.ts`, `eventMirror.ts`).
* `SCREAMING_SNAKE_CASE`: constants.
* Booleans: `is`/`has`/`can` prefix.
* Handlers: `handleX`. Props callbacks: `onX`.

### Imports (4 sections, in order)
1. React / node core
2. Third-party (sandbox-agent, tanstack, zustand, sonner, lucide, …)
3. Local `@/…`
4. Relative `./…` (same directory only)

### Zustand stores
* Actions are async and wrap in try/catch.
* Set `isLoading: true, error: null` at start; update on finish.
* Use selector hooks in components: `useChatStore((s) => s.byId[id])`.
* Avoid `?? []` in selectors.

### Errors
* Use `formatError` for toast text to unwrap AcpHttpError / AcpRpcError.
* Store errors as `string | null` in state.

## Testing

* `scripts/phase2-smoke.ts` is the current end-to-end proof. Runs via
  `npm run smoke`. Keep it passing.
* No formal test suite yet (Phase 11 follow-up).

## Docs upkeep

**After any non-trivial change**, update:
1. `README.md` (top-level) — if a new component, top-level feature, or
   layout changes. Store/service/route map lives here too.
2. `server/README.md` — if companion API changed.
3. `migration.md` — if a phase milestone was hit or a decision changed.
4. This file — if a new convention / rule / pitfall is worth
   capturing for future agents.
5. `docs/SDK_LIMITATIONS.md` — **any time you paper over a sandbox-agent
   or Rivet daemon quirk**. Append a row. Triggers:
   * `catch` that swallows an expected SDK error that isn't actually a
     failure (e.g. `permission 'X' not found`)
   * `as any` / `as unknown` because the SDK type is wrong at runtime
   * new client-side mirror, cache, or companion endpoint because the
     SDK / daemon doesn't expose a primitive we need
   * stripping / rewriting an event payload because the raw stream is
     unusable as-is (e.g. replay-prefix filter)
   * fallback for a missing browser API that only bites in our flow
     (e.g. `crypto.randomUUID` on insecure origins)
   * client-side input validation because the daemon's error for that
     input is unhelpful (`~` paths)

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
`http://<hostname>:5173`. Also restart the sandbox-agent daemon with
extra CORS origins for the phone's hostname / LAN IP.
