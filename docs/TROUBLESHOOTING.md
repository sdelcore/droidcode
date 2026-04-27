# Troubleshooting

Active issue triage:

* **wagent-side bugs** (daemon errors, missing endpoints, agent
  crashes): file at <https://github.com/sdelcore/wagent/issues>.
* **droidcode-side bugs** (UI, store, route, build): file at
  <https://github.com/sdelcore/droidcode/issues>.

The previous Expo-era log lived here; it's been retired with the
React Native stack and is no longer relevant. Check
`migration.md` for the cutover history.

## Quick diagnostics

### Web app shows "Failed to fetch" / connection errors

1. Confirm wagent is running: `curl http://<host>:2468/v1/health` →
   `{"status":"ok"}`.
2. Confirm CORS allows the browser's origin. Restart wagent with
   `WAGENT_CORS=*` (dev) or an explicit allowlist (prod).
3. If the host's added in `/settings` doesn't match where wagent is
   running, edit it.

### "agent_not_available" on session creation

The agent (`claude` / `pi`) isn't installed on the wagent host.
Check `GET <host>:2468/v1/agents` for the reason. For claude on
NixOS, ensure `claude` is on PATH so wagent's auto-detection picks
it up — see
[wagent/src/agent/claude_acp.ts](https://github.com/sdelcore/wagent/blob/main/src/agent/claude_acp.ts).

### SSE goes silent on mobile

Expected when the browser tab is backgrounded or the network
hands off. The chat store catches up automatically on
`visibilitychange` / `focus` / `online` via
`client.listEvents(sessionId, { after: lastEventIndex })`. If a
session looks stuck for >30s after foregrounding, file an issue
with the browser + network details.
