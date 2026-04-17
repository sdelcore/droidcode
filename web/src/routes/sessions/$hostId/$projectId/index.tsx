import { useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { toast } from 'sonner'
import { CheckSquare2, MoreHorizontal, Square, Trash2 } from 'lucide-react'
import type { SessionRecord } from 'sandbox-agent'
import { NewSessionDialog } from '@/components/NewSessionDialog'
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

      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="ghost"
          onClick={toggleAllVisible}
          disabled={filteredAndSorted.length === 0}
        >
          {allVisibleSelected ? <CheckSquare2 className="size-4" /> : <Square className="size-4" />}
          {selected.size === 0 ? 'Select all' : `${selected.size} selected`}
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
          hostId={numericHostId}
          cwd={project.directory}
          open={newSessionOpen}
          onOpenChange={setNewSessionOpen}
          onCreated={handleSessionCreated}
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
  const name = sessionDisplayName(
    record,
    alias ? { sessionId: record.id, hostId: 0, alias } : undefined,
  )

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
            <StatusDot running={running} />
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
          <span>{formatRelative(record.createdAt, record.destroyedAt)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusDot({ running }: { running: boolean }) {
  return (
    <span
      className={
        'inline-block size-2 rounded-full ' +
        (running ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/40')
      }
      aria-label={running ? 'running' : 'completed'}
    />
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
