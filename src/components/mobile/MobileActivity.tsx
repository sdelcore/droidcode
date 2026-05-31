import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  connectToHost,
  type EventEnvelope,
  type Session,
  type SessionUpdateKind,
} from '@/services/wagent'
import { useHostStore, useSessionStore } from '@/stores'
import { agentName, hostHue, relTimeFromMs } from '@/services/identity'
import type { Host } from '@/types'

interface ActivityRow {
  eventIndex: number
  sessionId: string
  hostId: number
  createdAt: number
  kind: SessionUpdateKind
  payload: Record<string, unknown>
}

const KIND_LABELS: Record<SessionUpdateKind, { title: string; sub?: string }> = {
  agent_message_chunk: { title: 'replied' },
  agent_thought_chunk: { title: 'thinking…' },
  tool_call: { title: 'called tool' },
  tool_call_update: { title: 'tool update' },
  plan: { title: 'updated plan' },
  user_message_chunk: { title: 'message' },
  permission_request: { title: 'requested permission' },
  permission_resolved: { title: 'permission resolved' },
  stop: { title: 'finished' },
  subprocess_died: { title: 'subprocess died' },
  session_destroyed: { title: 'session destroyed' },
}

export function MobileActivity() {
  const navigate = useNavigate()
  const hosts = useHostStore((s) => s.hosts)
  const byHost = useSessionStore((s) => s.byHost)
  const loadAllHosts = useSessionStore((s) => s.loadAllHosts)
  const hostsLoaded = useHostStore((s) => s.isInitialized)
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (hostsLoaded) loadAllHosts()
  }, [hostsLoaded, loadAllHosts])

  // Fetch the most recent events for every known session. This is best-effort:
  // wagent's listEvents is per-session, so we fan out and merge by createdAt.
  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const all: ActivityRow[] = []
        for (const host of hosts) {
          const sessions = byHost[host.id] ?? []
          if (sessions.length === 0) continue
          const results = await Promise.allSettled(
            sessions.map((s) =>
              connectToHost(host)
                .listEvents(s.id, { limit: 40 })
                .then((events) => mapEvents(events, host.id)),
            ),
          )
          for (const r of results) {
            if (r.status === 'fulfilled') all.push(...r.value)
          }
        }
        if (cancelled) return
        all.sort((a, b) => b.createdAt - a.createdAt)
        setRows(all.slice(0, 120))
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Activity fetch failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [hosts, byHost])

  const sessionsById = useMemo(() => {
    const map = new Map<string, { session: Session; host: Host }>()
    for (const host of hosts) {
      for (const sr of byHost[host.id] ?? []) {
        map.set(sr.id, { session: sr, host })
      }
    }
    return map
  }, [hosts, byHost])

  return (
    <div className="mobile-shell">
      <div className="m-scroll" style={{ padding: 0 }}>
        <div className="m-list">
          <div className="h">
            <h2>Activity</h2>
            <span className="count">{rows.length} events</span>
          </div>
        </div>

        {loading && (
          <div style={{ padding: 18, color: 'var(--muted-foreground)', textAlign: 'center' }}>
            Loading activity…
          </div>
        )}
        {error && (
          <div
            style={{
              margin: '8px 14px',
              padding: '10px 12px',
              border: '1px solid color-mix(in oklch, var(--destructive) 50%, transparent)',
              borderRadius: 10,
              color: 'var(--destructive)',
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        <div className="m-timeline">
          {rows.map((row) => {
            const meta = sessionsById.get(row.sessionId)
            const host = meta?.host
            const session = meta?.session
            const hue = host ? hostHue(host.id) : 'var(--muted-foreground)'
            const label = KIND_LABELS[row.kind] ?? { title: row.kind }
            const stamp = new Date(row.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
            const sub = describeSub(row)
            const sessionLabel =
              session?.alias ?? session?.id.slice(0, 10) ?? row.sessionId.slice(0, 10)

            return (
              <div
                key={`${row.sessionId}:${row.eventIndex}`}
                className="item"
                style={{ '--c': hue } as React.CSSProperties}
                onClick={() => {
                  if (host) {
                    navigate({
                      to: '/chat/$hostId/$sessionId',
                      params: { hostId: String(host.id), sessionId: row.sessionId },
                    })
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <span className="when">{stamp}</span>
                <div className="what">
                  <b>{agentName(session?.agent)}</b> {label.title}
                  <div className="sub">
                    {host?.name ?? 'unknown'} · {sessionLabel}
                    {sub ? ` · ${sub}` : ''}
                    <span style={{ opacity: 0.55, marginLeft: 8 }}>{relTimeFromMs(row.createdAt)} ago</span>
                  </div>
                </div>
              </div>
            )
          })}
          {!loading && rows.length === 0 && !error && (
            <div style={{ padding: 24, color: 'var(--muted-foreground)', textAlign: 'center' }}>
              No activity yet — sessions stream events here as they happen.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function mapEvents(events: EventEnvelope[], hostId: number): ActivityRow[] {
  return events.map((e) => ({
    eventIndex: e.eventIndex,
    sessionId: e.sessionId,
    hostId,
    createdAt: e.createdAt,
    kind: e.kind,
    payload: (e.payload ?? {}) as Record<string, unknown>,
  }))
}

function describeSub(row: ActivityRow): string {
  const p = row.payload
  if (row.kind === 'tool_call' || row.kind === 'tool_call_update') {
    const name = typeof p.name === 'string' ? p.name : ''
    const title = typeof p.title === 'string' ? p.title : ''
    return title || name || ''
  }
  if (row.kind === 'permission_request') {
    const tc = p.toolCall as { name?: string; title?: string } | undefined
    return tc?.title ?? tc?.name ?? ''
  }
  return ''
}
