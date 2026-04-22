import { FilePen, Hammer, HelpCircle, MoreHorizontal, Server } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLiveStatus } from '@/stores/sessionLiveStore'
import {
  isSessionRunning,
  sessionDisplayName,
  sessionMode,
} from '@/services/sessions/sortAndFilter'
import { projectLabelFromPath, type FlatSession } from '@/services/sessions/homeFilters'

interface SessionTileProps {
  flat: FlatSession
  selectionActive: boolean
  selected: boolean
  onOpen(): void
  onAddAsPane(): void
  onToggleSelect(): void
  onRename(): void
  onDestroy(): void
}

export function SessionTile({
  flat,
  selectionActive,
  selected,
  onOpen,
  onAddAsPane,
  onToggleSelect,
  onRename,
  onDestroy,
}: SessionTileProps) {
  const { session, hostName, alias, cwd } = flat
  const running = isSessionRunning(session)
  const mode = sessionMode(session)
  const live = useLiveStatus(session.id)
  const lastActivity = live?.lastActivityAt ?? session.destroyedAt ?? session.createdAt
  const displayName = sessionDisplayName(
    session,
    alias ? { sessionId: session.id, hostId: flat.hostId, alias } : undefined,
  )
  const projectLabel = cwd ? projectLabelFromPath(cwd) : null

  return (
    <Card
      className={
        selected
          ? 'border-primary/60 ring-1 ring-primary/30 transition-shadow'
          : 'transition-shadow'
      }
    >
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {selectionActive && (
              <Checkbox
                checked={selected}
                onCheckedChange={onToggleSelect}
                aria-label="Select session"
                className="size-5"
              />
            )}
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
              <Button
                size="icon"
                variant="ghost"
                aria-label="More"
                className="-mr-2 -mt-1 size-9"
              >
                <MoreHorizontal className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onOpen}>Open chat</DropdownMenuItem>
              <DropdownMenuItem onSelect={onAddAsPane}>Open as pane</DropdownMenuItem>
              <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onToggleSelect}>
                {selected ? 'Deselect' : 'Select'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDestroy} className="text-destructive">
                Destroy
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <button
          type="button"
          className="truncate text-left text-base font-medium hover:underline"
          onClick={onOpen}
          title={displayName}
        >
          {alias ? (
            alias
          ) : (
            <span className="font-mono text-sm">{session.id.slice(0, 12)}…</span>
          )}
        </button>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="gap-1 font-normal">
            <Server className="size-3" />
            {hostName}
          </Badge>
          {projectLabel && (
            <Badge variant="secondary" className="font-normal" title={cwd ?? undefined}>
              {projectLabel}
            </Badge>
          )}
          <Badge variant="outline" className="font-normal">
            {session.agent}
          </Badge>
          {mode && (
            <Badge variant="secondary" className="font-normal">
              {mode}
            </Badge>
          )}
        </div>

        {cwd && (
          <div
            className="truncate font-mono text-[11px] text-muted-foreground"
            title={cwd}
          >
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
          <span>{formatRelative(lastActivity, session.destroyedAt)}</span>
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
    <span
      className={`inline-block size-2 rounded-full ${color}`}
      aria-label={label}
      title={label}
    />
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
