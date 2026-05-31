import { useHostStore, useSessionStore } from '@/stores'
import { hostHue } from '@/services/identity'

interface PaneActionSheetProps {
  target: { hostId: number; sessionId: string }
  isPinned: boolean
  onClose(): void
  onOpen(): void
  onPinToChat(): void
  onUnpin(): void
}

export function PaneActionSheet({
  target,
  isPinned,
  onClose,
  onOpen,
  onPinToChat,
  onUnpin,
}: PaneActionSheetProps) {
  const host = useHostStore((s) => s.hosts.find((h) => h.id === target.hostId))
  const sessions = useSessionStore((s) => s.byHost[target.hostId])
  const session = sessions?.find((sr) => sr.id === target.sessionId)
  const hue = hostHue(target.hostId)

  return (
    <div className="m-sheet-scrim" onClick={onClose}>
      <div className="m-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '60vh' }}>
        <span className="grabber" />
        <h2 style={{ fontSize: 22 }}>
          {session?.alias ?? session?.id.slice(0, 12) ?? 'Session'}
        </h2>
        <div
          className="lede"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}
        >
          {host?.name ?? 'unknown host'} · {session?.cwd ?? ''}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <SheetAction
            label="Open session"
            sub="Switch to this session's chat"
            onClick={onOpen}
            hue={hue}
          />
          {isPinned ? (
            <SheetAction
              label="Unpin from workstation"
              sub="Stays in your session list"
              onClick={onUnpin}
              hue={hue}
              danger
            />
          ) : (
            <SheetAction
              label="Pin to chat rail"
              sub="Add as an extra pane alongside the current chat"
              onClick={onPinToChat}
              hue={hue}
            />
          )}
        </div>
      </div>
    </div>
  )
}

interface SheetActionProps {
  label: string
  sub: string
  onClick(): void
  hue: string
  danger?: boolean
}

function SheetAction({ label, sub, onClick, hue, danger }: SheetActionProps) {
  return (
    <button
      type="button"
      className="m-row"
      onClick={onClick}
      style={
        {
          '--c': danger ? 'var(--destructive)' : hue,
          background: 'var(--popover)',
          borderColor: 'var(--border)',
        } as React.CSSProperties
      }
    >
      <div className="meta">
        <div
          className="title"
          style={{ color: danger ? 'var(--destructive)' : 'var(--foreground)' }}
        >
          {label}
        </div>
        <div className="sub">{sub}</div>
      </div>
    </button>
  )
}
