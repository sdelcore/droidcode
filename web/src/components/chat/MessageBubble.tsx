import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Markdown } from './Markdown'
import type { Message, MessagePart } from '@/types'

interface MessageBubbleProps {
  message: Message
}

type PartGroup =
  | { kind: 'single'; part: MessagePart }
  | { kind: 'tool_group'; parts: MessagePart[] }

function groupParts(parts: MessagePart[]): PartGroup[] {
  const groups: PartGroup[] = []
  let toolRun: MessagePart[] = []

  const flushTools = () => {
    if (toolRun.length > 0) {
      groups.push({ kind: 'tool_group', parts: toolRun })
      toolRun = []
    }
  }

  for (const part of parts) {
    if (part.kind === 'tool_call') {
      toolRun.push(part)
    } else {
      flushTools()
      groups.push({ kind: 'single', part })
    }
  }
  flushTools()
  return groups
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const groups = useMemo(() => groupParts(message.parts), [message.parts])

  if (isUser) {
    return (
      <article className="flex flex-col items-end gap-1">
        <header className="text-xs text-muted-foreground">You</header>
        <div className="max-w-[90%] rounded-xl bg-primary/10 px-4 py-2.5 text-sm">
          <div className="flex flex-col gap-2">
            {groups.map((group) =>
              group.kind === 'single' ? (
                <MessagePartView key={group.part.id} part={group.part} />
              ) : null,
            )}
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="flex flex-col gap-1">
      <header className="text-xs text-muted-foreground">
        {message.agent ?? 'Agent'}
      </header>
      <div className="flex flex-col gap-2 text-sm">
        {groups.map((group) =>
          group.kind === 'single' ? (
            <MessagePartView key={group.part.id} part={group.part} />
          ) : (
            <ToolCallGroup key={group.parts[0].id} parts={group.parts} />
          ),
        )}
      </div>
    </article>
  )
}

function MessagePartView({ part }: { part: MessagePart }) {
  if (part.kind === 'image') {
    return <ImagePart dataUrl={part.dataUrl!} />
  }
  if (part.kind === 'text') {
    return <TextPart content={part.content} />
  }
  if (part.kind === 'thought') {
    return <ThoughtPart content={part.content} />
  }
  return null
}

function ImagePart({ dataUrl }: { dataUrl: string }) {
  return (
    <img
      src={dataUrl}
      alt="Attached image"
      className="max-h-64 max-w-full rounded-md"
    />
  )
}

function TextPart({ content }: { content: string }) {
  return <Markdown content={content} />
}

function ThoughtPart({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <details
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

function buildToolSummary(parts: MessagePart[]): string {
  const counts = new Map<string, number>()
  for (const p of parts) {
    const name = p.toolName ?? 'tool'
    // Normalize long titles (e.g. "cd /foo/bar && npm run build") to the tool kind
    // by taking just the first word if it looks like a shell command
    const label = name.length > 30 ? 'Terminal' : name
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const segments: string[] = []
  for (const [name, count] of counts) {
    segments.push(count > 1 ? `${name} x${count}` : name)
  }
  return segments.join(', ')
}

function ToolCallGroup({ parts }: { parts: MessagePart[] }) {
  const [expanded, setExpanded] = useState(false)
  const running = parts.filter((p) => p.toolStatus === 'running' || p.toolStatus === 'pending')
  const errors = parts.filter((p) => p.toolStatus === 'error')
  const allDone = running.length === 0

  const summary = buildToolSummary(parts)
  const suffix = errors.length > 0
    ? ` (${errors.length} failed)`
    : !allDone
      ? ''
      : ''

  return (
    <details
      open={expanded}
      onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
        {!allDone && (
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        )}
        <span>{summary}{suffix}</span>
        {expanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
      </summary>
      <div className="mt-1 flex flex-col gap-0.5 border-l border-border/50 pl-3">
        {parts.map((part) => (
          <ToolCallRow key={part.id} part={part} />
        ))}
      </div>
    </details>
  )
}

function ToolCallRow({ part }: { part: MessagePart }) {
  const statusColor =
    part.toolStatus === 'error'
      ? 'text-destructive'
      : part.toolStatus === 'complete'
        ? 'text-muted-foreground'
        : 'text-primary'

  return (
    <div className={`flex items-center gap-2 font-mono text-[11px] ${statusColor}`}>
      {part.toolStatus === 'running' && (
        <span className="size-1 animate-pulse rounded-full bg-current" />
      )}
      <span className="truncate">{part.toolName ?? 'tool'}</span>
      <span className="shrink-0 text-[10px] opacity-50">· {part.toolStatus}</span>
    </div>
  )
}
