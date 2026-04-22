// Pane encoding for the chat route's ?extra= query param.
//
// Each extra pane is a (hostId, sessionId) tuple so panes can span hosts.
// Serialized form: "1:abc,2:def" — a comma-separated list of "hostId:sessionId".
//
// Legacy compatibility: if an entry lacks the ":" separator, it's treated
// as a sessionId on the primary pane's host. This lets old bookmarks and
// links (which predate cross-host panes) continue to work without breaking.

export interface PaneRef {
  hostId: number
  sessionId: string
}

export function paneKey(ref: PaneRef): string {
  return `${ref.hostId}:${ref.sessionId}`
}

export function parseExtraPanes(
  extra: string | undefined,
  primary: PaneRef,
  max: number,
): PaneRef[] {
  if (!extra) return []
  const seen = new Set<string>([paneKey(primary)])
  const out: PaneRef[] = []
  for (const rawPart of extra.split(',')) {
    if (out.length >= max) break
    const part = rawPart.trim()
    if (part.length === 0) continue
    const parsed = parseOne(part, primary.hostId)
    if (!parsed) continue
    const key = paneKey(parsed)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(parsed)
  }
  return out
}

function parseOne(token: string, fallbackHostId: number): PaneRef | null {
  const colonIdx = token.indexOf(':')
  if (colonIdx <= 0) {
    // Legacy: plain sessionId — assume same host as primary.
    return { hostId: fallbackHostId, sessionId: token }
  }
  const hostPart = token.slice(0, colonIdx)
  const sessionPart = token.slice(colonIdx + 1)
  const hostId = Number.parseInt(hostPart, 10)
  if (!Number.isFinite(hostId) || sessionPart.length === 0) return null
  return { hostId, sessionId: sessionPart }
}

export function serializeExtraPanes(refs: PaneRef[]): string | undefined {
  if (refs.length === 0) return undefined
  return refs.map(paneKey).join(',')
}

export function samePane(a: PaneRef, b: PaneRef): boolean {
  return a.hostId === b.hostId && a.sessionId === b.sessionId
}
