import { useEffect, useMemo, useState } from 'react'
import {
  Link,
  createFileRoute,
  useNavigate,
  useParams,
  useSearch,
} from '@tanstack/react-router'
import { ArrowLeft, PanelLeft, Pin, Plus } from 'lucide-react'
import { AddPaneDialog } from '@/components/chat/AddPaneDialog'
import { ChatPane } from '@/components/chat/ChatPane'
import { SessionSidebar } from '@/components/chat/SessionSidebar'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  paneKey,
  parseExtraPanes,
  serializeExtraPanes,
  type PaneRef,
} from '@/services/sessions/panes'
import { useHostStore, useSessionStore } from '@/stores'

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
  const hosts = useHostStore((s) => s.hosts)
  const host = hosts.find((h) => h.id === numericHostId)

  const primaryRef: PaneRef = useMemo(
    () => ({ hostId: numericHostId, sessionId }),
    [numericHostId, sessionId],
  )

  const extraPanes = useMemo(
    () => parseExtraPanes(search.extra, primaryRef, MAX_PANES_DESKTOP - 1),
    [search.extra, primaryRef],
  )

  const panes = useMemo<PaneRef[]>(
    () => [primaryRef, ...extraPanes],
    [primaryRef, extraPanes],
  )

  const hostsSpanned = useMemo(() => {
    const set = new Set<number>()
    for (const p of panes) set.add(p.hostId)
    return set
  }, [panes])

  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < 768,
  )

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const [activeTab, setActiveTab] = useState<string>(paneKey(primaryRef))
  const [addPaneOpen, setAddPaneOpen] = useState(false)
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false)
  const [sidebarCollapsedDesktop, setSidebarCollapsedDesktop] = useState(false)

  const sessions = useSessionStore((s) => s.byHost[numericHostId])

  const primaryCwd = useMemo(() => {
    const primary = sessions?.find((s) => s.id === sessionId)
    return (primary?.sessionInit as { cwd?: string } | undefined)?.cwd
  }, [sessions, sessionId])

  useEffect(() => {
    setActiveTab(paneKey(primaryRef))
  }, [primaryRef])

  function navigateToPanes(nextPrimary: PaneRef, nextExtras: PaneRef[]) {
    const extra = serializeExtraPanes(nextExtras)
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: {
        hostId: String(nextPrimary.hostId),
        sessionId: nextPrimary.sessionId,
      },
      search: extra ? { extra } : {},
    })
  }

  function addExtraPane(ref: PaneRef) {
    if (panes.some((p) => p.hostId === ref.hostId && p.sessionId === ref.sessionId)) {
      return
    }
    if (panes.length >= MAX_PANES_DESKTOP) return
    navigateToPanes(primaryRef, [...extraPanes, ref])
    setActiveTab(paneKey(ref))
  }

  function openAsPrimary(ref: PaneRef) {
    if (ref.hostId === primaryRef.hostId && ref.sessionId === primaryRef.sessionId) {
      if (extraPanes.length === 0) return
    }
    // Plain switch: drop all extras and make this the only open pane.
    navigateToPanes(ref, [])
  }

  function closePane(key: string) {
    const isPrimary = key === paneKey(primaryRef)
    if (isPrimary) {
      const [nextPrimary, ...rest] = extraPanes
      if (nextPrimary) {
        navigateToPanes(nextPrimary, rest)
        return
      }
      navigate({ to: '/' })
      return
    }
    const nextExtras = extraPanes.filter((p) => paneKey(p) !== key)
    navigateToPanes(primaryRef, nextExtras)
  }

  function onAfterDelete(deletedKey: string) {
    // Deletion of a session: treat same as close. Any still-visible panes
    // reflect the deletion on their own through their store updates.
    closePane(deletedKey)
  }

  if (!host) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">Host not found.</p>
        <Button asChild size="sm" variant="outline">
          <Link to="/">Back to home</Link>
        </Button>
      </main>
    )
  }

  // Sidebar shows sessions on the primary pane's host only. Cross-host
  // panes still render correctly — the sidebar just can't pin/unpin them.
  const sameHostPaneIds = panes
    .filter((p) => p.hostId === numericHostId)
    .map((p) => p.sessionId)
  const sameHostExtraIds = extraPanes
    .filter((p) => p.hostId === numericHostId)
    .map((p) => p.sessionId)

  const sidebarNode = (
    <SessionSidebar
      hostId={numericHostId}
      panes={sameHostPaneIds}
      primarySessionId={sessionId}
      extraPanes={sameHostExtraIds}
      defaultCwd={primaryCwd}
      onOpenPrimary={(sid) => openAsPrimary({ hostId: numericHostId, sessionId: sid })}
      onAddPane={(sid) => addExtraPane({ hostId: numericHostId, sessionId: sid })}
      onRemovePane={(sid) =>
        closePane(paneKey({ hostId: numericHostId, sessionId: sid }))
      }
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar
        hostName={host.name}
        paneCount={panes.length}
        crossHost={hostsSpanned.size > 1}
        canPin={panes.length < MAX_PANES_DESKTOP}
        onAddPane={() => setAddPaneOpen(true)}
        sidebarCollapsed={sidebarCollapsedDesktop}
        onToggleSidebar={() => setSidebarCollapsedDesktop((v) => !v)}
        onOpenMobileSidebar={() => setSidebarOpenMobile(true)}
      />
      <AddPaneDialog
        hostId={numericHostId}
        excludeSessionIds={sameHostPaneIds}
        open={addPaneOpen}
        onOpenChange={setAddPaneOpen}
        onSelect={(sid) => addExtraPane({ hostId: numericHostId, sessionId: sid })}
      />

      <Sheet open={sidebarOpenMobile} onOpenChange={setSidebarOpenMobile}>
        <SheetContent side="left" className="flex w-72 flex-col p-0">
          <SheetHeader className="border-b border-border p-3">
            <SheetTitle className="text-sm">Sessions on {host.name}</SheetTitle>
          </SheetHeader>
          <div
            className="flex min-h-0 flex-1"
            onClick={() => setSidebarOpenMobile(false)}
          >
            {sidebarNode}
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 flex-1 flex-row">
        {!isNarrow && !sidebarCollapsedDesktop && (
          <div className="hidden w-64 shrink-0 md:flex">{sidebarNode}</div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{renderPanes()}</div>
      </div>
    </div>
  )

  function renderPanes() {
    return isNarrow && panes.length > 1 ? (
      <>
        <TabBar
          panes={panes}
          hosts={hosts}
          activeKey={activeTab}
          onSelect={setActiveTab}
          onClose={closePane}
        />
        <div className="flex min-h-0 flex-1 flex-col">
          {panes.map((p) => {
            const key = paneKey(p)
            return (
              <div
                key={key}
                className={key === activeTab ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
              >
                <ChatPane
                  hostId={p.hostId}
                  sessionId={p.sessionId}
                  isActive={key === activeTab}
                  onClose={panes.length > 1 ? () => closePane(key) : undefined}
                  onAfterDelete={() => onAfterDelete(key)}
                />
              </div>
            )
          })}
        </div>
      </>
    ) : (
      <div className="flex min-h-0 flex-1 flex-row overflow-x-auto">
        {panes.map((p) => {
          const key = paneKey(p)
          return (
            <ChatPane
              key={key}
              hostId={p.hostId}
              sessionId={p.sessionId}
              isActive={key === paneKey(primaryRef)}
              onClose={panes.length > 1 ? () => closePane(key) : undefined}
              onAfterDelete={() => onAfterDelete(key)}
            />
          )
        })}
      </div>
    )
  }
}

interface TopBarProps {
  hostName: string
  paneCount: number
  crossHost: boolean
  canPin: boolean
  onAddPane(): void
  sidebarCollapsed: boolean
  onToggleSidebar(): void
  onOpenMobileSidebar(): void
}

function TopBar({
  hostName,
  paneCount,
  crossHost,
  canPin,
  onAddPane,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileSidebar,
}: TopBarProps) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-background/95 px-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Button
          size="icon"
          variant="ghost"
          className="size-7 md:hidden"
          onClick={onOpenMobileSidebar}
          aria-label="Open sessions sidebar"
        >
          <PanelLeft className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="hidden size-7 md:inline-flex"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? 'Show sessions sidebar' : 'Hide sessions sidebar'}
          title={sidebarCollapsed ? 'Show sessions sidebar' : 'Hide sessions sidebar'}
        >
          <PanelLeft className="size-4" />
        </Button>

        <Link
          to="/"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-foreground hover:bg-muted"
          title="Back to sessions"
        >
          <ArrowLeft className="size-3.5" />
          <span className="hidden sm:inline">Back</span>
        </Link>

        <span className="opacity-50">·</span>
        <span>{hostName}</span>
        {crossHost && (
          <span
            className="rounded-full border border-amber-500/40 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400"
            title="Panes span multiple hosts"
          >
            multi-host
          </span>
        )}
        <span className="opacity-50">·</span>
        <span>
          {paneCount} {paneCount === 1 ? 'pane' : 'panes'}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2"
          onClick={onAddPane}
          disabled={!canPin}
          title={canPin ? 'Open another session in a pane' : 'Max panes open'}
        >
          <Plus className="size-3.5" />
          <span className="hidden sm:inline">Add pane</span>
        </Button>
        <nav className="hidden items-center gap-3 sm:flex">
          <Link to="/" className="hover:text-foreground">
            Home
          </Link>
          <Link to="/settings" className="hover:text-foreground">
            Settings
          </Link>
        </nav>
      </div>
    </div>
  )
}

interface TabBarProps {
  panes: PaneRef[]
  hosts: ReturnType<typeof useHostStore.getState>['hosts']
  activeKey: string
  onSelect(key: string): void
  onClose(key: string): void
}

function TabBar({ panes, hosts, activeKey, onSelect, onClose }: TabBarProps) {
  const multiHost = new Set(panes.map((p) => p.hostId)).size > 1
  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 p-1">
      {panes.map((p) => {
        const key = paneKey(p)
        const host = hosts.find((h) => h.id === p.hostId)
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={
              'flex items-center gap-1 rounded-md px-2.5 py-1 font-mono text-xs ' +
              (key === activeKey
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            <Pin className="size-3" />
            {multiHost && host && <span className="opacity-70">{host.name}·</span>}
            <span>{p.sessionId.slice(0, 8)}</span>
            <span
              role="button"
              tabIndex={-1}
              className="ml-1 rounded px-1 text-muted-foreground hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation()
                onClose(key)
              }}
            >
              ×
            </span>
          </button>
        )
      })}
    </div>
  )
}
