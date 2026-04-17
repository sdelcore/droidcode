import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { SessionRecord } from 'sandbox-agent'
import { useSessionStore } from '@/stores'
import { useLiveStatus, useSessionLiveStore } from '@/stores/sessionLiveStore'
import {
  isSessionRunning,
  sessionCwd,
  sessionDisplayName,
  sessionMode,
} from '@/services/sessions/sortAndFilter'
import { sessionPreferencesRepository } from '@/services/db'
import type { SessionPreferences } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface SessionSidebarProps {
  hostId: number
  panes: string[]
  primarySessionId: string
  extraPanes: string[]
  onOpenPrimary(sessionId: string): void
  onAddPane(sessionId: string): void
  onRemovePane(sessionId: string): void
}

const EMPTY_SESSIONS: SessionRecord[] = []

export function SessionSidebar({
  hostId,
  panes,
  primarySessionId,
  extraPanes,
  onOpenPrimary,
  onAddPane,
  onRemovePane,
}: SessionSidebarProps) {
  const sessions = useSessionStore((s) => s.byHost[hostId] ?? EMPTY_SESSIONS)
  const loadForHost = useSessionStore((s) => s.loadForHost)
  const watch = useSessionLiveStore((s) => s.watch)
  const unwatch = useSessionLiveStore((s) => s.unwatch)

  const [prefs, setPrefs] = useState<Record<string, SessionPreferences>>({})
  const [query, setQuery] = useState('')

  useEffect(() => {
    loadForHost(hostId)
    sessionPreferencesRepository.getByHost(hostId).then((rows) => {
      const byId: Record<string, SessionPreferences> = {}
      for (const p of rows) byId[p.sessionId] = p
      setPrefs(byId)
    })
  }, [hostId, loadForHost])

  const paneSet = useMemo(() => new Set(panes), [panes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sessions
      .filter((s) => {
        if (!q) return true
        const alias = prefs[s.id]?.alias?.toLowerCase() ?? ''
        const cwd = sessionCwd(s)?.toLowerCase() ?? ''
        return (
          alias.includes(q) ||
          s.id.toLowerCase().includes(q) ||
          cwd.includes(q) ||
          s.agent.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (b.destroyedAt ?? b.createdAt) - (a.destroyedAt ?? a.createdAt))
  }, [sessions, query, prefs])

  // Subscribe to live status for every visible session in the sidebar so
  // dots / waiting indicators update without opening each chat.
  useEffect(() => {
    const watching = filtered.filter((s) => !s.destroyedAt).map((s) => s.id)
    for (const id of watching) watch(hostId, id)
    return () => {
      for (const id of watching) unwatch(hostId, id)
    }
  }, [filtered, hostId, watch, unwatch])

  return (
    <aside className="flex h-full w-full flex-col gap-2 border-r border-border bg-muted/30 p-2 sm:w-64">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter sessions…"
        className="h-8"
      />
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="p-2 text-xs text-muted-foreground">No sessions.</li>
        ) : (
          filtered.map((record) => (
            <SidebarRow
              key={record.id}
              record={record}
              alias={prefs[record.id]?.alias}
              inView={paneSet.has(record.id)}
              isPrimary={record.id === primarySessionId}
              canAdd={!paneSet.has(record.id) && panes.length < 3}
              canRemove={paneSet.has(record.id) && (record.id !== primarySessionId || extraPanes.length > 0)}
              onOpen={() => onOpenPrimary(record.id)}
              onAdd={() => onAddPane(record.id)}
              onRemove={() => onRemovePane(record.id)}
            />
          ))
        )}
      </ul>
    </aside>
  )
}

interface SidebarRowProps {
  record: SessionRecord
  alias?: string
  inView: boolean
  isPrimary: boolean
  canAdd: boolean
  canRemove: boolean
  onOpen(): void
  onAdd(): void
  onRemove(): void
}

function SidebarRow({
  record,
  alias,
  inView,
  isPrimary,
  canAdd,
  canRemove,
  onOpen,
  onAdd,
  onRemove,
}: SidebarRowProps) {
  const running = isSessionRunning(record)
  const mode = sessionMode(record)
  const live = useLiveStatus(record.id)
  const name = sessionDisplayName(
    record,
    alias ? { sessionId: record.id, hostId: 0, alias } : undefined,
  )

  return (
    <li>
      <div
        className={
          'group flex items-center gap-1 rounded-md p-1.5 text-sm transition-colors ' +
          (isPrimary
            ? 'bg-primary/10 text-foreground'
            : inView
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')
        }
      >
        <StatusDot running={running} streaming={!!live?.streaming} />
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col items-start text-left"
          onClick={onOpen}
          title={alias ? alias : record.id}
        >
          <span className="truncate text-xs font-medium">
            {alias ? name : <span className="font-mono">{record.id.slice(0, 12)}…</span>}
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{record.agent}</span>
            {mode && (
              <span className="text-[10px] text-muted-foreground">· {mode}</span>
            )}
            {live?.pendingPermission && (
              <Badge
                variant="outline"
                className="h-4 border-amber-500/50 px-1 text-[9px] text-amber-600 dark:text-amber-400"
              >
                ?
              </Badge>
            )}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
          {canAdd && (
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              onClick={onAdd}
              title="Add to view"
              aria-label="Add to view"
            >
              <Plus className="size-3.5" />
            </Button>
          )}
          {canRemove && (
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              onClick={onRemove}
              title="Remove from view"
              aria-label="Remove from view"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

function StatusDot({ running, streaming }: { running: boolean; streaming: boolean }) {
  const color = streaming
    ? 'animate-pulse bg-sky-500'
    : running
      ? 'bg-emerald-500'
      : 'bg-muted-foreground/40'
  return <span className={`inline-block size-2 shrink-0 rounded-full ${color}`} />
}
