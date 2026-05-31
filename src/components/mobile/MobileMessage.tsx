import { useMemo, useState } from 'react'
import { Markdown } from '@/components/chat/Markdown'
import { agentName } from '@/services/identity'
import type { Message, MessagePart } from '@/types'

interface MobileMessageProps {
  message: Message
}

type PartGroup =
  | { kind: 'single'; part: MessagePart }
  | { kind: 'tool_group'; parts: MessagePart[] }

function groupParts(parts: MessagePart[]): PartGroup[] {
  const groups: PartGroup[] = []
  let toolRun: MessagePart[] = []
  const flush = () => {
    if (toolRun.length > 0) {
      groups.push({ kind: 'tool_group', parts: toolRun })
      toolRun = []
    }
  }
  for (const part of parts) {
    if (part.kind === 'tool_call') {
      toolRun.push(part)
    } else {
      flush()
      groups.push({ kind: 'single', part })
    }
  }
  flush()
  return groups
}

export function MobileMessage({ message }: MobileMessageProps) {
  const groups = useMemo(() => groupParts(message.parts), [message.parts])
  const isUser = message.role === 'user'
  const who = isUser ? 'You' : agentName(message.agent as 'claude' | 'pi' | 'echo' | undefined)
  const stamp = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <article className={'m-msg' + (isUser ? ' user' : '')}>
      <header className="who">
        <span className="name">{who}</span>
        <span className="stamp">{stamp}</span>
        {message.isStreaming && <span className="live" />}
      </header>
      <div className="body">
        {groups.map((g) =>
          g.kind === 'single' ? (
            <PartView key={g.part.id} part={g.part} />
          ) : (
            <ToolGroupView key={g.parts[0].id} parts={g.parts} />
          ),
        )}
      </div>
    </article>
  )
}

function PartView({ part }: { part: MessagePart }) {
  if (part.kind === 'image' && part.dataUrl) {
    return (
      <img
        src={part.dataUrl}
        alt="Attached image"
        style={{ maxWidth: '100%', maxHeight: 256, borderRadius: 8, marginTop: 6 }}
      />
    )
  }
  if (part.kind === 'text') {
    return (
      <div style={{ marginTop: 4 }}>
        <Markdown content={part.content} />
      </div>
    )
  }
  if (part.kind === 'thought') {
    return (
      <div className="thought">
        <span className="thought-label">thinking</span>
        {part.content}
      </div>
    )
  }
  return null
}

function ToolGroupView({ parts }: { parts: MessagePart[] }) {
  const [open, setOpen] = useState(true)
  const running = parts.filter(
    (p) => p.toolStatus === 'running' || p.toolStatus === 'pending',
  ).length
  const errors = parts.filter((p) => p.toolStatus === 'error').length
  const summary = useMemo(() => buildSummary(parts), [parts])
  const count =
    running > 0 ? `${running} running` : errors > 0 ? `${errors} failed` : `${parts.length} done`

  return (
    <details
      className="m-tool"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        <span className="chev">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
        {running > 0 && <span className="live" />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary}
        </span>
        <span className="count">{count}</span>
      </summary>
      <div className="rows">
        {parts.map((p) => (
          <div key={p.id} className="row" data-s={statusAttr(p.toolStatus)}>
            <span className="ic">
              <ToolIcon name={p.toolName} />
            </span>
            <span className="args">{p.content || p.toolName || 'tool'}</span>
            <span className="t">{p.toolStatus ?? ''}</span>
          </div>
        ))}
      </div>
    </details>
  )
}

function statusAttr(s: MessagePart['toolStatus']): 'ok' | 'error' | 'running' {
  if (s === 'error') return 'error'
  if (s === 'running' || s === 'pending') return 'running'
  return 'ok'
}

function buildSummary(parts: MessagePart[]): string {
  const counts = new Map<string, number>()
  for (const p of parts) {
    const raw = p.toolName ?? 'tool'
    const key = raw.length > 24 ? raw.slice(0, 22) + '…' : raw
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const out: string[] = []
  for (const [k, v] of counts) out.push(v > 1 ? `${k}·${v}` : k)
  return out.join(' · ')
}

function ToolIcon({ name }: { name?: string }) {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  const lower = (name ?? '').toLowerCase()
  if (lower.includes('edit') || lower.includes('write')) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" {...stroke}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4z" />
      </svg>
    )
  }
  if (lower.includes('read')) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" {...stroke}>
        <path d="M2 4h7a3 3 0 013 3v13a2.5 2.5 0 00-2.5-2.5H2zM22 4h-7a3 3 0 00-3 3v13a2.5 2.5 0 012.5-2.5H22z" />
      </svg>
    )
  }
  if (lower.includes('bash') || lower.includes('shell') || lower.includes('terminal')) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" {...stroke}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 9l3 3-3 3M13 15h4" />
      </svg>
    )
  }
  return (
    <svg width="6" height="6" viewBox="0 0 6 6">
      <circle cx="3" cy="3" r="2" fill="currentColor" />
    </svg>
  )
}
