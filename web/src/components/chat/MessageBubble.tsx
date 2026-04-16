import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Message, MessagePart } from '@/types'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  return (
    <article
      className={
        'flex flex-col gap-1 ' + (isUser ? 'items-end' : 'items-start')
      }
    >
      <header className="text-xs text-muted-foreground">
        {isUser ? 'You' : (message.agent ?? 'Agent')}
      </header>
      <div
        className={
          'max-w-[85%] rounded-2xl border px-4 py-2 text-sm ' +
          (isUser
            ? 'border-primary/20 bg-primary/10'
            : 'border-border bg-card')
        }
      >
        <div className="flex flex-col gap-2">
          {message.parts.map((part) => (
            <MessagePartView key={part.id} part={part} />
          ))}
        </div>
      </div>
    </article>
  )
}

function MessagePartView({ part }: { part: MessagePart }) {
  if (part.kind === 'text') {
    return <TextPart content={part.content} />
  }
  if (part.kind === 'thought') {
    return <ThoughtPart content={part.content} />
  }
  return <ToolCallPart part={part} />
}

function TextPart({ content }: { content: string }) {
  return <p className="whitespace-pre-wrap break-words">{content}</p>
}

function ThoughtPart({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <details
      className="rounded border border-dashed border-border/50 bg-muted/30 px-2 py-1"
      open={expanded}
      onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
        {expanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <span className="italic">thinking</span>
      </summary>
      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
        {content}
      </p>
    </details>
  )
}

function ToolCallPart({ part }: { part: MessagePart }) {
  const statusColor =
    part.toolStatus === 'error'
      ? 'border-destructive/40 text-destructive'
      : part.toolStatus === 'complete'
        ? 'border-primary/30 text-primary'
        : 'border-border text-muted-foreground'

  return (
    <div className={`rounded border ${statusColor} px-2 py-1 font-mono text-xs`}>
      <div className="flex items-center gap-2">
        {part.toolStatus === 'running' && (
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
        )}
        <span>{part.toolName ?? 'tool'}</span>
        <span className="text-[10px] opacity-70">· {part.toolStatus}</span>
      </div>
    </div>
  )
}
