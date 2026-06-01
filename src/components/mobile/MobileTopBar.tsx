import { useNavigate } from '@tanstack/react-router'
import { agentName, agentTone, hostHue } from '@/services/identity'
import type { AgentKind, Session } from '@/services/wagent'
import type { Host } from '@/types'

interface MobileTopBarProps {
  host: Host
  session: Session | undefined
  onSwitchHost(): void
  onActivity(): void
  notificationsCount?: number
}

export function MobileTopBar({
  host,
  session,
  onSwitchHost,
  onActivity,
  notificationsCount = 0,
}: MobileTopBarProps) {
  const navigate = useNavigate()
  const hue = hostHue(host.id)
  const agentKind = (session?.agent ?? 'claude') as AgentKind
  const tone = agentTone(agentKind)
  const aname = agentName(agentKind)
  const cwdTail = (session?.cwd ?? '').split('/').filter(Boolean).slice(-2).join('/')

  return (
    <div className="m-topbar">
      <button
        type="button"
        className="iconbtn"
        onClick={() => navigate({ to: '/' })}
        aria-label="Back to sessions"
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
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <div className="meta">
        <div className="alias">{session?.alias ?? session?.id.slice(0, 12) ?? 'untitled'}</div>
        <div className="sub" style={{ '--c': hue } as React.CSSProperties}>
          <span className="swatch" />
          <span>{host.name}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span style={{ color: tone }}>{aname}</span>
          {cwdTail && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{cwdTail}</span>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        className="iconbtn"
        onClick={onSwitchHost}
        aria-label="Switch host"
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
          <rect x="3" y="4" width="18" height="7" rx="1.5" />
          <rect x="3" y="13" width="18" height="7" rx="1.5" />
          <circle cx="7" cy="7.5" r="0.6" fill="currentColor" />
          <circle cx="7" cy="16.5" r="0.6" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className="iconbtn"
        onClick={onActivity}
        aria-label="Activity"
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
          <path d="M3 12h4l3-8 4 16 3-8h4" />
        </svg>
        {notificationsCount > 0 && <span className="pip" />}
      </button>
    </div>
  )
}
