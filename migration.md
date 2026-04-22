# DroidCode Migration Plan: Expo → Web-First (Vite PWA + Tauri)

> Status: **Plan only. No code changes yet.**
> Author drafted: 2026-04-15 · Backend target revised: 2026-04-16 · Stack + decisions revised: 2026-04-16
> Source app: `/home/sdelcore/src/droidcode` (Expo SDK 54, React Native, Expo Router)
> Audience: single user (the author). No code-signing, app-store distribution, or paid services anywhere in this plan.

---

## 1. Goal

Replace the React Native + Expo codebase with a **single React/TypeScript codebase** that ships as:

1. **Web app / PWA** — self-hosted via Caddy + Tailscale, used for fast dev iteration and quick phone access
2. **Desktop app** — Tauri 2 wrapper around the same Vite build, daily driver on `nightman` and `dayman`
3. **Mobile app** — Tauri 2 Android wrapper around the same Vite build (Android only — see Decision #4), sideloaded APK

At the same time, the **backend target is changing**: droidcode will talk to a [Rivet `sandbox-agent`](https://github.com/rivet-dev/sandbox-agent) daemon on each host rather than directly to an OpenCode server. Rivet exposes a universal API covering Claude Code, Codex, OpenCode, and Amp, with a TypeScript SDK (`sandbox-agent` npm) that handles session persistence, reconnect, and event normalization. This replaces most of `services/api/` and `services/sse/` with SDK calls. See [wagent/docs/droidcode-migration.md](../wagent/docs/droidcode-migration.md) for the method-by-method mapping.

> **Why Tauri Android over a pure PWA:** see §3 — connecting a browser-served PWA (HTTPS) to a sandbox-agent daemon on `http://localhost:2468` is blocked by browser mixed-content rules. Tauri's native webview bypasses this. The Tailscale-Serve hosted-PWA path is also viable (Decision #2 keeps both), but Tauri is the daily-driver shell.

---

## 2. Target Stack (with current versions, April 2026)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Vite + React 19** | Static-only by design — no server runtime to fight. Simpler than Next.js for a client-only app, AI tooling handles it just as well. Pairs cleanly with Tauri. |
| Language | TypeScript 5.x | Carry over from current project. |
| Styling | **Tailwind CSS v4** | Uses `@theme` directive + PostCSS plugin `@tailwindcss/postcss`. |
| UI kit | **shadcn/ui** (CLI initialized for Tailwind v4 + React 19) | Copy-paste components, AI-friendly. |
| State | **Zustand** (already used) | Swap React Native `AsyncStorage` adapter for `idb-keyval` on web. |
| **Backend client** | **`sandbox-agent` npm SDK** | Replaces custom `apiClient.ts` + `sseClient.ts`. Talks to Rivet daemon (one per host). |
| HTTP (non-SDK) | `fetch` (native) | For the handful of Rivet HTTP endpoints not in the SDK (`/v1/health`, `/v1/fs/entries`). |
| SSE | Handled inside SDK | SDK wraps reconnect + offset replay. Drop `react-native-sse` and custom connection state machine. |
| Local DB | **SDK's IndexedDB persist driver** + **Dexie.js** for app state | SDK's `IndexedDBSessionPersistDriver` covers session records + events. Dexie for hosts, preferences, non-session app data. |
| Routing | **TanStack Router** | File-based, type-safe. Replaces Expo Router; URL structure preserved. (React Router v7 is acceptable fallback.) |
| PWA | **`vite-plugin-pwa`** (Workbox under the hood) | Drop-in: manifest + service worker + offline shell. |
| Desktop wrapper | **Tauri 2.x** | Native webview, ~5MB binaries, mature in 2026. |
| Mobile wrapper | **Tauri 2 mobile (Android only)** | iOS dropped (single-user, no Apple Dev fee). **Capacitor** is the documented fallback if Tauri Android Mobile bites. |
| QR scanner | `html5-qrcode` (web) + Tauri barcode plugin (native) | Used only on phone for adding hosts. |
| Notifications | Web Notifications API (web) + Tauri notification plugin (native) | Android PWA push works fine; native plugin is nicer in Tauri APK. |
| mDNS discovery | Tauri Rust plugin (e.g. `mdns-sd` crate) + IPC | **Cannot** be done from browser; degraded to manual entry on pure web. |
| Hosting (web) | **Self-hosted Caddy on `nightman` + `tailscale serve`** | Free, local, auto-HTTPS via Tailscale's `*.ts.net` cert. No third-party account, no Vercel/Cloudflare. |

---

## 3. The Critical Constraint: localhost + HTTPS + Mixed Content

**This shapes the entire plan.** Document it before anyone burns weeks discovering it the hard way.

The Rivet `sandbox-agent` daemon defaults to plain HTTP on `localhost:2468`. Browsers enforce:

- A page served over **HTTPS cannot make HTTP requests** (mixed content blocking — hard fail, no override for fetch/EventSource).
- A page served over **HTTP** triggers PWA warnings, no service worker, no installable PWA on iOS.
- Browsers do not let one device on a LAN reach `localhost` on another device.

### What this means per platform

| Surface | Connecting to `http://localhost:2468`? |
|---|---|
| Tauri desktop | ✅ Works. Native app, no mixed-content rules. |
| Tauri mobile | ✅ Works. Native webview, plus app can talk to LAN IPs. |
| PWA on user's *own* desktop, served from `http://localhost:3000` | ✅ Works — both HTTP, both localhost. |
| Self-hosted PWA at `https://droidcode.<tailnet>.ts.net`, targeting `http://host:2468` | ❌ Blocked (mixed content). |
| Self-hosted PWA at `https://droidcode.<tailnet>.ts.net`, targeting `https://<host>.<tailnet>.ts.net` via Tailscale Serve | ✅ Works — Tailscale provides trusted certs end-to-end. |
| PWA on phone, targeting LAN IP `http://192.168.x.x:2468` | ❌ Blocked from HTTPS-hosted PWA. |

### Implication for the migration

The original "deploy to Vercel and install PWA on phone" direct-to-localhost plan doesn't work. But with the Rivet-on-Tailscale setup this project is building toward, a hosted PWA is actually viable — `tailscale serve` fronts the daemon with a trusted HTTPS cert at a `*.ts.net` domain, and the mixed-content rule is satisfied.

Practical options for this project (single user, all on Tailscale):

1. **Tauri desktop on workstations + Tauri Android APK on phone.** No HTTPS dance — both talk HTTP to `localhost` or `<host>.<tailnet>.ts.net` directly. Daily-driver path.
2. **Self-hosted PWA + Tailscale Serve.** Caddy on `nightman` serves the static build at `https://droidcode.<tailnet>.ts.net`. Each daemon also fronted with `tailscale serve https / proxy 2468` so the PWA can reach it over HTTPS. No mixed-content issue. Used for fast iteration and "open URL on any phone" convenience.

Both paths are in scope (decision answered in §7). No third-party hosts, no per-month costs. Tailscale + Caddy + the daemons all run on your own machines.

---

## 4. Functional Inventory (what must port)

Full inventory in commit notes; condensed here:

### Routes (Expo Router → TanStack Router, file-based)

| Current URL | Target file | Notes |
|---|---|---|
| `/hosts` | `src/routes/hosts/index.tsx` | Saved + nearby (mDNS, Tauri only) hosts |
| `/hosts/add` | `src/routes/hosts/add.tsx` | Form + QR scan entry |
| `/scanner` | `src/routes/scanner.tsx` | `html5-qrcode` on web; Tauri barcode plugin on Android |
| `/projects/$hostId` | `src/routes/projects/$hostId.tsx` | Pick a `cwd` (Rivet has no spawn/stop lifecycle) |
| `/sessions/$hostId/$projectId` | `src/routes/sessions/$hostId/$projectId/index.tsx` | Multi-select, filters, sort |
| `/sessions/$hostId/$projectId/$sessionId` | `src/routes/sessions/$hostId/$projectId/$sessionId.tsx` | Chat surface (largest screen) |
| `/settings` | `src/routes/settings.tsx` | Model picker, version, debug logs |

### Stores (Zustand — direct port, swap persist adapter)

`hostStore`, `projectStore`, `sessionStore`, `chatStore`, `configStore`, `settingsStore`, `sseStore`, `visibilityStore`. All stay. Replace any `AsyncStorage` persist with `createJSONStorage(() => idbKeyValStorage)`.

### Services (port effort estimate)

| Service | Effort | Approach |
|---|---|---|
| `apiClient` (REST to OpenCode) | **Replace, not port** | Delete. Build `services/sandboxAgent/client.ts` wrapping the `sandbox-agent` SDK. See [wagent/docs/droidcode-migration.md](../wagent/docs/droidcode-migration.md) for method-by-method mapping. |
| `sseClient` + connection state | **Delete** | The SDK handles reconnect, offset, and replay internally. Keep `EventQueue` ordering logic only if still needed to feed the accumulator. |
| `db/*` (SQLite for sessions) | **Medium** | Delete session tables — SDK's `IndexedDBSessionPersistDriver` owns session storage. Keep app-level tables (hosts, preferences) on Dexie. |
| `mdnsDiscovery` | **High** (Tauri only) | Rust plugin + IPC. Stub on web. Hosts can also be added by Tailscale hostname. |
| `notifications` | **Medium** | Branch: Web Notifications API vs Tauri plugin. |
| `networkMonitor` | **Low** | `navigator.onLine` + online/offline events. SDK handles reconnect; this is only for UI status. |
| `messaging/*` (streaming / accumulator) | **Low** | Pure TS logic ports as-is; field mappings change to match Rivet event schema. |
| `updates` (APK) | **N/A** | Replaced by Tauri updater plugin. |
| `debug/logger` | **Low** | Browser-friendly (no native deps). |

### UI components

40+ components in `components/`. None can be reused directly (RN primitives ≠ DOM). Approach: **port screen by screen**, building shadcn-based replacements as needed. shadcn covers: Button, Dialog, Input, Sheet (for bottom panels), Toast, Form, Command (for slash autocomplete), Tabs, Toggle. Custom builds needed: streaming text, code block w/ syntax highlighting (use `shiki`), tool-use blocks, todo panel, diff viewer (use `react-diff-viewer-continued`).

### Slash commands & special features

`/undo /redo /compact /clear` (client-side in v1) plus server-fetched commands (deferred — Rivet doesn't expose these directly). Permission banners (in scope), agent picker, thinking mode toggle, streaming indicators, interrupt handling, bulk session delete, 6 sort presets + filters: all pure UI/state work, no platform blockers. **Deferred to post-cutover:** message revert/fork, multi-choice question modals, server-fetched commands — Rivet SDK doesn't expose these in 0.x.

### Native dependencies — disposition

| Type | Examples | Plan |
|---|---|---|
| Trivially replaced | `react-native-sse`, axios, AsyncStorage | Drop, use web equivalents. |
| Web-compatible already | gesture-handler, reanimated, flash-list, markdown-display | Drop entirely; rebuild with shadcn / framer-motion / `react-window`. |
| Needs rethink | `expo-sqlite`, `expo-notifications`, `expo-camera`, `react-native-zeroconf` | See services table above. |
| Goes away entirely | `expo-intent-launcher`, `expo-haptics`, `expo-image-manipulator`, APK update flow, `react-native-screens`, `react-native-safe-area-context` | Not needed in new stack. |

---

## 5. Phased Migration

Each phase ends with a runnable, validated artifact. Don't move forward until validation passes.

### Phase 0 — Spike (1 day)

Decisions are already resolved in §7 — this phase is the proof-of-concept.

- Spike repo: Vite + React 19 + TypeScript + Tailwind v4 + shadcn `Button` + the `sandbox-agent` SDK.
- Wrap the spike in Tauri 2 (`cargo tauri init` pointing at Vite's `dist/`).
- Hit the **live test daemon on `nightman:2468`** (CORS already allows `http://localhost:5173`):
  ```ts
  const sdk = await SandboxAgent.connect({ baseUrl: 'http://localhost:2468' })
  const agents = await sdk.listAgents()
  ```
- **Validation:** spike running both as `npm run dev` (browser at `http://localhost:5173`) and as `cargo tauri dev` (native window) successfully calls `listAgents()` and renders the array. Confirms: SDK works in both shells, CORS is right, dev loop is acceptable, Tailwind/shadcn render.

### Phase 1 — New repo skeleton (1 day)

- New repo or `web/` subfolder. `npm create vite@latest -- --template react-ts`.
- `npx shadcn@latest init` (Tailwind v4, new-york style, default everything).
- Install router: `npm i @tanstack/react-router @tanstack/router-plugin`.
- Add `vite-plugin-pwa` for manifest + service worker.
- `npm create tauri-app@latest` (or `cargo tauri init`) pointed at Vite's `dist/` directory; set `frontendDist` and `devUrl` in `tauri.conf.json`.
- Lint, typecheck, format configs match current project (`AGENTS.md` style guide).
- **Validation:** `npm run dev` shows blank Vite page; `npm run build && cargo tauri dev` shows same in a Tauri window.

### Phase 2 — Domain layer port (3–4 days)

Pure TypeScript, no UI. Longer than originally estimated because the API layer is being replaced, not ported.

- `types/` (api, domain) — rework against Rivet's schema. Sessions, events, permissions change shape. Keep the accumulator/message domain types.
- `services/sandboxAgent/client.ts` — new. Wraps `SandboxAgent.connect()` per host, keeps SDK instances cached by host ID, exposes the methods droidcode stores need. See [wagent/docs/droidcode-migration.md](../wagent/docs/droidcode-migration.md).
- `services/sandboxAgent/persist-indexeddb.ts` — copy the Rivet Inspector's IndexedDB driver verbatim as starting point.
- `services/messaging/*` — port the accumulator. Adapt field mappings for Rivet's event schema (`agent_message_chunk`, `tool_call`, `tool_call_update`, `plan`, `usage_update`).
- `services/sse/*` — mostly delete. Keep only logic that sequences events for the accumulator if not already subsumed by the SDK.
- `services/db/` — rewrite on Dexie. Recreate `hosts`, `projects`, non-session `preferences`. **Drop** session/event tables — SDK owns that now.
- All Zustand stores — port with `createJSONStorage(() => idbStorage)` swap. Rewrite session-related stores to call `sandboxAgent.*` methods instead of `apiClient.*`.
- **Validation:** unit tests pass with mocked SDK. Smoke test against the live `nightman:2468` daemon: connect, list agents, create a session against the `mock` agent, stream events end-to-end with no UI yet (just console output).

### Phase 3 — Hosts + Projects screens (2–3 days)

Easiest UI screens. Establishes the component patterns for the rest.

- `app/hosts/page.tsx` — list saved hosts. Skip mDNS for now; show "Add manually" only.
- `app/hosts/add/page.tsx` — form (shadcn Form + Input + Switch). Default port 2468.
- `app/projects/[hostId]/page.tsx` — list known project directories per host, pick one to start sessions in. Note: with Rivet, "projects" are just `cwd` values — no spawn/stop lifecycle like OpenCode had. Simplify this screen accordingly.
- Shared layout: nav bar, theme provider, toast container.
- **Validation:** can add a host pointing at local sandbox-agent, list agents available on that host, remember recent project directories.

### Phase 4 — Session list (2 days)

- `app/sessions/[hostId]/[projectId]/page.tsx`.
- Filter bar (shadcn Toggle Group), sort dropdown, multi-select with bulk delete, swipe-to-delete (use a touch-friendly button instead — gestures don't transfer cleanly to web).
- **Validation:** all 6 sort presets work, agent + status filters work, bulk delete works, rename works.

### Phase 5 — Chat screen (5–8 days, the hard one)

- Agent picker in session creation flow — uses `sdk.listAgents({ config: true })` to show Claude / Codex / OpenCode / Amp / Mock.
- Message list with FlashList equivalent (`react-window` or `@tanstack/react-virtual`).
- Streaming text rendering (port existing `MessageAccumulator`, adapt field mappings to Rivet event schema).
- Code block with `shiki` syntax highlighting.
- Tool-use blocks (running / complete states) — driven by `tool_call` + `tool_call_update` events.
- Thinking blocks — driven by `agent_thought_chunk` events.
- Chat input with shadcn `Command` for slash + `@` autocomplete. Slash commands (`/undo /redo /compact /clear`) are client-side for v1.
- Permission banner, question modal (shadcn Dialog). Events come via `session.onPermissionRequest`, not the main event stream.
- Session menu (abort, delete) — shadcn DropdownMenu. Note: revert/fork are not supported by Rivet SDK directly; feature-flag them off for v1.
- Diff panel + Todo panel — shadcn Sheet. Data derived from `plan` events (todos) and tool-call outputs (diffs); no separate endpoints.
- Connection status, streaming indicator, interrupt banner.
- Events wired through `session.onEvent(handleRivetEvent)` + `session.onPermissionRequest(handlePermission)`.
- **Validation:** end-to-end — create session with any agent, send message, watch streaming, accept a permission, abort mid-stream. Do this against a real sandbox-agent daemon.

### Phase 6 — Settings + auxiliary (2 days)

- Model picker (provider + model dropdowns).
- Debug logs viewer + copy-to-clipboard (`navigator.clipboard`).
- Version info (Tauri exposes app version via plugin).
- **Validation:** model selection persists across reload; clipboard copy works in browser + Tauri.

### Phase 7 — PWA polish + self-hosting via Caddy + Tailscale (2–3 days)

- Manifest icons, theme color, splash screen, offline shell via Workbox (`vite-plugin-pwa`).
- Install prompt UX (custom button using `beforeinstallprompt`).
- **Self-host the build:** Caddy on `nightman` serving Vite's `dist/` over `tailscale serve` at `https://droidcode.<tailnet>.ts.net`. NixOS module + opnix integration noted in setup docs.
- **Daemon over HTTPS:** document `tailscale serve https / proxy 2468` on each host so the PWA reaches the daemon at `https://<host>.<tailnet>.ts.net` (no mixed-content). The "add host" form must accept these URLs.
- **Validation:** Lighthouse PWA score ≥ 90; "Add to Home Screen" works on Chrome desktop; hosted PWA on `nightman` can connect to a sandbox-agent over a Tailscale Serve URL from `dayman` and from the Android device.

### Phase 8 — Tauri desktop polish (2 days)

- App icon, window sizing, system tray (optional), menu bar.
- Tauri updater plugin configured to pull updates from a static URL on `nightman` (Caddy-served, Tailscale-fronted). No code-signing; single-user, fine.
- Build pipelines: Linux AppImage (primary — both `nightman` and `dayman` are NixOS). macOS DMG / Windows MSI only if/when needed.
- **Validation:** install built artifact on `nightman` and `dayman`; confirm it connects to `localhost:2468` and to a peer's Tailscale URL.

### Phase 9 — Tauri Android (3–4 days)

- `cargo tauri android init`. (No iOS — single-user, no Apple Dev fee.)
- mDNS via Rust plugin (`mdns-sd` crate) — exposes results via Tauri IPC; web layer reads through a `discovery` service shim that has web-stub + tauri-impl variants.
- QR scanner: Tauri barcode plugin instead of `html5-qrcode`.
- Notifications: Tauri notification plugin.
- APK distribution: just copy the built `.apk` to the phone (or `adb install`). No Play Store.
- **Fallback if Tauri Android Mobile bites:** rip out the Tauri Android target and wrap the same Vite build with **Capacitor** instead. UI/state code is unchanged; only the native shell swaps.
- **Validation:** install APK on the Android phone, find a server via mDNS, scan a QR, complete a chat round-trip against `nightman` over Tailscale.

### Phase 10 — Cutover (1 day)

- Tag final Expo release of current app.
- Move Expo source to `legacy/` branch.
- Promote new repo (or `web/` folder) to root.
- Update `CLAUDE.md`, `AGENTS.md`, `README.md`.
- Archive native build scripts.

**Total estimated effort: 4–6 weeks of focused work, longer with vibe-coding iteration.**

### Interim milestones beyond the phase plan (2026-04-17)

Phases 1–6 landed roughly as drafted. Phase 5 shipped as an MVC (no shiki / virtualization / diff + todo sheets yet). Mid-stride the design expanded based on real use:

* **Dashboard grid** (tiles with inline rename) replaced the session list.
* **Live tile status** (streaming / needs-input / file + tool counts) via a ref-counted `sessionLiveStore` that background-subscribes per visible session.
* **Multi-pane chat**: `chatStore` refactored to a session-keyed Map; `/chat/$hostId/$sessionId?extra=sid,sid` supports up to 3 panes on desktop, tabs on mobile. Each pane is a `ChatPane`.
* **Session sidebar + "New session"** directly from the chat view.
* **Cross-device sync via `droidcode-server`** (see Decision 6). Sessions / aliases / projects / event history all mirror to a SQLite-backed companion. Old `~/.droidcode.json` experiment deleted.

### Phase 6.5 — Flat home + embedded daemon + mobile-first (2026-04-22)

Second round of design expansion, driven by real mobile use:

* **Flat session home at `/`** replaces the hosts → projects → sessions drill-down entirely. Every session across every host renders as a tile in one mobile-first grid (1 col phone, 2 col tablet, 3–4 col desktop). Filter chips for hosts / projects / status cascade; fuzzy text search runs over alias / cwd / agent. Filter state lives in URL search params so filters are shareable and survive back/forward.
* **Cross-host panes** — `?extra=` upgraded from `sessionId[]` to `hostId:sessionId[]` tuples (`services/sessions/panes.ts`). Legacy bare-id tokens still parse as same-host for old bookmarks. Multi-select on the home grid → "Open in panes" button emits tuple-encoded URLs. TabBar + TopBar show a "multi-host" indicator when panes span hosts.
* **Unified New Session modal** — `NewSessionDialog` absorbs the "+ Add host" flow inline (name / host / port / HTTPS / token → health ping → save). Folder picker uses a `<datalist>` of remembered project folders; typing a new absolute path persists a ProjectFolder on submit; `~` / relative paths are rejected with a clear error. Bottom sheet on mobile, centered dialog on desktop. Inputs use 16px font-size to prevent iOS zoom.
* **Embedded daemon in the companion** — `droidcode-server` spawns `sandbox-agent server` as a child on startup, tracks PID, restarts on crash with exponential backoff, shuts it down on SIGTERM/SIGINT. One `npm run start` brings up both. The `wagent` repo is pinned as a flake input so `sandbox-agent` is on PATH inside `nix develop` without a separate checkout.
* **Hostname-seeded default host** — new `GET /v1/meta` endpoint returns `{ hostname, daemon: { port, running, corsOrigins, … } }`. On first app load with zero hosts, the client fetches it and auto-creates a Host named after the machine (e.g. `nightman`) pointing at the local daemon. Marked in localStorage so it doesn't re-seed if the user deletes it.
* **Routes collapsed** — `/hosts`, `/hosts/add`, `/projects/$hostId`, `/sessions/$hostId/$projectId` all deleted. Host CRUD moves into a `HostsSection` card in `/settings`. Remaining routes: `/`, `/chat/$hostId/$sessionId`, `/settings`.
* **SDK_LIMITATIONS** — added row 17 (`sandbox-agent --cors-allow-origin` rejects `*`; companion enumerates origins explicitly).

Phases 7–10 still pending.

---

## 6. Validation Strategy

A migration is only as good as your ability to prove behaviour matches.

### Continuous validation harness

The `wagent` repo on `nightman` already runs a public-on-tailnet `sandbox-agent` daemon for exactly this purpose:

```bash
# On nightman, in ~/src/wagent
npm run serve
# = sandbox-agent server --no-token --host 0.0.0.0 --port 2468 \
#   --cors-allow-origin http://localhost:5173 --cors-allow-origin http://localhost:3000
```

Use this daemon as the integration target throughout the migration:

- **From nightman dev box:** `http://localhost:2468`
- **From dayman / phone over LAN:** `http://nightman:2468` (Tauri only — browsers will block on PWA target)
- **From phone over Tailscale:** `https://nightman.<tailnet>.ts.net` once `tailscale serve --bg --https=443 http://localhost:2468` is wired in Phase 7
- **CORS allow-list:** Vite default `5173` + alt `3000`. If Phase 7 hosts the PWA at a different origin, extend the wagent `npm run serve` script accordingly.

Every phase from Phase 0 onward should connect to this daemon at least once before being marked done.

### Three layers

1. **Unit tests** — port existing Jest tests for stores and services; they should pass with adapter swaps. Coverage gate: stores ≥ 80%.
2. **Integration tests** — `__tests__/integration` patterns kept; run against the live `nightman:2468` daemon in dev, against a locally-started `sandbox-agent` in CI.
3. **Manual parity checklist** — feature-by-feature comparison of old app vs new, both pointed at the same daemon side-by-side. Checklist below.

### Parity checklist (run before declaring each phase done)

- [ ] Add host (manual + via QR) → host appears, persists across reload.
- [ ] mDNS-discovered host shows up (Tauri only).
- [ ] Agents list populates from Rivet (`listAgents`) — Claude, Codex, OpenCode, Amp visible where installed.
- [ ] Session list: all sorts + filters; bulk delete confirms; rename persists.
- [ ] Chat: create session with explicit agent + cwd; send message; see streaming; code blocks render with syntax highlight.
- [ ] Tool-use blocks show pending → running → complete states.
- [ ] Thinking block expands/collapses.
- [ ] Permission banner: Accept / Accept Always / Deny — all wire through `respondPermission`.
- [ ] Slash commands: `/undo /redo /compact /clear` work client-side.
- [ ] `@` mention: file path autocomplete works.
- [ ] Abort during stream — UI shows interrupted state; `session.interrupt()` succeeds.
- [ ] Diff panel and todo panel open as sheets; data derived from events.
- [ ] Model/mode/thought pickers: changes persist per-session; populated from `session.getConfigOptions()`.
- [ ] Reconnect after network drop: SDK handles offset; missed events arrive; no duplicates.
- [ ] Session survives daemon restart: SDK's `resumeSession` replays last events as context.
- [ ] Notifications fire on completion (web + Tauri).
- [ ] App restores last route on reload.
- [ ] **Deferred to v2 (not in parity checklist):** revert, fork, server-fetched commands, question modal. Rivet SDK doesn't expose these directly; either drop or implement client-side.

---

## 7. Risks & open questions

| Risk | Severity | Mitigation |
|---|---|---|
| **Mixed-content blocks PWA → localhost** | Critical | Tauri APK is the daily driver; hosted PWA reaches daemons via Tailscale Serve HTTPS URLs. Documented in §3. |
| **Rivet SDK breaking changes during 0.x** | Medium | Pin to `sandbox-agent@0.4.x`. Budget for one SDK upgrade during migration. |
| **Feature regressions: revert, fork, server commands** | Medium | These were OpenCode features; Rivet doesn't cover them. Feature-flag off for v1; revisit post-cutover. |
| **mDNS impossible from browser** | Medium | Tauri Rust plugin; degrade to manual entry on PWA (Tailscale hostname is fine substitute). |
| **No SQLite data import path** | Low | Single-user; just re-add hosts on first launch. Acceptable. |
| **Tauri Android Mobile bites** | Medium | Capacitor documented as fallback in Phase 9; everything above the native shell is portable. |
| **Tailwind v4 is newer; some shadcn components may lag** | Low | shadcn officially supports v4 as of 2026. Worst case: pin to v3 short-term. |
| **Bundle size drift** from copying lots of shadcn components | Low | Tree-shaking + tracking in CI. |
| **Background SSE on mobile** (browser tab killed) | Medium for PWA, low for Tauri | Tauri can keep connection alive in background. PWA: accept that "last seen" is when tab was foregrounded. |
| **AGENTS.md style guide port** | Low | Re-read, update for web idioms (RN primitives → DOM, etc). |

### Decisions (resolved 2026-04-16)

1. **Audience:** single user (the author). No code-signing, no app stores, no scary-installer mitigations.
2. **Phone access:** both — self-hosted PWA over Tailscale for dev / quick access, Tauri Android APK (sideloaded) for daily use.
3. **Daemon location:** both local and remote daemons supported; each is an entry in the host list. Bundling the daemon inside the desktop app is a future improvement, **not in scope** for this migration.
4. **iOS:** dropped. Android-only mobile target — no Apple Dev fee, no Xcode build chain.
5. **Credentials:** docs cover both API key and OAuth on the host. OAuth is the author's daily path; API key is the simple-default doc'd path. Credentials live on the daemon, never in droidcode.
6. **Cross-device sync:** ~~per-daemon sessions only~~ **REVISED 2026-04-17.** We discovered during Phase 5 that the `sandbox-agent` SDK stores sessions client-side (in its `SessionPersistDriver`), and the daemon doesn't expose a session-list REST endpoint. So "pointing at the same daemon URL" didn't actually share state. We added a companion service (`server/`, `droidcode-server` on port 2469) with SQLite-backed session / event / project tables. Every browser talks to both the daemon (chat) and the companion (shared state + mirrored events). This is a scope expansion from the original plan (which §8 said wouldn't happen); worth it to make multi-device viable. Details in `server/README.md`.
7. **Hosting:** self-host the static build via Caddy on `nightman` exposed by `tailscale serve`. No Vercel, no Cloudflare, no third-party account.

---

## 8. What this plan deliberately does NOT do

- Doesn't try to import existing SQLite data (low value; just re-add hosts).
- Doesn't keep the Expo codebase running in parallel after Phase 10 cutover.
- Doesn't preserve direct OpenCode-server compatibility. If a native OpenCode server needs to be reached, point sandbox-agent at it via its `/opencode` compatibility layer on the host side, not by keeping dual protocol support in the client.
- Doesn't add new features during migration. Feature parity first, then iterate.
- ~~Doesn't introduce a server-side component beyond the per-host daemon.~~ **Revised:** does introduce `droidcode-server` (Fastify + SQLite) on port 2469, one per daemon host. See Decision 6.
- Doesn't target iOS.

### Future improvements (out of scope for this migration)

- **Bundle `sandbox-agent` inside the desktop Tauri app.** Launch + own the daemon process from within the app for one-click local setup (no separate `sandbox-agent server` invocation). Tauri sidecar pattern fits well.
- **Cross-daemon session sync** so the same session shows up no matter which daemon you're connected to. Needs a real sync layer; deliberately out of scope here.
- **Code-signing / store distribution** if this ever stops being single-user.

---

## 9. Sources

- [Vite (official)](https://vitejs.dev)
- [TanStack Router](https://tanstack.com/router/latest)
- [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app)
- [shadcn/ui Tailwind v4 setup](https://ui.shadcn.com/docs/tailwind-v4)
- [Tauri 2 (official)](https://v2.tauri.app/)
- [Tauri 2.0 stable release notes](https://v2.tauri.app/blog/tauri-20/)
- [Tauri vs Electron 2026 comparison](https://tech-insider.org/tauri-vs-electron-2026/)
- [Capacitor (Tauri Mobile fallback)](https://capacitorjs.com)
- [Caddy server](https://caddyserver.com/docs/)
- [Tailscale Serve docs](https://tailscale.com/kb/1242/tailscale-serve)
- [Zustand persist with IndexedDB / idb-keyval](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data)
- [Dexie.js](https://dexie.org)
- [html5-qrcode](https://github.com/mebjas/html5-qrcode)
- [Rivet sandbox-agent GitHub](https://github.com/rivet-dev/sandbox-agent)
- [Rivet TypeScript SDK docs](https://sandboxagent.dev/docs/sdks/typescript)
- [Rivet session persistence docs](https://sandboxagent.dev/docs/session-persistence)
- [wagent repo docs/droidcode-migration.md](../wagent/docs/droidcode-migration.md) — method-by-method API mapping
