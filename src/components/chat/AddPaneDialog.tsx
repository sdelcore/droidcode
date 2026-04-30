import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@/services/wagent'
import { useSessionStore } from '@/stores'
import {
  isSessionRunning,
  sessionCwd,
  sessionDisplayName,
  sessionMode,
} from '@/services/sessions/sessionFields'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface AddPaneDialogProps {
  hostId: number
  excludeSessionIds: string[]
  open: boolean
  onOpenChange(open: boolean): void
  onSelect(sessionId: string): void
}

const EMPTY_SESSIONS: Session[] = []

export function AddPaneDialog({
  hostId,
  excludeSessionIds,
  open,
  onOpenChange,
  onSelect,
}: AddPaneDialogProps) {
  const sessions = useSessionStore((s) => s.byHost[hostId] ?? EMPTY_SESSIONS)
  const loadForHost = useSessionStore((s) => s.loadForHost)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    loadForHost(hostId)
  }, [open, hostId, loadForHost])

  const excluded = useMemo(() => new Set(excludeSessionIds), [excludeSessionIds])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sessions
      .filter((s) => !excluded.has(s.id))
      .filter((s) => {
        if (!q) return true
        const alias = s.alias?.toLowerCase() ?? ''
        const cwd = sessionCwd(s)?.toLowerCase() ?? ''
        return (
          alias.includes(q) ||
          s.id.toLowerCase().includes(q) ||
          cwd.includes(q) ||
          s.agent.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (b.destroyedAt ?? b.createdAt) - (a.destroyedAt ?? a.createdAt))
      .slice(0, 50)
  }, [sessions, excluded, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add pane</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            placeholder="Search by name, id, cwd, or agent…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {candidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {sessions.length === 0
                ? 'No sessions on this host yet.'
                : 'No sessions match — all of them may already be open.'}
            </p>
          ) : (
            <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
              {candidates.map((s) => (
                <SessionRow
                  key={s.id}
                  record={s}
                  alias={s.alias ?? undefined}
                  onClick={() => {
                    onSelect(s.id)
                    onOpenChange(false)
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SessionRow({
  record,
  alias,
  onClick,
}: {
  record: Session
  alias?: string
  onClick: () => void
}) {
  const running = isSessionRunning(record)
  const mode = sessionMode(record)
  const cwd = sessionCwd(record)
  const name = sessionDisplayName(
    record,
    alias ? { sessionId: record.id, hostId: 0, alias } : undefined,
  )

  return (
    <li>
      <Button
        type="button"
        variant="ghost"
        className="h-auto w-full justify-start px-2 py-2"
        onClick={onClick}
      >
        <div className="flex w-full min-w-0 flex-col items-start gap-1">
          <div className="flex w-full items-center gap-2">
            <span className="truncate text-sm font-medium">
              {alias ? name : <span className="font-mono">{record.id.slice(0, 12)}…</span>}
            </span>
            <Badge variant="outline" className="shrink-0 font-normal">
              {record.agent}
            </Badge>
            {mode && (
              <Badge variant="secondary" className="shrink-0 font-normal">
                {mode}
              </Badge>
            )}
            <Badge variant={running ? 'default' : 'outline'} className="shrink-0 font-normal">
              {running ? 'running' : 'completed'}
            </Badge>
          </div>
          {cwd && (
            <span className="truncate font-mono text-[11px] text-muted-foreground">{cwd}</span>
          )}
        </div>
      </Button>
    </li>
  )
}
