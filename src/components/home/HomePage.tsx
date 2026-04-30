import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Columns3, Plus, Server, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useHostStore } from '@/stores/hostStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWatchLiveMany } from '@/stores'
import {
  buildHomeView,
  serializeHomeFilters,
  type FlatSession,
  type HomeFilterState,
  type HomeSearch,
} from '@/services/sessions/homeView'
import { FilterBar } from './FilterBar'
import { SessionTile } from './SessionTile'

interface HomePageProps {
  search: HomeSearch
  onRequestNewSession(): void
}

export function HomePage({ search, onRequestNewSession }: HomePageProps) {
  const navigate = useNavigate()
  const hosts = useHostStore((s) => s.hosts)
  const hostsLoaded = useHostStore((s) => s.isInitialized)
  const byHost = useSessionStore((s) => s.byHost)
  const isLoading = useSessionStore((s) => s.isLoading)
  const error = useSessionStore((s) => s.error)
  const loadAllHosts = useSessionStore((s) => s.loadAllHosts)
  const destroySession = useSessionStore((s) => s.destroySession)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectionActive, setSelectionActive] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (hostsLoaded) loadAllHosts()
  }, [hostsLoaded, loadAllHosts])

  const view = useMemo(
    () => buildHomeView({ search, byHost, hosts }),
    [search, byHost, hosts],
  )
  const { filters, visible, total, facets } = view

  const updateFilters = useCallback(
    (next: Partial<HomeFilterState>) => {
      const merged: HomeFilterState = { ...filters, ...next }
      navigate({
        to: '/',
        search: serializeHomeFilters(merged),
        replace: true,
      })
    },
    [filters, navigate],
  )

  const clearFilters = useCallback(() => {
    navigate({ to: '/', search: {}, replace: true })
  }, [navigate])

  // Live status subscriptions for visible, non-destroyed sessions only.
  useWatchLiveMany(
    visible
      .filter((f) => !f.session.destroyedAt)
      .map((f) => ({ hostId: f.hostId, sessionId: f.session.id })),
  )

  function openSession(f: FlatSession) {
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: { hostId: String(f.hostId), sessionId: f.session.id },
    })
  }

  function addAsPane(f: FlatSession) {
    // Same-host pane add via extra=sessionId; cross-host support lands in
    // the extra= tuple refactor.
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: { hostId: String(f.hostId), sessionId: f.session.id },
    })
  }

  function toggleSelect(sessionId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
    setSelectionActive(true)
  }

  function enterSelectMode(sessionId: string) {
    setSelectionActive(true)
    setSelected(new Set([sessionId]))
  }

  function exitSelectMode() {
    setSelectionActive(false)
    setSelected(new Set())
  }

  function openSelectedInPanes() {
    if (selected.size === 0) return
    const ordered = visible.filter((f) => selected.has(f.session.id))
    if (ordered.length === 0) return
    const [primary, ...rest] = ordered
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: { hostId: String(primary.hostId), sessionId: primary.session.id },
      search:
        rest.length > 0
          ? {
              extra: rest.map((r) => `${r.hostId}:${r.session.id}`).join(','),
            }
          : {},
    })
  }

  async function handleRename(f: FlatSession) {
    const next = window.prompt('Rename session', f.alias ?? '')
    if (next === null) return
    const trimmed = next.trim()
    try {
      await useSessionStore
        .getState()
        .patchSession(f.hostId, f.session.id, { alias: trimmed || null })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rename failed')
    }
  }

  async function handleDestroy(f: FlatSession) {
    if (!window.confirm(`Destroy session ${f.alias ?? f.session.id.slice(0, 8)}?`)) return
    try {
      await destroySession(f.hostId, f.session.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Destroy failed')
    }
  }

  function onTilePressStart(sessionId: string) {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => enterSelectMode(sessionId), 450)
  }

  function onTilePressEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  const columnClasses =
    'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-xl font-semibold sm:text-2xl">Sessions</h1>
          <span className="text-xs text-muted-foreground">
            {visible.length} of {total}
          </span>
        </div>
        <Button
          size="sm"
          onClick={onRequestNewSession}
          className="h-10 shrink-0 sm:h-9"
        >
          <Plus className="size-4" />
          New
        </Button>
      </div>

      <FilterBar
        filters={filters}
        hostFacets={facets.hosts}
        projectFacets={facets.projects}
        onChange={updateFilters}
        onClear={clearFilters}
      />

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {selectionActive && (
        <div className="sticky bottom-2 z-20 mx-auto flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
          <span className="text-sm">{selected.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size === 0}
            onClick={openSelectedInPanes}
          >
            <Columns3 className="size-4" />
            Open in panes
          </Button>
          <Button size="sm" variant="ghost" onClick={exitSelectMode}>
            <X className="size-4" />
            Done
          </Button>
        </div>
      )}

      {isLoading && visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Loading sessions…
        </p>
      ) : hosts.length === 0 ? (
        <EmptyState
          title="No hosts yet"
          body="Add a host to start a session."
          action={{ label: 'Open settings', onClick: () => navigate({ to: '/settings' }) }}
        />
      ) : total === 0 ? (
        <EmptyState
          title="No sessions"
          body="Create your first session on this host."
          action={{ label: 'New session', onClick: onRequestNewSession }}
          icon={<Server className="size-6 text-muted-foreground" />}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No matches"
          body="Nothing matches your filters."
          action={{ label: 'Clear filters', onClick: clearFilters }}
        />
      ) : (
        <div className={columnClasses}>
          {visible.map((f) => (
            <div
              key={`${f.hostId}:${f.session.id}`}
              onPointerDown={() => onTilePressStart(f.session.id)}
              onPointerUp={onTilePressEnd}
              onPointerCancel={onTilePressEnd}
              onPointerLeave={onTilePressEnd}
            >
              <SessionTile
                flat={f}
                selectionActive={selectionActive}
                selected={selected.has(f.session.id)}
                onOpen={() => openSession(f)}
                onAddAsPane={() => addAsPane(f)}
                onToggleSelect={() => toggleSelect(f.session.id)}
                onRename={() => handleRename(f)}
                onDestroy={() => handleDestroy(f)}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

interface EmptyStateProps {
  title: string
  body: string
  action?: { label: string; onClick(): void }
  icon?: React.ReactNode
}

function EmptyState({ title, body, action, icon }: EmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-12 text-center">
      {icon}
      <h2 className="text-base font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action && (
        <Button size="sm" variant="outline" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
