import { useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  CheckSquare2,
  Columns3,
  FilePen,
  Hammer,
  HelpCircle,
  MoreHorizontal,
  Square,
  Trash2,
} from 'lucide-react'
import type { SessionRecord } from 'sandbox-agent'
import { NewSessionDialog } from '@/components/NewSessionDialog'
import { useLiveStatus, useSessionLiveStore } from '@/stores/sessionLiveStore'
import {
  applyFilters,
  applySort,
  isSessionRunning,
  sessionCwd,
  sessionDisplayName,
  sessionMode,
} from '@/services/sessions/sortAndFilter'
import { sessionPreferencesRepository, projectRepository } from '@/services/db'
import { useConfigStore, useHostStore, useSessionStore } from '@/stores'
import { useMetadataStore } from '@/stores/metadataStore'
import type { ProjectFolder, SessionPreferences, SortPreset } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export const Route = createFileRoute('/sessions/$hostId/$projectId/')({
  component: SessionDashboard,
})

const EMPTY_SESSIONS: SessionRecord[] = []

const SORT_PRESETS: { value: SortPreset; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'workflow', label: 'Workflow order' },
  { value: 'created', label: 'Created (oldest first)' },
  { value: 'duration', label: 'Longest duration' },
  { value: 'files', label: 'Files modified' },
  { value: 'alpha', label: 'Alphabetical' },
]

function SessionDashboard() {
  const { hostId, projectId } = useParams({ from: '/sessions/$hostId/$projectId/' })
  const numericHostId = Number(hostId)
  const numericProjectId = Number(projectId)
  const navigate = useNavigate()

  const host = useHostStore((s) => s.hosts.find((h) => h.id === numericHostId))
  const sessions = useSessionStore((s) => s.byHost[numericHostId] ?? EMPTY_SESSIONS)
  const filters = useSessionStore((s) => s.filters)
  const loadSessions = useSessionStore((s) => s.loadForHost)
  const destroySession = useSessionStore((s) => s.destroySession)
  const setFilters = useSessionStore((s) => s.setFilters)
  const setSortPreset = useSessionStore((s) => s.setSortPreset)
  const clearFilters = useSessionStore((s) => s.clearFilters)
  const isSessionsLoading = useSessionStore((s) => s.isLoading)
  const sessionsError = useSessionStore((s) => s.error)

  const loadAgents = useConfigStore((s) => s.loadAgents)

  const [project, setProject] = useState<ProjectFolder | null>(null)
  const [prefs, setPrefs] = useState<Record<string, SessionPreferences>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)

  const watch = useSessionLiveStore((s) => s.watch)
  const unwatch = useSessionLiveStore((s) => s.unwatch)

  useEffect(() => {
    let cancelled = false
    projectRepository.getById(numericProjectId).then((p) => {
      if (!cancelled) setProject(p ?? null)
    })
    sessionPreferencesRepository.getByHost(numericHostId).then((rows) => {
      if (cancelled) return
      const byId: Record<string, SessionPreferences> = {}
      for (const p of rows) byId[p.sessionId] = p
      setPrefs(byId)
    })
    loadSessions(numericHostId)
    loadAgents(numericHostId)
    return () => {
      cancelled = true
    }
  }, [numericHostId, numericProjectId, loadSessions, loadAgents])

  const filteredAndSorted = useMemo(() => {
    const base = applyFilters(sessions, filters, { cwd: project?.directory })
    return applySort(base, filters.sortPreset, prefs)
  }, [sessions, filters, prefs, project?.directory])

  // Live-subscribe to every visible non-destroyed session so tile status
  // updates as events flow, and tear down on leave. Destroyed sessions
  // can't change state, so don't waste a subscription on them.
  useEffect(() => {
    const watching = filteredAndSorted
      .filter((s) => !s.destroyedAt)
      .map((s) => s.id)
    for (const id of watching) watch(numericHostId, id)
    return () => {
      for (const id of watching) unwatch(numericHostId, id)
    }
  }, [filteredAndSorted, numericHostId, watch, unwatch])

  const availableModes = useMemo(() => {
    const set = new Set<string>()
    for (const s of sessions) {
      const m = sessionMode(s)
      if (m) set.add(m)
    }
    return Array.from(set).sort()
  }, [sessions])

  const allVisibleSelected =
    filteredAndSorted.length > 0 && filteredAndSorted.every((s) => selected.has(s.id))

  function toggleOne(sessionId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  function toggleAllVisible() {
    if (allVisibleSelected) setSelected(new Set())
    else setSelected(new Set(filteredAndSorted.map((s) => s.id)))
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    const results = await Promise.allSettled(
      ids.map((id) => destroySession(numericHostId, id)),
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    setSelected(new Set())
    if (failed === 0) toast.success(`Deleted ${ids.length} session${ids.length === 1 ? '' : 's'}`)
    else toast.error(`Deleted ${ids.length - failed}, ${failed} failed`)
  }

  async function saveAlias(sessionId: string, alias: string) {
    const existing = prefs[sessionId]
    const trimmed = alias.trim()
    const next: SessionPreferences = {
      ...existing,
      sessionId,
      hostId: numericHostId,
      alias: trimmed || undefined,
    }
    await sessionPreferencesRepository.save(next)
    setPrefs((p) => ({ ...p, [sessionId]: next }))
    // Mirror to the shared metadata file so the rename follows you across
    // browsers pointed at the same daemon.
    useMetadataStore.getState().upsertSession(numericHostId, {
      id: sessionId,
      alias: trimmed || undefined,
    })
  }

  function handleSessionCreated(sessionId: string) {
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: { hostId: String(numericHostId), sessionId },
    })
  }

  function openSessionChat(sessionId: string) {
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: { hostId: String(numericHostId), sessionId },
    })
  }

  function openSelectedInPanels() {
    if (selected.size === 0) return
    // Order by currently-sorted order so the primary is the first visible one.
    const selectedOrdered = filteredAndSorted
      .map((s) => s.id)
      .filter((id) => selected.has(id))
    if (selectedOrdered.length === 0) return
    const [primary, ...rest] = selectedOrdered
    navigate({
      to: '/chat/$hostId/$sessionId',
      params: { hostId: String(numericHostId), sessionId: primary },
      search: rest.length > 0 ? { extra: rest.join(',') } : {},
    })
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <Link to="/hosts" className="hover:text-foreground">
            Hosts
          </Link>
          <span>/</span>
          <Link
            to="/projects/$hostId"
            params={{ hostId: String(numericHostId) }}
            className="hover:text-foreground"
          >
            {host.name}
          </Link>
          <span>/</span>
          <span className="truncate">{project?.name ?? 'Project'}</span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">Sessions</h1>
            <p className="truncate text-sm text-muted-foreground">
              {project?.directory ?? 'Loading project…'}
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => setNewSessionOpen(true)}
            disabled={!project}
          >
            New
          </Button>
        </div>
      </div>

      <FilterBar
        availableModes={availableModes}
        selectedModes={filters.modes}
        selectedStatuses={filters.statuses}
        sortPreset={filters.sortPreset}
        onModeToggle={(m) => {
          const next = new Set(filters.modes)
          if (next.has(m)) next.delete(m)
          else next.add(m)
          setFilters({ modes: next })
        }}
        onStatusToggle={(st) => {
          const next = new Set(filters.statuses)
          if (next.has(st)) next.delete(st)
          else next.add(st)
          setFilters({ statuses: next })
        }}
        onSortChange={setSortPreset}
        onClearFilters={clearFilters}
      />

      <Separator />

      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={toggleAllVisible}
          disabled={filteredAndSorted.length === 0}
        >
          {allVisibleSelected ? <CheckSquare2 className="size-4" /> : <Square className="size-4" />}
          {selected.size === 0 ? 'Select all' : `${selected.size} selected`}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size === 0}
            onClick={openSelectedInPanels}
            title="Open selected sessions side-by-side"
          >
            <Columns3 className="size-4" />
            Open {selected.size > 0 ? selected.size : ''}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={selected.size === 0}
            onClick={handleBulkDelete}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      {sessionsError && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {sessionsError}
        </div>
      )}

      {isSessionsLoading && filteredAndSorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading sessions…</p>
      ) : filteredAndSorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sessions match the current filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAndSorted.map((s) => (
            <SessionTile
              key={s.id}
              record={s}
              alias={prefs[s.id]?.alias}
              selected={selected.has(s.id)}
              editing={editingSessionId === s.id}
              onStartEditing={() => setEditingSessionId(s.id)}
              onStopEditing={() => setEditingSessionId(null)}
              onSaveAlias={(alias) => saveAlias(s.id, alias)}
              onToggle={() => toggleOne(s.id)}
              onOpen={() => openSessionChat(s.id)}
            />
          ))}
        </div>
      )}

      {project && (
        <NewSessionDialog
          initialHostId={numericHostId}
          initialCwd={project.directory}
          open={newSessionOpen}
          onOpenChange={setNewSessionOpen}
          onCreated={(_hostId, sessionId) => handleSessionCreated(sessionId)}
        />
      )}
    </main>
  )
}

function FilterBar({
  availableModes,
  selectedModes,
  selectedStatuses,
  sortPreset,
  onModeToggle,
  onStatusToggle,
  onSortChange,
  onClearFilters,
}: {
  availableModes: string[]
  selectedModes: Set<string>
  selectedStatuses: Set<'running' | 'completed'>
  sortPreset: SortPreset
  onModeToggle(mode: string): void
  onStatusToggle(status: 'running' | 'completed'): void
  onSortChange(preset: SortPreset): void
  onClearFilters(): void
}) {
  const sortLabel = SORT_PRESETS.find((p) => p.value === sortPreset)?.label ?? 'Sort'
  const hasAnyFilter =
    selectedModes.size > 0 || selectedStatuses.size > 0 || sortPreset !== 'recent'

  return (
    <div className="flex flex-wrap items-center gap-3">
      {availableModes.length > 0 && (
        <ToggleGroup
          type="multiple"
          value={Array.from(selectedModes)}
          onValueChange={(values) => {
            for (const m of availableModes) {
              const shouldBeOn = values.includes(m)
              const isOn = selectedModes.has(m)
              if (shouldBeOn !== isOn) onModeToggle(m)
            }
          }}
        >
          {availableModes.map((m) => (
            <ToggleGroupItem key={m} value={m} size="sm">
              {m}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      <ToggleGroup
        type="multiple"
        value={Array.from(selectedStatuses)}
        onValueChange={(values) => {
          for (const s of ['running', 'completed'] as const) {
            const shouldBeOn = values.includes(s)
            const isOn = selectedStatuses.has(s)
            if (shouldBeOn !== isOn) onStatusToggle(s)
          }
        }}
      >
        <ToggleGroupItem value="running" size="sm">
          Running
        </ToggleGroupItem>
        <ToggleGroupItem value="completed" size="sm">
          Completed
        </ToggleGroupItem>
      </ToggleGroup>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            {sortLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {SORT_PRESETS.map((p) => (
            <DropdownMenuItem key={p.value} onSelect={() => onSortChange(p.value)}>
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {hasAnyFilter && (
        <Button size="sm" variant="ghost" onClick={onClearFilters}>
          Clear
        </Button>
      )}
    </div>
  )
}

interface SessionTileProps {
  record: SessionRecord
  alias?: string
  selected: boolean
  editing: boolean
  onStartEditing(): void
  onStopEditing(): void
  onSaveAlias(alias: string): Promise<void> | void
  onToggle(): void
  onOpen(): void
}

function SessionTile({
  record,
  alias,
  selected,
  editing,
  onStartEditing,
  onStopEditing,
  onSaveAlias,
  onToggle,
  onOpen,
}: SessionTileProps) {
  const running = isSessionRunning(record)
  const mode = sessionMode(record)
  const cwd = sessionCwd(record)
  const live = useLiveStatus(record.id)
  const name = sessionDisplayName(
    record,
    alias ? { sessionId: record.id, hostId: 0, alias } : undefined,
  )
  const lastActivity = live?.lastActivityAt ?? record.destroyedAt ?? record.createdAt

  return (
    <Card
      className={
        selected ? 'border-primary/60 ring-1 ring-primary/30 transition-shadow' : 'transition-shadow'
      }
    >
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
              aria-label="Select session"
            />
            <StatusDot running={running} streaming={!!live?.streaming} />
            {live?.pendingPermission && (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/50 text-amber-600 dark:text-amber-400"
              >
                <HelpCircle className="size-3" />
                needs input
              </Badge>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="More" className="-mr-2 -mt-1">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onOpen}>Open chat</DropdownMenuItem>
              <DropdownMenuItem onSelect={onStartEditing}>Rename</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onToggle}>
                {selected ? 'Deselect' : 'Select'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {editing ? (
          <AliasEditor
            initial={alias ?? ''}
            onSave={async (v) => {
              await onSaveAlias(v)
              onStopEditing()
            }}
            onCancel={onStopEditing}
          />
        ) : (
          <button
            type="button"
            className="truncate text-left text-base font-medium hover:underline"
            onClick={onOpen}
            onDoubleClick={(e) => {
              e.preventDefault()
              onStartEditing()
            }}
            title={name}
          >
            {alias ? alias : <span className="font-mono text-sm">{record.id.slice(0, 12)}…</span>}
          </button>
        )}

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="font-normal">
            {record.agent}
          </Badge>
          {mode && (
            <Badge variant="secondary" className="font-normal">
              {mode}
            </Badge>
          )}
          <Badge variant={running ? 'default' : 'outline'} className="font-normal">
            {running ? 'running' : 'completed'}
          </Badge>
        </div>

        {cwd && (
          <div className="truncate font-mono text-[11px] text-muted-foreground" title={cwd}>
            {cwd}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            {live && live.fileChanges > 0 && (
              <span className="flex items-center gap-1" title="File edits">
                <FilePen className="size-3" />
                {live.fileChanges}
              </span>
            )}
            {live && live.toolCalls > 0 && (
              <span className="flex items-center gap-1" title="Tool calls">
                <Hammer className="size-3" />
                {live.toolCalls}
              </span>
            )}
          </div>
          <span>{formatRelative(lastActivity, record.destroyedAt)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusDot({ running, streaming }: { running: boolean; streaming: boolean }) {
  const color = streaming
    ? 'animate-pulse bg-sky-500'
    : running
      ? 'bg-emerald-500'
      : 'bg-muted-foreground/40'
  const label = streaming ? 'streaming' : running ? 'running' : 'completed'
  return (
    <span className={`inline-block size-2 rounded-full ${color}`} aria-label={label} title={label} />
  )
}

function AliasEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string
  onSave(value: string): void | Promise<void>
  onCancel(): void
}) {
  const [value, setValue] = useState(initial)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(value)
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Give it a name…"
        autoFocus
        onBlur={() => onSave(value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
      />
    </form>
  )
}

function formatRelative(createdAt: number, destroyedAt?: number): string {
  const when = destroyedAt ?? createdAt
  const diff = Date.now() - when
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
