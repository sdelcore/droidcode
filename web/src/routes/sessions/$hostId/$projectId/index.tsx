import { useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute, useParams } from '@tanstack/react-router'
import { toast } from 'sonner'
import { CheckSquare2, Square, Trash2 } from 'lucide-react'
import type { SessionRecord } from 'sandbox-agent'
import {
  applyFilters,
  applySort,
  isSessionRunning,
  sessionCwd,
  sessionDisplayName,
  sessionMode,
} from '@/services/sessions/sortAndFilter'
import { sessionPreferencesRepository, projectRepository } from '@/services/db'
import {
  useConfigStore,
  useHostStore,
  useSessionStore,
} from '@/stores'
import type { ProjectFolder, SessionPreferences, SortPreset } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/sessions/$hostId/$projectId/')({
  component: SessionList,
})

const SORT_PRESETS: { value: SortPreset; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'workflow', label: 'Workflow order' },
  { value: 'created', label: 'Created (oldest first)' },
  { value: 'duration', label: 'Longest duration' },
  { value: 'files', label: 'Files modified' },
  { value: 'alpha', label: 'Alphabetical' },
]

function SessionList() {
  const { hostId, projectId } = useParams({ from: '/sessions/$hostId/$projectId/' })
  const numericHostId = Number(hostId)
  const numericProjectId = Number(projectId)

  const host = useHostStore((s) => s.hosts.find((h) => h.id === numericHostId))
  const sessions = useSessionStore((s) => s.byHost[numericHostId] ?? [])
  const filters = useSessionStore((s) => s.filters)
  const loadSessions = useSessionStore((s) => s.loadForHost)
  const destroySession = useSessionStore((s) => s.destroySession)
  const createSession = useSessionStore((s) => s.createSession)
  const setFilters = useSessionStore((s) => s.setFilters)
  const setSortPreset = useSessionStore((s) => s.setSortPreset)
  const clearFilters = useSessionStore((s) => s.clearFilters)
  const isSessionsLoading = useSessionStore((s) => s.isLoading)
  const sessionsError = useSessionStore((s) => s.error)

  const agents = useConfigStore((s) => s.agentsByHost[numericHostId] ?? [])
  const loadAgents = useConfigStore((s) => s.loadAgents)

  const [project, setProject] = useState<ProjectFolder | null>(null)
  const [prefs, setPrefs] = useState<Record<string, SessionPreferences>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [renameTarget, setRenameTarget] = useState<SessionRecord | null>(null)
  const [renameValue, setRenameValue] = useState('')

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
    filteredAndSorted.length > 0 &&
    filteredAndSorted.every((s) => selected.has(s.id))

  function toggleOne(sessionId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredAndSorted.map((s) => s.id)))
    }
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

  async function handleRenameSave() {
    if (!renameTarget) return
    const alias = renameValue.trim()
    const existing = prefs[renameTarget.id]
    const next: SessionPreferences = {
      ...existing,
      sessionId: renameTarget.id,
      hostId: numericHostId,
      alias: alias || undefined,
    }
    await sessionPreferencesRepository.save(next)
    setPrefs((p) => ({ ...p, [renameTarget.id]: next }))
    setRenameTarget(null)
    toast.success(alias ? `Renamed to "${alias}"` : 'Alias cleared')
  }

  async function handleNewSession() {
    if (!project) return
    const installed = agents.find((a) => a.installed && a.credentialsAvailable)
    if (!installed) {
      toast.error('No installed agent with credentials on this host')
      return
    }
    try {
      const record = await createSession(numericHostId, {
        agent: installed.id,
        cwd: project.directory,
      })
      toast.success(`Created session ${record.id.slice(0, 8)} (chat UI lands in Phase 5)`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Create failed')
    }
  }

  if (!host) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <p className="text-sm text-muted-foreground">Host not found.</p>
        <Button asChild size="sm" variant="outline">
          <Link to="/hosts">Back to hosts</Link>
        </Button>
      </main>
    )
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
          <span>{project?.name ?? 'Project'}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Sessions</h1>
            <p className="truncate text-sm text-muted-foreground">
              {project?.directory ?? 'Loading project…'}
            </p>
          </div>
          <Button size="sm" onClick={handleNewSession} disabled={!project}>
            New session
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
          {allVisibleSelected ? (
            <CheckSquare2 className="size-4" />
          ) : (
            <Square className="size-4" />
          )}
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
        <ul className="flex flex-col gap-2">
          {filteredAndSorted.map((s) => (
            <SessionRow
              key={s.id}
              record={s}
              alias={prefs[s.id]?.alias}
              selected={selected.has(s.id)}
              onToggle={() => toggleOne(s.id)}
              onRename={() => {
                setRenameTarget(s)
                setRenameValue(prefs[s.id]?.alias ?? '')
              }}
            />
          ))}
        </ul>
      )}

      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="alias">Alias</Label>
            <Input
              id="alias"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Leave empty to clear"
              autoFocus
            />
            {renameTarget && (
              <p className="text-xs text-muted-foreground">
                Session id: <span className="font-mono">{renameTarget.id}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRenameSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const sortLabel =
    SORT_PRESETS.find((p) => p.value === sortPreset)?.label ?? 'Sort'

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

function SessionRow({
  record,
  alias,
  selected,
  onToggle,
  onRename,
}: {
  record: SessionRecord
  alias?: string
  selected: boolean
  onToggle: () => void
  onRename: () => void
}) {
  const running = isSessionRunning(record)
  const mode = sessionMode(record)
  const cwd = sessionCwd(record)
  const name = sessionDisplayName(record, alias ? { sessionId: record.id, hostId: 0, alias } : undefined)

  return (
    <li>
      <Card>
        <CardContent className="flex items-center gap-3 p-3">
          <Checkbox checked={selected} onCheckedChange={onToggle} aria-label="Select session" />
          <button
            type="button"
            className="flex min-w-0 flex-1 flex-col items-start text-left"
            onClick={onRename}
          >
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {record.agent}
              {cwd && ` · ${cwd}`}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            {mode && <Badge variant="secondary">{mode}</Badge>}
            <Badge variant={running ? 'default' : 'outline'}>
              {running ? 'running' : 'completed'}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(record.createdAt).toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Card>
    </li>
  )
}
