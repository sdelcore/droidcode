import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useHostStore, useSessionStore, useWatchLiveMany } from '@/stores'
import { useLiveStatus } from '@/services/sessions/sessionRegistry'
import {
  buildHomeView,
  type FlatSession,
  type HomeSearch,
} from '@/services/sessions/homeView'
import { agentSigil, hostHue, relTimeFromMs } from '@/services/identity'
import { useLastPinnedChatStore } from '@/stores/lastPinnedChatStore'
import { paneKey, parseExtraPanes, serializeExtraPanes } from '@/services/sessions/panes'
import type { PaneRef } from '@/services/sessions/panes'
import { NewSessionSheet } from './sheets/NewSessionSheet'
import { PaneActionSheet } from './sheets/PaneActionSheet'

interface MobileSessionsProps {
  search: HomeSearch
}

const LONG_PRESS_MS = 450

export function MobileSessions({ search }: MobileSessionsProps) {
  const navigate = useNavigate()
  const hosts = useHostStore((s) => s.hosts)
  const byHost = useSessionStore((s) => s.byHost)
  const loadAllHosts = useSessionStore((s) => s.loadAllHosts)
  const hostsLoaded = useHostStore((s) => s.isInitialized)
  const lastChat = useLastPinnedChatStore((s) => s.last)
  const [q, setQ] = useState(search.q ?? '')
  const [hostFilters, setHostFilters] = useState<Set<number>>(() => parseHostIds(search.h))
  const [newOpen, setNewOpen] = useState(false)
  const [longPressed, setLongPressed] = useState<{ hostId: number; sessionId: string } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (hostsLoaded) loadAllHosts()
  }, [hostsLoaded, loadAllHosts])

  const view = useMemo(
    () => buildHomeView({ search: { ...search, q, h: serializeHostIds(hostFilters) }, byHost, hosts }),
    [search, q, hostFilters, byHost, hosts],
  )
  const { visible, total } = view

  useWatchLiveMany(
    visible
      .filter((f) => !f.session.destroyedAt)
      .map((f) => ({ hostId: f.hostId, sessionId: f.session.id })),
  )

  const pinnedKeys = useMemo(() => buildPinnedKeys(lastChat), [lastChat])

  // Section split: needs-input / live / recent. Drives off the server-side
  // `status` column so the buckets are correct without subscribing to SSE
  // for every visible session. Pre-status wagent rows fall through to the
  // 'Active' bucket as a graceful default.
  const needs: FlatSession[] = []
  const live: FlatSession[] = []
  const recent: FlatSession[] = []
  for (const f of visible) {
    const status = f.session.status
    if (status === 'destroyed' || f.session.destroyedAt) {
      recent.push(f)
    } else if (status === 'needs_input') {
      needs.push(f)
    } else {
      live.push(f)
    }
  }

  function toggleHost(id: number) {
    const next = new Set(hostFilters)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setHostFilters(next)
  }

  function openSession(f: FlatSession) {
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: { hostId: String(f.hostId), sessionId: f.session.id },
    })
  }

  function handlePressStart(hostId: number, sessionId: string) {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      setLongPressed({ hostId, sessionId })
    }, LONG_PRESS_MS)
  }
  function handlePressEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  function pinToChat(ref: PaneRef) {
    if (!lastChat) {
      useLastPinnedChatStore.getState().setLast({
        hostId: ref.hostId,
        sessionId: ref.sessionId,
      })
      navigate({
        to: '/chat/$hostId/$sessionId',
        params: { hostId: String(ref.hostId), sessionId: ref.sessionId },
      })
      return
    }
    // Add to extra panes of the last chat.
    const primary: PaneRef = { hostId: lastChat.hostId, sessionId: lastChat.sessionId }
    const existing = parseExtraPanes(lastChat.extra, primary, 4)
    if (existing.some((p) => p.hostId === ref.hostId && p.sessionId === ref.sessionId)) return
    if (primary.hostId === ref.hostId && primary.sessionId === ref.sessionId) return
    const nextExtras = [...existing, ref].slice(0, 4)
    const extra = serializeExtraPanes(nextExtras)
    useLastPinnedChatStore.getState().setLast({
      hostId: primary.hostId,
      sessionId: primary.sessionId,
      extra,
    })
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: { hostId: String(primary.hostId), sessionId: primary.sessionId },
      search: extra ? { extra } : {},
    })
  }

  function unpinFromChat(ref: PaneRef) {
    if (!lastChat) return
    const primary: PaneRef = { hostId: lastChat.hostId, sessionId: lastChat.sessionId }
    if (paneKey(primary) === paneKey(ref)) {
      // Demote first extra to primary.
      const existing = parseExtraPanes(lastChat.extra, primary, 4)
      const [nextPrimary, ...rest] = existing
      if (!nextPrimary) {
        useLastPinnedChatStore.getState().setLast(null)
        return
      }
      useLastPinnedChatStore.getState().setLast({
        hostId: nextPrimary.hostId,
        sessionId: nextPrimary.sessionId,
        extra: serializeExtraPanes(rest),
      })
      return
    }
    const existing = parseExtraPanes(lastChat.extra, primary, 4).filter(
      (p) => paneKey(p) !== paneKey(ref),
    )
    useLastPinnedChatStore.getState().setLast({
      hostId: primary.hostId,
      sessionId: primary.sessionId,
      extra: serializeExtraPanes(existing),
    })
  }

  return (
    <div className="mobile-shell">
      <div className="m-scroll" style={{ padding: 0 }}>
        <div className="m-list">
          <div className="h">
            <h2>Sessions</h2>
            <span className="count">
              {visible.length} of {total}
            </span>
          </div>
          <div className="m-search">
            <span className="ic">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="6" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search sessions, paths, ids…"
            />
          </div>
          <div className="m-chips">
            <button
              type="button"
              className={'m-chip' + (hostFilters.size === 0 ? ' on' : '')}
              onClick={() => setHostFilters(new Set())}
            >
              All hosts
            </button>
            {hosts.map((h) => (
              <button
                key={h.id}
                type="button"
                className={'m-chip' + (hostFilters.has(h.id) ? ' on' : '')}
                style={{ '--c': hostHue(h.id) } as React.CSSProperties}
                onClick={() => toggleHost(h.id)}
              >
                <span className="swatch" />
                {h.name}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              hasFilters={hostFilters.size > 0 || q.length > 0}
              onClear={() => {
                setHostFilters(new Set())
                setQ('')
              }}
              onNew={() => setNewOpen(true)}
            />
          ) : (
            <>
              {needs.length > 0 && (
                <SessionSection
                  label="Needs input"
                  sessions={needs}
                  pinnedKeys={pinnedKeys}
                  onOpen={openSession}
                  onPressStart={handlePressStart}
                  onPressEnd={handlePressEnd}
                />
              )}
              <SessionSection
                label="Active"
                sessions={live}
                pinnedKeys={pinnedKeys}
                onOpen={openSession}
                onPressStart={handlePressStart}
                onPressEnd={handlePressEnd}
              />
              {recent.length > 0 && (
                <SessionSection
                  label="Recent"
                  sessions={recent}
                  pinnedKeys={pinnedKeys}
                  onOpen={openSession}
                  onPressStart={handlePressStart}
                  onPressEnd={handlePressEnd}
                />
              )}
            </>
          )}
        </div>

        <FloatingNewButton onClick={() => setNewOpen(true)} />
      </div>

      {needs.length === 0 && live.length === 0 && recent.length === 0 && null}

      {newOpen && (
        <NewSessionSheet
          onClose={() => setNewOpen(false)}
          onCreated={(hostId, sessionId) => {
            setNewOpen(false)
            useLastPinnedChatStore.getState().setLast({ hostId, sessionId })
            navigate({
              to: '/chat/$hostId/$sessionId',
              params: { hostId: String(hostId), sessionId },
            })
          }}
        />
      )}

      {longPressed && (
        <PaneActionSheet
          target={longPressed}
          isPinned={pinnedKeys.has(paneKey(longPressed))}
          onClose={() => setLongPressed(null)}
          onOpen={() => {
            navigate({
              to: '/chat/$hostId/$sessionId',
              params: {
                hostId: String(longPressed.hostId),
                sessionId: longPressed.sessionId,
              },
            })
            setLongPressed(null)
          }}
          onPinToChat={() => {
            pinToChat(longPressed)
            setLongPressed(null)
          }}
          onUnpin={() => {
            unpinFromChat(longPressed)
            setLongPressed(null)
          }}
        />
      )}
    </div>
  )
}

function buildPinnedKeys(last: { hostId: number; sessionId: string; extra?: string } | null): Set<string> {
  if (!last) return new Set()
  const keys = new Set<string>()
  keys.add(`${last.hostId}:${last.sessionId}`)
  const extras = parseExtraPanes(last.extra, { hostId: last.hostId, sessionId: last.sessionId }, 4)
  for (const e of extras) keys.add(`${e.hostId}:${e.sessionId}`)
  return keys
}

interface SectionProps {
  label: string
  sessions: FlatSession[]
  pinnedKeys: Set<string>
  onOpen(f: FlatSession): void
  onPressStart(hostId: number, sessionId: string): void
  onPressEnd(): void
}

function SessionSection({ label, sessions, pinnedKeys, onOpen, onPressStart, onPressEnd }: SectionProps) {
  if (sessions.length === 0) return null
  return (
    <>
      <div className="m-sect-label">
        <span>{label}</span>
        <span>{sessions.length}</span>
      </div>
      {sessions.map((f) => (
        <SessionRow
          key={`${f.hostId}:${f.session.id}`}
          flat={f}
          pinned={pinnedKeys.has(`${f.hostId}:${f.session.id}`)}
          onOpen={() => onOpen(f)}
          onPressStart={() => onPressStart(f.hostId, f.session.id)}
          onPressEnd={onPressEnd}
        />
      ))}
    </>
  )
}

interface RowProps {
  flat: FlatSession
  pinned: boolean
  onOpen(): void
  onPressStart(): void
  onPressEnd(): void
}

function SessionRow({ flat, pinned, onOpen, onPressStart, onPressEnd }: RowProps) {
  // Live status overrides the server's `status` column when an SSE
  // subscription has fresher info (a turn that started after the last
  // list refresh). Otherwise we trust the row.
  const live = useLiveStatus(flat.session.id)
  const status = displayStatus(flat.session.status, live, flat.session.destroyedAt)
  const hue = hostHue(flat.hostId)
  const cwdLast = (flat.cwd ?? '').split('/').filter(Boolean).slice(-1)[0] ?? ''
  const sigil = agentSigil(flat.session.agent)

  return (
    <button
      type="button"
      className={'m-row' + (pinned ? ' pinned' : '')}
      style={{ '--c': hue } as React.CSSProperties}
      onClick={onOpen}
      onPointerDown={onPressStart}
      onPointerUp={onPressEnd}
      onPointerCancel={onPressEnd}
      onPointerLeave={onPressEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="meta">
        <div className="title">
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {flat.alias ?? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{flat.session.id.slice(0, 12)}</span>}
          </span>
          <span className="agent-tag">{sigil}</span>
        </div>
        <div className="sub">
          <span className={'dot ' + status.cls} />
          <span>{status.label}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {flat.hostName}/{cwdLast}
          </span>
        </div>
      </div>
      <span className="stamp">
        {relTimeFromMs(activityTs(flat))}
      </span>
      {pinned && (
        <span className="pin" aria-label="Pinned">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 4l6 6-4 1-1 5-5-5-5 1L9 6l5-1z" />
          </svg>
        </span>
      )}
    </button>
  )
}

function displayStatus(
  status: import('@/services/wagent').SessionStatus | undefined,
  live: ReturnType<typeof useLiveStatus>,
  destroyedAt: number | null,
): { cls: string; label: string } {
  if (destroyedAt || status === 'destroyed') return { cls: 'idle', label: 'idle' }
  // Live snapshot beats the row for the rare case where SSE is ahead of
  // the periodic list refresh.
  if (live?.pendingPermission || status === 'needs_input') {
    return { cls: 'warn', label: 'needs input' }
  }
  if (live?.streaming) return { cls: 'live', label: 'streaming' }
  if (status === 'running') return { cls: 'live', label: 'running' }
  if (status === 'error') return { cls: 'warn', label: 'error' }
  return { cls: '', label: 'ready' }
}

function activityTs(f: FlatSession): number {
  return f.session.destroyedAt ?? f.session.updatedAt ?? f.session.createdAt
}

function parseHostIds(raw?: string): Set<number> {
  if (!raw) return new Set()
  const out = new Set<number>()
  for (const part of raw.split(',')) {
    const n = Number.parseInt(part, 10)
    if (Number.isFinite(n)) out.add(n)
  }
  return out
}

function serializeHostIds(set: Set<number>): string | undefined {
  if (set.size === 0) return undefined
  return Array.from(set).join(',')
}

function FloatingNewButton({ onClick }: { onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'fixed',
        right: 18,
        bottom: 86,
        width: 52,
        height: 52,
        borderRadius: 999,
        background: 'var(--primary)',
        color: 'var(--primary-foreground)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 0,
        boxShadow: '0 6px 18px oklch(0 0 0 / 0.35)',
        zIndex: 30,
        cursor: 'pointer',
      }}
      aria-label="New session"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  )
}

interface EmptyProps {
  hasFilters: boolean
  onClear(): void
  onNew(): void
}

function EmptyState({ hasFilters, onClear, onNew }: EmptyProps) {
  return (
    <div style={{ padding: '40px 12px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--foreground)', margin: '0 0 6px' }}>
        {hasFilters ? 'No matches' : 'No sessions yet'}
      </p>
      <p style={{ fontSize: 13, margin: '0 0 18px' }}>
        {hasFilters ? 'Nothing matches your filters.' : 'Spawn a session on any wagent daemon.'}
      </p>
      <button
        type="button"
        onClick={hasFilters ? onClear : onNew}
        style={{
          padding: '10px 16px',
          borderRadius: 999,
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          border: 0,
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        {hasFilters ? 'Clear filters' : 'New session'}
      </button>
    </div>
  )
}
