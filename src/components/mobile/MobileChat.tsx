import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useHostStore, useSessionStore, useStickyChat } from '@/stores'
import {
  paneKey,
  parseExtraPanes,
  serializeExtraPanes,
  type PaneRef,
} from '@/services/sessions/panes'
import { MobileTopBar } from './MobileTopBar'
import { MobilePaneStack } from './MobilePaneStack'
import { MobileComposer } from './MobileComposer'
import { MobileMessage } from './MobileMessage'
import { MobilePermissionCard } from './MobilePermissionCard'
import { HostsSheet } from './sheets/HostsSheet'
import { useLastPinnedChatStore } from '@/stores/lastPinnedChatStore'

interface MobileChatProps {
  hostId: number
  sessionId: string
  extra?: string
}

const MAX_PANES = 4

export function MobileChat({ hostId, sessionId, extra }: MobileChatProps) {
  const navigate = useNavigate()
  const setLastChat = useLastPinnedChatStore((s) => s.setLast)
  const host = useHostStore((s) => s.hosts.find((h) => h.id === hostId))
  const hosts = useHostStore((s) => s.hosts)

  const primaryRef: PaneRef = useMemo(() => ({ hostId, sessionId }), [hostId, sessionId])
  const extraPanes = useMemo(
    () => parseExtraPanes(extra, primaryRef, MAX_PANES - 1),
    [extra, primaryRef],
  )
  const panes = useMemo<PaneRef[]>(() => [primaryRef, ...extraPanes], [primaryRef, extraPanes])

  const [activeKey, setActiveKey] = useState(paneKey(primaryRef))
  const [hostsSheetOpen, setHostsSheetOpen] = useState(false)
  const [broadcast, setBroadcast] = useState(false)

  // Track the last opened chat so the bottom Chat tab brings us back here.
  useEffect(() => {
    setLastChat({ hostId, sessionId, extra })
  }, [hostId, sessionId, extra, setLastChat])

  // When primary changes (route param), update activeKey to track it.
  useEffect(() => {
    setActiveKey(paneKey(primaryRef))
  }, [primaryRef])

  // Find the currently-displayed pane's session record.
  const activeRef = panes.find((p) => paneKey(p) === activeKey) ?? primaryRef
  const byHost = useSessionStore((s) => s.byHost)
  const activeSessions = byHost[activeRef.hostId]
  const activeSession = activeSessions?.find((sr) => sr.id === activeRef.sessionId)
  const activeHost = hosts.find((h) => h.id === activeRef.hostId)

  // Cross-host needs_input count drives the activity icon's pip.
  const needsInputCount = useMemo(() => {
    let n = 0
    for (const hostIdStr of Object.keys(byHost)) {
      for (const s of byHost[Number(hostIdStr)] ?? []) {
        if (s.status === 'needs_input') n++
      }
    }
    return n
  }, [byHost])

  function navigateToPanes(nextPrimary: PaneRef, nextExtras: PaneRef[]) {
    const enc = serializeExtraPanes(nextExtras)
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: {
        hostId: String(nextPrimary.hostId),
        sessionId: nextPrimary.sessionId,
      },
      search: enc ? { extra: enc } : {},
    })
  }

  function selectPane(ref: PaneRef) {
    setActiveKey(paneKey(ref))
  }

  function handleAddPane() {
    // Routing to sessions list — long-press there pins back to this chat.
    navigate({ to: '/' })
  }

  function handleSwitchHost(nextHostId: number) {
    setHostsSheetOpen(false)
    if (nextHostId === activeRef.hostId) return
    // Try to find a session on the chosen host; otherwise jump to sessions list
    // pre-filtered to that host.
    const sessions = useSessionStore.getState().byHost[nextHostId] ?? []
    if (sessions.length === 0) {
      navigate({ to: '/', search: { h: String(nextHostId) } })
      return
    }
    navigateToPanes({ hostId: nextHostId, sessionId: sessions[0].id }, [])
  }

  if (!host) {
    return (
      <div className="mobile-shell" style={{ padding: 24, color: 'var(--muted-foreground)' }}>
        Host not found.
      </div>
    )
  }

  return (
    <div className="mobile-shell">
      <MobileTopBar
        host={activeHost ?? host}
        session={activeSession}
        onSwitchHost={() => setHostsSheetOpen(true)}
        onActivity={() => navigate({ to: '/activity' })}
        notificationsCount={needsInputCount}
      />

      {panes.length > 1 ? (
        <MobilePaneStack
          panes={panes}
          activeKey={activeKey}
          onSelect={selectPane}
          onAdd={handleAddPane}
        />
      ) : (
        <PaneStackHint onAdd={handleAddPane} />
      )}

      {/* Pin all panes via attachSticky so SSE stays open even when inactive. */}
      {panes
        .filter((p) => paneKey(p) !== activeKey)
        .map((p) => (
          <StickyPaneAttachment
            key={paneKey(p)}
            hostId={p.hostId}
            sessionId={p.sessionId}
          />
        ))}

      {/* Only the active pane's transcript renders. */}
      <PaneTranscript hostId={activeRef.hostId} sessionId={activeRef.sessionId} active />


      {activeSession && activeHost && (
        <MobileComposer
          host={activeHost}
          session={activeSession}
          broadcast={broadcast && panes.length > 1}
          broadcastTargets={panes}
          onToggleBroadcast={() => setBroadcast((b) => !b)}
        />
      )}

      {hostsSheetOpen && (
        <HostsSheet
          activeHostId={activeRef.hostId}
          onClose={() => setHostsSheetOpen(false)}
          onPick={handleSwitchHost}
        />
      )}
    </div>
  )
}

function StickyPaneAttachment({ hostId, sessionId }: { hostId: number; sessionId: string }) {
  useStickyChat(hostId, sessionId)
  return null
}

function PaneStackHint({ onAdd }: { onAdd(): void }) {
  return (
    <div
      style={{
        flexShrink: 0,
        padding: '8px 14px 10px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--background)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <button
        type="button"
        onClick={onAdd}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--muted-foreground)',
          background: 'transparent',
          border: '1px dashed var(--border)',
          borderRadius: 999,
          padding: '4px 10px',
          cursor: 'pointer',
        }}
      >
        + Pin a session to compose multi-pane
      </button>
    </div>
  )
}

interface PaneTranscriptProps {
  hostId: number
  sessionId: string
  active: boolean
}

function PaneTranscript({ hostId, sessionId, active }: PaneTranscriptProps) {
  const pane = useStickyChat(hostId, sessionId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messages = pane?.messages
  const pending = pane?.pendingPermission ?? null

  useEffect(() => {
    if (!active) return
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [active, messages?.length, pane?.isStreaming])

  return (
    <div className="m-scroll" ref={scrollRef}>
      {pane?.status === 'connecting' && (!messages || messages.length === 0) && (
        <div style={{ padding: 18, color: 'var(--muted-foreground)', textAlign: 'center' }}>
          Connecting to session…
        </div>
      )}
      {pane?.error && (
        <div
          style={{
            margin: '8px 0',
            padding: '10px 12px',
            border: '1px solid color-mix(in oklch, var(--destructive) 60%, transparent)',
            borderRadius: 10,
            color: 'var(--destructive)',
            fontSize: 12,
          }}
        >
          {pane.error}
        </div>
      )}
      {messages?.map((m) => <MobileMessage key={m.id} message={m} />)}
      {pending && <MobilePermissionCard sessionId={sessionId} request={pending} />}
    </div>
  )
}
