import { useEffect, useMemo, useState } from 'react'
import {
  Link,
  createFileRoute,
  useNavigate,
  useParams,
  useSearch,
} from '@tanstack/react-router'
import { Pin } from 'lucide-react'
import { ChatPane } from '@/components/chat/ChatPane'
import { Button } from '@/components/ui/button'
import { useHostStore } from '@/stores'

interface ChatSearch {
  extra?: string
}

export const Route = createFileRoute('/chat/$hostId/$sessionId')({
  component: ChatScreen,
  validateSearch: (search: Record<string, unknown>): ChatSearch => ({
    extra: typeof search.extra === 'string' ? search.extra : undefined,
  }),
})

const MAX_PANES_DESKTOP = 3

function ChatScreen() {
  const { hostId, sessionId } = useParams({ from: '/chat/$hostId/$sessionId' })
  const search = useSearch({ from: '/chat/$hostId/$sessionId' })
  const navigate = useNavigate()
  const numericHostId = Number(hostId)
  const host = useHostStore((s) => s.hosts.find((h) => h.id === numericHostId))

  const extraPanes = useMemo(() => {
    if (!search.extra) return []
    return search.extra
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s !== sessionId)
      .slice(0, MAX_PANES_DESKTOP - 1)
  }, [search.extra, sessionId])

  const panes = useMemo(() => [sessionId, ...extraPanes], [sessionId, extraPanes])

  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < 768,
  )

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const [activeTab, setActiveTab] = useState<string>(sessionId)

  useEffect(() => {
    // If the primary pane changes (route navigation), reset active tab to it.
    setActiveTab(sessionId)
  }, [sessionId])

  function closeExtra(extraId: string) {
    const next = extraPanes.filter((id) => id !== extraId).join(',') || undefined
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: { hostId: String(numericHostId), sessionId },
      search: next ? { extra: next } : {},
    })
  }

  function onAfterDelete(deletedId: string) {
    if (deletedId === sessionId) {
      // Primary pane deleted — promote the next extra or return to hosts.
      const nextPrimary = extraPanes[0]
      if (nextPrimary) {
        const rest = extraPanes.slice(1).join(',') || undefined
        navigate({
          to: '/chat/$hostId/$sessionId',
          params: { hostId: String(numericHostId), sessionId: nextPrimary },
          search: rest ? { extra: rest } : {},
        })
        return
      }
      navigate({ to: '/hosts' })
      return
    }
    closeExtra(deletedId)
  }

  if (!host) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">Host not found.</p>
        <Button asChild size="sm" variant="outline">
          <Link to="/hosts">Back to hosts</Link>
        </Button>
      </main>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar
        hostName={host.name}
        hostId={numericHostId}
        paneCount={panes.length}
        canPin={panes.length < MAX_PANES_DESKTOP}
      />
      {isNarrow && panes.length > 1 ? (
        <>
          <TabBar
            panes={panes}
            activeTab={activeTab}
            onSelect={setActiveTab}
            onClose={(id) => id !== sessionId && closeExtra(id)}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            {panes.map((id) => (
              <div key={id} className={id === activeTab ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                <ChatPane
                  hostId={numericHostId}
                  sessionId={id}
                  isActive={id === activeTab}
                  onClose={id !== sessionId ? () => closeExtra(id) : undefined}
                  onAfterDelete={() => onAfterDelete(id)}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-row overflow-x-auto">
          {panes.map((id) => (
            <ChatPane
              key={id}
              hostId={numericHostId}
              sessionId={id}
              isActive={id === sessionId}
              onClose={id !== sessionId ? () => closeExtra(id) : undefined}
              onAfterDelete={() => onAfterDelete(id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TopBar({
  hostName,
  paneCount,
  canPin,
}: {
  hostName: string
  hostId: number
  paneCount: number
  canPin: boolean
}) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-background/95 px-3 backdrop-blur">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/" className="font-semibold text-foreground hover:opacity-80">
          DroidCode
        </Link>
        <span className="opacity-50">/</span>
        <Link to="/hosts" className="hover:text-foreground">
          {hostName}
        </Link>
        <span className="opacity-50">·</span>
        <span>
          {paneCount} {paneCount === 1 ? 'pane' : 'panes'}
        </span>
      </div>
      <nav className="flex items-center gap-3 text-xs text-muted-foreground">
        {!canPin && <span className="text-[11px]">(max panes open)</span>}
        <Link to="/hosts" className="hover:text-foreground">
          Hosts
        </Link>
        <Link to="/settings" className="hover:text-foreground">
          Settings
        </Link>
      </nav>
    </div>
  )
}

function TabBar({
  panes,
  activeTab,
  onSelect,
  onClose,
}: {
  panes: string[]
  activeTab: string
  onSelect(id: string): void
  onClose(id: string): void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 p-1">
      {panes.map((id, idx) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={
            'flex items-center gap-1 rounded-md px-2.5 py-1 font-mono text-xs ' +
            (id === activeTab
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          <Pin className="size-3" />
          <span>{id.slice(0, 8)}</span>
          {idx > 0 && (
            <span
              role="button"
              tabIndex={-1}
              className="ml-1 rounded px-1 text-muted-foreground hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation()
                onClose(id)
              }}
            >
              ×
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
