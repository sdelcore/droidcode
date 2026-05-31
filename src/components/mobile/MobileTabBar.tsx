import { useMemo } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useSessionStore } from '@/stores'
import { useLastPinnedChatStore } from '@/stores/lastPinnedChatStore'

interface TabDef {
  id: 'chat' | 'sessions' | 'activity' | 'settings'
  label: string
  pathPrefix: string
}

const TABS: TabDef[] = [
  { id: 'chat', label: 'Chat', pathPrefix: '/chat/' },
  { id: 'sessions', label: 'Sessions', pathPrefix: '/' },
  { id: 'activity', label: 'Activity', pathPrefix: '/activity' },
  { id: 'settings', label: 'Settings', pathPrefix: '/settings' },
]

export function MobileTabBar() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const lastChat = useLastPinnedChatStore((s) => s.last)
  const byHost = useSessionStore((s) => s.byHost)

  // Sessions tab badge: count sessions across all hosts whose server-side
  // status is 'needs_input'. The session list refreshes via loadAllHosts
  // on home mount + visibilitychange, so this is a coarse-grained signal.
  const needsInputCount = useMemo(() => {
    let n = 0
    for (const hostIdStr of Object.keys(byHost)) {
      const sessions = byHost[Number(hostIdStr)] ?? []
      for (const s of sessions) {
        if (s.status === 'needs_input') n++
      }
    }
    return n
  }, [byHost])

  function activeTabFor(path: string): TabDef['id'] {
    if (path.startsWith('/chat/')) return 'chat'
    if (path.startsWith('/activity')) return 'activity'
    if (path.startsWith('/settings')) return 'settings'
    return 'sessions'
  }

  const active = activeTabFor(pathname)

  function onSelect(id: TabDef['id']) {
    if (id === 'chat') {
      if (lastChat) {
        navigate({
          to: '/chat/$hostId/$sessionId',
          params: {
            hostId: String(lastChat.hostId),
            sessionId: lastChat.sessionId,
          },
          search: lastChat.extra ? { extra: lastChat.extra } : {},
        })
        return
      }
      // No previous chat — fall back to the first session across all hosts.
      for (const hostIdStr of Object.keys(byHost)) {
        const hostId = Number(hostIdStr)
        const sessions = byHost[hostId]
        if (sessions && sessions.length > 0) {
          navigate({
            to: '/chat/$hostId/$sessionId',
            params: { hostId: String(hostId), sessionId: sessions[0].id },
          })
          return
        }
      }
      // No sessions at all — go to sessions list.
      navigate({ to: '/' })
      return
    }
    if (id === 'sessions') {
      navigate({ to: '/' })
      return
    }
    if (id === 'activity') {
      navigate({ to: '/activity' })
      return
    }
    if (id === 'settings') {
      navigate({ to: '/settings' })
      return
    }
  }

  return (
    <div className="m-tabbar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={'tab' + (active === tab.id ? ' active' : '')}
          onClick={() => onSelect(tab.id)}
        >
          <TabIcon id={tab.id} />
          <span className="lbl">{tab.label}</span>
          {tab.id === 'sessions' && needsInputCount > 0 && (
            <span className="badge">{needsInputCount}</span>
          )}
        </button>
      ))}
    </div>
  )
}

function TabIcon({ id }: { id: TabDef['id'] }) {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (id === 'chat') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
        <path d="M21 12a8 8 0 01-12.2 6.8L4 20l1.3-4.6A8 8 0 1121 12z" />
      </svg>
    )
  }
  if (id === 'sessions') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
        <rect x="3" y="4" width="18" height="6" rx="1.5" />
        <rect x="3" y="14" width="18" height="6" rx="1.5" />
      </svg>
    )
  }
  if (id === 'activity') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  )
}
