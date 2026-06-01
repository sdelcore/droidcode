import { useEffect } from 'react'
import { agentSigil, hostHue } from '@/services/identity'
import { useHostStore, useSessionStore } from '@/stores'
import { sessionRegistry } from '@/services/sessions/sessionRegistry'
import { useSyncExternalStore } from 'react'
import type { PaneRef } from '@/services/sessions/panes'
import { paneKey } from '@/services/sessions/panes'

interface MobilePaneStackProps {
  panes: PaneRef[]
  activeKey: string
  onSelect(ref: PaneRef): void
  onAdd(): void
}

export function MobilePaneStack({ panes, activeKey, onSelect, onAdd }: MobilePaneStackProps) {
  // Attach ref-counted live status for each pane in the stack so dots update
  // when any session streams.
  useEffect(() => {
    const handles = panes.map((p) => sessionRegistry.attach(p.hostId, p.sessionId))
    return () => {
      for (const h of handles) h.release()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panes.map((p) => paneKey(p)).join(',')])

  return (
    <div className="m-pane-stack">
      {panes.map((ref) => (
        <StackCard
          key={paneKey(ref)}
          ref_={ref}
          active={paneKey(ref) === activeKey}
          onSelect={() => onSelect(ref)}
        />
      ))}
      <button
        type="button"
        className="m-stack-add"
        onClick={onAdd}
        aria-label="Pin another session"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  )
}

function StackCard({
  ref_,
  active,
  onSelect,
}: {
  ref_: PaneRef
  active: boolean
  onSelect(): void
}) {
  const host = useHostStore((s) => s.hosts.find((h) => h.id === ref_.hostId))
  const sessions = useSessionStore((s) => s.byHost[ref_.hostId])
  const session = sessions?.find((sr) => sr.id === ref_.sessionId)
  const live = useSyncExternalStore(
    (cb) => sessionRegistry.subscribe(ref_.sessionId, cb),
    () => sessionRegistry.getLiveStatus(ref_.sessionId),
    () => sessionRegistry.getLiveStatus(ref_.sessionId),
  )

  if (!host) return null

  // Live SSE state beats the row when both have an opinion (SSE is ahead
  // of the periodic list refresh); otherwise trust session.status.
  const status =
    live?.pendingPermission || session?.status === 'needs_input'
      ? 'warn'
      : live?.streaming || session?.status === 'running'
        ? 'live'
        : session?.destroyedAt || session?.status === 'destroyed'
          ? 'idle'
          : session?.status === 'error'
            ? 'warn'
            : ''
  const sigil = agentSigil(session?.agent)

  return (
    <button
      type="button"
      className={'m-stack-card' + (active ? ' active' : '')}
      style={{ '--c': hostHue(host.id) } as React.CSSProperties}
      onClick={onSelect}
    >
      <div className="row1">
        <span className="swatch" />
        <span>{host.name}</span>
        <span className={'dot ' + status} />
      </div>
      <div className="alias">{session?.alias ?? ref_.sessionId.slice(0, 10)}</div>
      <div className="id">
        {sigil} · {ref_.sessionId.slice(0, 6)}
      </div>
    </button>
  )
}
