import { useEffect, useRef, useState } from 'react'
import {
  Link,
  createFileRoute,
  useNavigate,
  useParams,
} from '@tanstack/react-router'
import { toast } from 'sonner'
import { MoreHorizontal } from 'lucide-react'
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
import { sessionPreferencesRepository } from '@/services/db'
import { useChatStore, useHostStore, useSessionStore, useVisibilityStore } from '@/stores'

export const Route = createFileRoute('/chat/$hostId/$sessionId')({
  component: ChatScreen,
})

function ChatScreen() {
  const { hostId, sessionId } = useParams({ from: '/chat/$hostId/$sessionId' })
  const numericHostId = Number(hostId)
  const navigate = useNavigate()

  const host = useHostStore((s) => s.hosts.find((h) => h.id === numericHostId))
  const openSession = useChatStore((s) => s.openSession)
  const closeSession = useChatStore((s) => s.closeSession)
  const destroySession = useSessionStore((s) => s.destroySession)
  const status = useChatStore((s) => s.status)
  const error = useChatStore((s) => s.error)
  const messages = useChatStore((s) => s.messages)
  const pendingPermission = useChatStore((s) => s.pendingPermission)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const setActiveSession = useVisibilityStore((s) => s.setActiveSession)
  const clearActiveSession = useVisibilityStore((s) => s.clearActiveSession)

  const [draft, setDraft] = useState('')
  const [alias, setAlias] = useState<string | undefined>(undefined)
  const scrollAnchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    openSession(numericHostId, sessionId)
    setActiveSession(numericHostId, sessionId)
    return () => {
      closeSession()
      clearActiveSession()
    }
  }, [numericHostId, sessionId, openSession, closeSession, setActiveSession, clearActiveSession])

  useEffect(() => {
    let cancelled = false
    sessionPreferencesRepository.get(sessionId).then((prefs) => {
      if (!cancelled) setAlias(prefs?.alias)
    })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, isStreaming])

  async function handleDelete() {
    if (!confirm('Delete this session? This cannot be undone.')) return
    try {
      await destroySession(numericHostId, sessionId)
      toast.success('Session deleted')
      navigate({ to: '/hosts' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    }
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
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="shrink-0 text-sm font-semibold">
            DroidCode
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <Link to="/hosts" className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
            {host.name}
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="truncate text-sm font-medium">
            {alias || <span className="font-mono">{sessionId.slice(0, 8)}…</span>}
          </span>
          <ConnectionIndicator status={status} streaming={isStreaming} />
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/hosts" className="hover:text-foreground">Hosts</Link>
            <Link to="/settings" className="hover:text-foreground">Settings</Link>
          </nav>
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
        </div>
      </header>

      {error && (
        <div className="border-b border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
          {status === 'connecting' && messages.length === 0 && (
            <p className="text-sm text-muted-foreground">Connecting to session…</p>
          )}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={scrollAnchorRef} />
        </div>
      </div>

      {pendingPermission && <PermissionBanner request={pendingPermission} />}

      <ChatInput
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
