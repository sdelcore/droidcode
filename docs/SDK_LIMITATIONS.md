# sandbox-agent SDK limitations

Running log of SDK (and adjacent Rivet daemon) limitations we've hit
during the migration, plus the workaround that's live in the code
today. Keep this up to date — if you have to cast around a type, write
a fallback, or catch a specific error class to paper over something,
add a row here.

| # | Limitation | Impact | Workaround | Code | Noted |
|---|---|---|---|---|---|
| 1 | `sdk.listSessions()` reads from the **client-side persist driver**, not the daemon. There is no `GET /v1/sessions` REST endpoint. | A fresh browser pointed at the same daemon sees zero sessions — "sessions live on the daemon" from the plan isn't true. | Run `droidcode-server` (companion) at port 2469, mirror sessions + events + projects to its SQLite. Client bootstraps from it. | `server/`, `web/src/stores/metadataStore.ts`, `web/src/services/sync/*` | 2026-04-17 |
| 2 | `sdk.destroySession(id)` is a **soft delete** — just stamps `destroyedAt` on the SessionRecord. No delete primitive exposed; records stay in the persist driver forever. | Every `listSessions` keeps returning "deleted" sessions; dashboard rehydrates them after delete. | Filter `r.destroyedAt` out in `sessionStore.listRecordsForHost`. | `web/src/stores/sessionStore.ts::listRecordsForHost` | 2026-04-17 |
| 3 | `Session` has **no `interrupt()` / `cancel()` method**, despite the migration plan claiming it does. | Can't stop an in-flight prompt by calling the obvious method. | `attached.session.rawSend('session/cancel', {})`. | `web/src/stores/chatStore.ts::interrupt` | 2026-04-16 |
| 4 | The TS type `SessionRecord.sessionInit` is `Omit<NewSessionRequest, "_meta">` — strips `_meta` from the type even though the **runtime value preserves it**. | Can't reach `_meta` through the typed path; attempting to put session-level metadata there is fragile. | We initially tried storing aliases in `sessionInit._meta.droidcode` (round-trips fine at runtime), but switched to the companion server instead. Leaving the note so no-one wastes time re-trying it. | n/a | 2026-04-17 |
| 5 | `_meta` is only settable at **create time** (`createSession` → `sessionInit._meta`). No `updateSessionMeta` method. | Can't patch metadata on an existing session — rename can't use `_meta`. | Companion server's `PUT /v1/sessions/:id` owns alias + metadata. | `server/src/routes/sessions.ts` | 2026-04-17 |
| 6 | On `resumeSession`, the SDK **prepends a synthetic text part** (`"Previous session history is replayed below as JSON-RPC envelopes..."` + JSON dump) to the next client `session/prompt` so the agent can re-prime its context. | The whole JSON dump renders as a user message bubble if you forward the event through your accumulator unchanged. | `MessageAccumulator.extractClientPrompt` drops any text part that starts with that prefix, and suppresses the event entirely if nothing else is left. | `web/src/services/messaging/accumulator.ts::REPLAY_PREFIX` | 2026-04-16 |
| 7 | Rivet's `mock` agent has an upstream bug: **infinite `session/new` loop** on createSession. | Can't use `mock` for the smoke test even though it's supposed to be the offline/deterministic option. | Smoke test defaults to `claude`. Document via `SMOKE_AGENT` env override. | `web/scripts/phase2-smoke.ts` | 2026-04-16 |
| 8 | `session.respondPermission(id, reply)` **throws `"permission 'X' not found"`** the second time a reply is attempted for the same id (first call consumes it from `pendingPermissionRequests`). Also fires on replays. | Bubbles a scary red "Permission reply failed" banner to the user even though nothing bad happened. | `isPermissionNotFound(err)` guards both the auto-accept path and the manual `respondPermission` path; treats those as a silent no-op. | `web/src/stores/chatStore.ts::isPermissionNotFound` | 2026-04-16 |
| 9 | `session.onPermissionRequest` may fire for the **same permission twice** on reconnect / resume (e.g. StrictMode double-mount, replay). | Couples with #8 to produce auto-accept "failures" that are actually no-ops. | Same guard as #8. | `web/src/stores/chatStore.ts::handlePermission` | 2026-04-16 |
| 10 | ACP errors come in **two shapes**: `AcpHttpError` (HTTP, has `.problem.detail/title`) and `AcpRpcError` (JSON-RPC, has `.code` + `.message`). | Toasts were showing unhelpful `.message` text like `"Internal agent error: Internal error"`. | `formatError(err, fallback)` unwraps `.problem.detail/title` first, falls back to `Error.message`. | `web/src/services/errors/formatError.ts` | 2026-04-16 |
| 11 | `ContentChunk.messageId` is **experimental and often absent** from real agents' output (Claude doesn't set it). The spec says "A change in messageId indicates a new message" but we can't rely on it. | Without message boundaries, every `agent_message_chunk` gets merged into one ever-growing assistant bubble. | Accumulator treats a client `session/prompt` (user input) as the turn boundary: when a user message lands, the next agent chunk opens a new assistant message. | `web/src/services/messaging/accumulator.ts::resolveOrCreateMessage` | 2026-04-16 |
| 12 | The SDK **does not emit `user_message_chunk`** for the client's own prompts. | Without that, our accumulator would only show agent output; the user's own prompts would never render. | Same as #11 — synthesize a user Message from the client-side `session/prompt` event, then the same turn-boundary logic handles agent replies. | `web/src/services/messaging/accumulator.ts::extractClientPrompt` | 2026-04-16 |
| 13 | Daemon's `/v1/fs/entries?path=~` doesn't expand tilde (returns 404 "path not found"). | Any "remembered folder" that starts with `~` silently fails when passed as cwd to createSession — surfaces as `AcpRpcError: Internal agent error: Internal error`. | Client-side input validation in `/projects/$hostId`: reject `~`-prefixed and non-absolute paths with a clear toast. | `web/src/routes/projects/$hostId.tsx::handleAdd` | 2026-04-16 |
| 14 | Daemon's only write endpoint on `/v1/fs/*` is `PUT /v1/fs/file` (single-file overwrite, body as text). No mkdir, no partial updates. | Tried briefly for cross-device state (`~/.droidcode.json`), hit concurrency + size concerns. | Retired; replaced by the companion server. | n/a (removed) | 2026-04-17 |
| 15 | Daemon events POST require the **session's foreign-key row** to exist in the companion before events can be inserted — otherwise FK fails. | Browser A starts a session, goes offline, Browser B comes online and posts events for that session → 500. | Companion's events POST auto-upserts a shell `sessions(id)` row inside the same transaction. | `server/src/routes/events.ts::registerEventRoutes` | 2026-04-17 |
| 16 | `crypto.randomUUID()` is **not available in insecure contexts** (plain-HTTP origins like `http://nightman:5173`). Older mobile WebKit also lacks it. | Everything that used `crypto.randomUUID()` threw `TypeError: crypto.randomUUID is not a function` on mobile + LAN-HTTP. Not SDK-specific but hits during our flows. | `randomId()` helper that falls back to `Math.random()`-based IDs. | `web/src/services/util/id.ts` | 2026-04-16 |

## When to update this file

Add a row whenever you:
* add a `catch` specifically to swallow an SDK-thrown error that isn't
  actually a failure (e.g. #8),
* cast a loose `any` / `unknown` because the SDK types are wrong (#4),
* introduce a client-side mirror / cache / companion endpoint because
  the SDK or daemon doesn't expose a corresponding primitive (#1, #5),
* filter / rewrite an event payload because the raw stream is
  unusable as-is (#6, #11, #12),
* write a fallback for something that "should" be in `window` or
  global but isn't in our context (#16),
* validate input client-side because the daemon's error for that
  input is garbage (#13).

Format: `#N | Limitation | Impact | Workaround | Code reference |
Noted (YYYY-MM-DD)`. Keep the table chronologically stable; append at
the bottom.

If the SDK ships a fix upstream, leave the row and strike it through
(`~~...~~`) with a note pointing at the SDK version that fixes it;
don't delete history. Track follow-up issue links in a trailing
"Resolved / upstream status" section when we accumulate enough.
