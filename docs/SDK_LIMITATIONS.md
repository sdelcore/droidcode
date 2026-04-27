# Historical: sandbox-agent SDK limitations

> **Status: archived.** Every workaround in this file relates to the
> Rivet `sandbox-agent` SDK and its companion server, which were
> retired in commit `afc6631` ("migrate droidcode from Rivet SDK to
> wagent HTTP+SSE client"). The droidcode codebase no longer uses any
> of the patterns referenced here. Kept as a record of *why* the
> migration to wagent happened — see
> [wagent/docs/limitations-tracker.md](https://github.com/sdelcore/wagent/blob/main/docs/limitations-tracker.md)
> for a row-by-row map of which limitations wagent eliminates.
>
> If you discover a new wagent quirk worth documenting, file it
> upstream at <https://github.com/sdelcore/wagent/issues>; don't add
> rows here. Issues that absolutely need a client-side workaround go
> in `AGENTS.md` under "Architecture rules" with a link to the wagent
> issue tracking the upstream fix.

---

The original 20-row table follows for historical context. Workarounds
are marked obsolete (~~struck through~~) since they no longer exist in
the codebase.

| # | Limitation | Workaround (now obsolete) | Eliminated by |
|---|---|---|---|
| 1 | `sdk.listSessions()` reads client-side persist driver | ~~Mirror to companion SQLite at `:2469`~~ | wagent `GET /v1/sessions` is server-side. |
| 2 | `destroySession` is a soft delete | ~~Filter `destroyedAt` out client-side~~ | wagent `DELETE /v1/sessions/:id` is a real delete with FK cascade. |
| 3 | No `Session.interrupt()` method | ~~`session.rawSend('session/cancel', {})`~~ | wagent `POST /v1/sessions/:id/abort`. |
| 4 | `sessionInit._meta` typing strips `_meta` | ~~Don't store metadata there~~ | wagent has first-class `alias` + `model` columns; `PATCH /v1/sessions/:id` updates them. |
| 5 | `_meta` only settable at create time | ~~Companion `PUT /v1/sessions/:id`~~ | Same as #4. |
| 6 | `resumeSession` injects a JSON replay-prefix prompt | ~~`MessageAccumulator.extractClientPrompt` filter~~ | wagent keeps the agent subprocess alive across SSE reconnects; reconnect is a pure `Last-Event-ID` re-subscribe with no agent re-priming. |
| 7 | Rivet `mock` agent has an infinite-loop bug | ~~Smoke test defaults to claude~~ | wagent ships its own `echo` stub agent; smoke uses it. |
| 8 | `respondPermission` throws on already-resolved id | ~~`isPermissionNotFound` guard~~ | wagent treats unknown requestIds as `status: noop` (HTTP 200). |
| 9 | `onPermissionRequest` fires twice on resume | ~~Same guard as #8~~ | wagent emits exactly one `permission_request` per tool call. |
| 10 | Two ACP error shapes (`AcpHttpError` vs `AcpRpcError`) | ~~Two-layer unwrap in `formatError`~~ | wagent has one error envelope: `{ error: { code, message, details? } }`. |
| 11 | `ContentChunk.messageId` often absent | Accumulator uses turn-boundary heuristic instead | Same heuristic still lives in the accumulator; not technically obsolete but no longer SDK-driven. |
| 12 | SDK doesn't emit `user_message_chunk` for client prompts | ~~Synthesize from `session/prompt` event~~ | wagent emits `user_message_chunk` for every prompt. |
| 13 | Daemon `/v1/fs/entries?path=~` doesn't expand tilde | Client validates absolute paths | wagent has the same policy (deliberate); validation rule lives in `AGENTS.md`. |
| 14 | Daemon FS write only supports single-file overwrite | ~~Companion stored cross-device state instead~~ | Cross-device state lives on wagent's SQLite. |
| 15 | Companion events POST required FK row to exist | ~~Auto-upsert shell `sessions(id)` row~~ | No companion. |
| 16 | `crypto.randomUUID()` missing on insecure contexts | `randomId()` fallback | Not SDK-related; still present in `services/util/`. |
| 17 | `--cors-allow-origin '*'` rejected by the daemon | ~~Enumerate origins in `DROIDCODE_DAEMON_CORS`~~ | wagent accepts `WAGENT_CORS=*` and a comma-separated allowlist. |
| 18 | `Session.onEvent` SSE goes silently stale on mobile | Catch-up poll on `visibilitychange`/`focus`/`online` | Mechanism still in `chatStore`; works against wagent's `listEvents({ after })`. |
| 19 | `ChatPane` cleanup caused cascade of `resumeSession` calls | App-scoped attachments instead of component-scoped | Architectural rule kept in `AGENTS.md`; no longer SDK-specific (no `resumeSession` to cascade). |
| 20 | `onPermissionRequest` fires on every live subscriber | Auto-accept lives in both home + chat stores | Still applies to the wagent client; the dual-listener pattern stays. |
