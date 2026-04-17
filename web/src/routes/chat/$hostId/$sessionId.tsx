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
import { projectRepository } from '@/services/db'
import { useHostStore, useSessionStore } from '@/stores'
import type { ProjectFolder } from '@/types'

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
  const [addPaneOpen, setAddPaneOpen] = useState(false)
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false)
  const [sidebarCollapsedDesktop, setSidebarCollapsedDesktop] = useState(false)
  const [projectsForHost, setProjectsForHost] = useState<ProjectFolder[]>([])

  const sessions = useSessionStore((s) => s.byHost[numericHostId])

  // Derive which dashboard the "Back" button should link to, by matching
  // the primary pane's cwd against known remembered project folders.
  useEffect(() => {
    let cancelled = false
    projectRepository.getByHost(numericHostId).then((rows) => {
      if (!cancelled) setProjectsForHost(rows)
    })
    return () => {
      cancelled = true
    }
  }, [numericHostId])

  const backTarget = useMemo(() => {
    const primary = sessions?.find((s) => s.id === sessionId)
    const cwd = (primary?.sessionInit as { cwd?: string } | undefined)?.cwd
    const project = cwd ? projectsForHost.find((p) => p.directory === cwd) : undefined
    const params: Record<string, string> = { hostId: String(numericHostId) }
    if (project) {
      params.projectId = String(project.id)
      return { to: '/sessions/$hostId/$projectId', params }
    }
    return { to: '/projects/$hostId', params }
  }, [sessions, sessionId, projectsForHost, numericHostId])

  useEffect(() => {
    // If the primary pane changes (route navigation), reset active tab to it.
    setActiveTab(sessionId)
  }, [sessionId])

  function addExtraPane(extraSessionId: string) {
    if (panes.includes(extraSessionId)) return
    if (panes.length >= MAX_PANES_DESKTOP) return
    const nextExtras = [...extraPanes, extraSessionId].join(',')
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: { hostId: String(numericHostId), sessionId },
      search: { extra: nextExtras },
    })
    setActiveTab(extraSessionId)
  }

  function openAsPrimary(newPrimary: string) {
    if (newPrimary === sessionId) return
    // Keep current extras minus the new primary (if it was already in view).
    const keptExtras = extraPanes.filter((id) => id !== newPrimary)
    // The old primary becomes an extra IF there's room and it isn't already there.
    if (keptExtras.length < MAX_PANES_DESKTOP - 1 && !keptExtras.includes(sessionId)) {
      keptExtras.unshift(sessionId)
    }
    const nextExtra = keptExtras.join(',') || undefined
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: { hostId: String(numericHostId), sessionId: newPrimary },
      search: nextExtra ? { extra: nextExtra } : {},
    })
  }

  function closeExtra(extraId: string) {
    const next = extraPanes.filter((id) => id !== extraId).join(',') || undefined
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: { hostId: String(numericHostId), sessionId },
      search: next ? { extra: next } : {},
    })
  }

  function closePane(paneId: string) {
    // Closing the primary pane: promote the first extra, or fall back to hosts.
    if (paneId === sessionId) {
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
    closeExtra(paneId)
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

  const sidebarNode = (
    <SessionSidebar
      hostId={numericHostId}
      panes={panes}
      primarySessionId={sessionId}
      extraPanes={extraPanes}
      onOpenPrimary={openAsPrimary}
      onAddPane={addExtraPane}
      onRemovePane={closePane}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar
        hostName={host.name}
        hostId={numericHostId}
        paneCount={panes.length}
        canPin={panes.length < MAX_PANES_DESKTOP}
        onAddPane={() => setAddPaneOpen(true)}
        backTo={backTarget}
        sidebarCollapsed={sidebarCollapsedDesktop}
        onToggleSidebar={() => setSidebarCollapsedDesktop((v) => !v)}
        onOpenMobileSidebar={() => setSidebarOpenMobile(true)}
      />
      <AddPaneDialog
        hostId={numericHostId}
        excludeSessionIds={panes}
        open={addPaneOpen}
        onOpenChange={setAddPaneOpen}
        onSelect={addExtraPane}
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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {renderPanes()}
        </div>
      </div>
    </div>
  )

  function renderPanes() {
    return isNarrow && panes.length > 1 ? (
        <>
          <TabBar
            panes={panes}
            activeTab={activeTab}
            onSelect={setActiveTab}
            onClose={closePane}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            {panes.map((id) => (
              <div key={id} className={id === activeTab ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                <ChatPane
                  hostId={numericHostId}
                  sessionId={id}
                  isActive={id === activeTab}
                  onClose={panes.length > 1 ? () => closePane(id) : undefined}
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
              onClose={panes.length > 1 ? () => closePane(id) : undefined}
              onAfterDelete={() => onAfterDelete(id)}
            />
          ))}
        </div>
      )
  }
}

function TopBar({
  hostName,
  paneCount,
  canPin,
  onAddPane,
  backTo,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileSidebar,
}: {
  hostName: string
  hostId: number
  paneCount: number
  canPin: boolean
  onAddPane(): void
  backTo: { to: string; params?: Record<string, string> }
  sidebarCollapsed: boolean
  onToggleSidebar(): void
  onOpenMobileSidebar(): void
}) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-background/95 px-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {/* Mobile: open sidebar sheet */}
        <Button
          size="icon"
          variant="ghost"
          className="size-7 md:hidden"
          onClick={onOpenMobileSidebar}
          aria-label="Open sessions sidebar"
        >
          <PanelLeft className="size-4" />
        </Button>
        {/* Desktop: collapse sidebar column */}
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
          to={backTo.to}
          params={backTo.params}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-foreground hover:bg-muted"
          title="Back to session grid"
        >
          <ArrowLeft className="size-3.5" />
          <span className="hidden sm:inline">Back</span>
        </Link>

        <span className="opacity-50">·</span>
        <Link to="/hosts" className="hover:text-foreground">
          {hostName}
        </Link>
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
          <Link to="/hosts" className="hover:text-foreground">
            Hosts
          </Link>
          <Link to="/settings" className="hover:text-foreground">
            Settings
          </Link>
        </nav>
      </div>
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
      {panes.map((id) => (
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
        </button>
      ))}
    </div>
  )
}
