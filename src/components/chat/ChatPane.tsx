import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { MoreHorizontal, X } from 'lucide-react'
import { ChatInput } from '@/components/chat/ChatInput'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { PermissionBanner } from '@/components/chat/PermissionBanner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useChatStore, useHostStore, useSessionStore, useVisibilityStore } from '@/stores'

interface ChatPaneProps {
  hostId: number
  sessionId: string
  // When this pane is secondary/extra (multi-pane), show a close button.
  onClose?: () => void
  // When user deletes the session, caller decides where to navigate.
  onAfterDelete?: () => void
  // Whether this pane is the active one for visibility tracking.
  isActive?: boolean
}

export function ChatPane({
  hostId,
  sessionId,
  onClose,
  onAfterDelete,
  isActive = true,
}: ChatPaneProps) {
  const host = useHostStore((s) => s.hosts.find((h) => h.id === hostId))
  const openSession = useChatStore((s) => s.openSession)
  const pane = useChatStore((s) => s.byId[sessionId])
  const destroySession = useSessionStore((s) => s.destroySession)
  const session = useSessionStore((s) => s.byHost[hostId]?.find((row) => row.id === sessionId))
  const alias = session?.alias ?? undefined
  const setActiveSession = useVisibilityStore((s) => s.setActiveSession)

  const [draft, setDraft] = useState('')
  const scrollAnchorRef = useRef<HTMLDivElement>(null)

  const status = pane?.status ?? 'idle'
  const error = pane?.error ?? null
  const messages = pane?.messages
  const pendingPermission = pane?.pendingPermission ?? null
  const isStreaming = pane?.isStreaming ?? false

  useEffect(() => {
    openSession(hostId, sessionId)
    // Intentionally NO unmount cleanup: detaching here would tear down the
    // SSE subscription + accumulator on every remount (StrictMode double-
    // mount, narrow/wide layout swap, nav away + back), and Rivet's
    // `resumeSession` re-fires `session/new` each time (SDK limitation #6).
    // That turned into a reconnect storm that re-primed the agent with the
    // replay-prefix prompt 5+ times for one session and scrambled context.
    // Attachments are now app-scoped: they live in useChatStore until the
    // session is explicitly destroyed (sessionStore.destroySession calls
    // closeSession).
  }, [hostId, sessionId, openSession])

  useEffect(() => {
    if (!isActive) return
    setActiveSession(hostId, sessionId)
  }, [isActive, hostId, sessionId, setActiveSession])

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages?.length, isStreaming])

  async function handleDelete() {
    if (!confirm('Delete this session? This cannot be undone.')) return
    try {
      await destroySession(hostId, sessionId)
      toast.success('Session deleted')
      onAfterDelete?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  if (!host) {
    return (
      <div className="flex flex-1 flex-col items-start gap-4 p-6">
        <p className="text-sm text-muted-foreground">Host not found.</p>
        <Button asChild size="sm" variant="outline">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border last:border-r-0">
      <header className="z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-background/95 px-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">
            {alias || <span className="font-mono">{sessionId.slice(0, 8)}…</span>}
          </span>
          <ConnectionIndicator status={status} streaming={isStreaming} />
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Session menu">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleDelete}>Delete session</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {onClose && (
            <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close pane">
              <X className="size-4" />
            </Button>
          )}
        </div>
      </header>

      {error && (
        <div className="border-b border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-4 p-3">
          {status === 'connecting' && (!messages || messages.length === 0) && (
            <p className="text-sm text-muted-foreground">Connecting to session…</p>
          )}
          {messages?.map((message) => <MessageBubble key={message.id} message={message} />)}
          <div ref={scrollAnchorRef} />
        </div>
      </div>

      {pendingPermission && <PermissionBanner sessionId={sessionId} request={pendingPermission} />}

      <ChatInput
        sessionId={sessionId}
        value={draft}
        onChange={setDraft}
        disabled={status !== 'connected'}
      />
    </div>
  )
}

function ConnectionIndicator({
  status,
  streaming,
}: {
  status: 'idle' | 'connecting' | 'connected' | 'error'
  streaming: boolean
}) {
  if (streaming) return <span className="text-xs text-primary">streaming…</span>
  if (status === 'connecting') return <span className="text-xs text-muted-foreground">connecting…</span>
  if (status === 'error') return <span className="text-xs text-destructive">error</span>
  if (status === 'connected') return <span className="text-xs text-muted-foreground">ready</span>
  return null
}
