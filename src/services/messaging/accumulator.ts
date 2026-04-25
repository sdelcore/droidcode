import type { SessionEvent } from 'sandbox-agent'
import type { Message, MessagePart } from '@/types'

type SessionUpdatePayload = {
  sessionUpdate: string
  content?: {
    type: string
    text?: string
  }
  messageId?: string | null
  toolCallId?: string
  title?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | string
  kind?: string
  content_?: unknown
  // tool_call rich content omitted in v1; see Phase 5
}

interface AccumulatorState {
  messages: Message[]
  // Last seen ContentChunk messageId, per role, so we know when a new message starts.
  lastMessageIdByRole: Partial<Record<'user' | 'assistant', string>>
  // Tool-call part index: toolCallId → { messageIndex, partIndex }
  toolCallIndex: Map<string, { messageIndex: number; partIndex: number }>
}

export class MessageAccumulator {
  private state: AccumulatorState = {
    messages: [],
    lastMessageIdByRole: {},
    toolCallIndex: new Map(),
  }

  get messages(): Message[] {
    return this.state.messages
  }

  reset(): void {
    this.state = {
      messages: [],
      lastMessageIdByRole: {},
      toolCallIndex: new Map(),
    }
  }

  // Append a user message from a client session/prompt event, creating a
  // turn boundary so the agent's reply opens a fresh assistant bubble.
  pushUserMessage(
    prompt: ExtractedPrompt,
    event?: SessionEvent,
  ): void {
    const last = this.state.messages[this.state.messages.length - 1]
    if (last) last.isStreaming = false
    const id = event ? `u:${event.id}` : `u:${Date.now()}:${this.state.messages.length}`

    const parts: MessagePart[] = []
    for (let i = 0; i < prompt.images.length; i++) {
      const img = prompt.images[i]
      parts.push({
        kind: 'image',
        id: `${id}:img:${i}`,
        content: '',
        dataUrl: `data:${img.mimeType};base64,${img.data}`,
        mimeType: img.mimeType,
      })
    }
    if (prompt.text) {
      parts.push({ kind: 'text', id: `${id}:${parts.length}`, content: prompt.text })
    }

    this.state.messages.push({
      id,
      role: 'user',
      parts,
      isStreaming: false,
      createdAt: event?.createdAt ?? Date.now(),
    })
    this.state.lastMessageIdByRole.assistant = undefined
  }

  push(event: SessionEvent): void {
    // Rivet doesn't emit user_message_chunk for the client's own prompts,
    // so synthesize a user message from the session/prompt request.
    const prompt = extractClientPrompt(event)
    if (prompt !== undefined) {
      this.pushUserMessage(prompt, event)
      return
    }

    const update = extractSessionUpdate(event)
    if (!update) return

    switch (update.sessionUpdate) {
      case 'user_message_chunk':
        this.appendChunk('user', event, update)
        break
      case 'agent_message_chunk':
        this.appendChunk('assistant', event, update, 'text')
        break
      case 'agent_thought_chunk':
        this.appendChunk('assistant', event, update, 'thought')
        break
      case 'tool_call':
        this.startToolCall(event, update)
        break
      case 'tool_call_update':
        this.updateToolCall(update)
        break
      // Other updates (plan, usage_update, mode/config updates) are not
      // rendered in the accumulator; stores consume them directly.
      default:
        break
    }
  }

  private appendChunk(
    role: 'user' | 'assistant',
    event: SessionEvent,
    update: SessionUpdatePayload,
    partKind: 'text' | 'thought' = 'text',
  ): void {
    const text = update.content?.type === 'text' ? (update.content.text ?? '') : ''
    const messageId = update.messageId ?? undefined
    const target = this.resolveOrCreateMessage(role, event, messageId)

    const lastPart = target.parts[target.parts.length - 1]
    if (lastPart && lastPart.kind === partKind) {
      lastPart.content += text
    } else {
      target.parts.push({
        kind: partKind,
        id: `${target.id}:${target.parts.length}`,
        content: text,
      })
    }
  }

  private startToolCall(event: SessionEvent, update: SessionUpdatePayload): void {
    const toolCallId = update.toolCallId
    if (!toolCallId) return

    const target = this.resolveOrCreateMessage('assistant', event)
    const part: MessagePart = {
      kind: 'tool_call',
      id: toolCallId,
      content: '',
      toolName: update.title ?? update.kind ?? 'tool',
      toolStatus: mapStatus(update.status) ?? 'pending',
    }
    target.parts.push(part)
    this.state.toolCallIndex.set(toolCallId, {
      messageIndex: this.state.messages.length - 1,
      partIndex: target.parts.length - 1,
    })
  }

  private updateToolCall(update: SessionUpdatePayload): void {
    const toolCallId = update.toolCallId
    if (!toolCallId) return
    const coords = this.state.toolCallIndex.get(toolCallId)
    if (!coords) return

    const part = this.state.messages[coords.messageIndex]?.parts[coords.partIndex]
    if (!part || part.kind !== 'tool_call') return

    if (update.status) {
      part.toolStatus = mapStatus(update.status) ?? part.toolStatus
    }
    if (update.title) {
      part.toolName = update.title
    }
  }

  private resolveOrCreateMessage(
    role: 'user' | 'assistant',
    event: SessionEvent,
    messageId?: string,
  ): Message {
    const last = this.state.messages[this.state.messages.length - 1]
    const lastMessageIdForRole = this.state.lastMessageIdByRole[role]

    const shouldReuse =
      last &&
      last.role === role &&
      (messageId === undefined || messageId === lastMessageIdForRole)

    if (shouldReuse) {
      if (messageId) this.state.lastMessageIdByRole[role] = messageId
      return last
    }

    // Mark the previous message as no longer streaming.
    if (last) last.isStreaming = false

    const created: Message = {
      id: messageId ?? `${event.sessionId}:${event.eventIndex}`,
      role,
      parts: [],
      isStreaming: true,
      createdAt: event.createdAt,
    }
    this.state.messages.push(created)
    if (messageId) this.state.lastMessageIdByRole[role] = messageId
    return created
  }
}

function extractSessionUpdate(event: SessionEvent): SessionUpdatePayload | undefined {
  const payload = event.payload as { method?: string; params?: unknown } | null
  if (!payload || typeof payload !== 'object') return undefined
  if (payload.method !== 'session/update') return undefined
  const params = payload.params as { update?: SessionUpdatePayload } | undefined
  return params?.update
}

interface ExtractedPrompt {
  text: string
  images: Array<{ data: string; mimeType: string }>
}

// When the SDK resumes a session with stored events, the next session/prompt
// it sends is prefixed with a synthetic text part starting with this string;
// Rivet uses it to re-prime the agent's context. Show only the real user text.
const REPLAY_PREFIX = 'Previous session history is replayed below'

// Return the content of a client-sent `session/prompt` request, or
// undefined if the event isn't one. Extracts both text and image blocks.
function extractClientPrompt(event: SessionEvent): ExtractedPrompt | undefined {
  if (event.sender !== 'client') return undefined
  const payload = event.payload as { method?: string; params?: unknown } | null
  if (!payload || typeof payload !== 'object') return undefined
  if (payload.method !== 'session/prompt') return undefined
  const params = payload.params as {
    prompt?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
  } | undefined
  const prompt = params?.prompt
  if (!Array.isArray(prompt)) return undefined

  const text = prompt
    .filter(
      (p) =>
        p.type === 'text' &&
        typeof p.text === 'string' &&
        !p.text.startsWith(REPLAY_PREFIX),
    )
    .map((p) => p.text!)
    .join('')

  const images = prompt
    .filter((p): p is { type: 'image'; data: string; mimeType: string } =>
      p.type === 'image' && typeof p.data === 'string' && typeof p.mimeType === 'string',
    )
    .map((p) => ({ data: p.data, mimeType: p.mimeType }))

  // A prompt that was *only* a replay prefix (no real user text or images)
  // is an SDK internal signal; don't render it as an empty user bubble.
  if (!text && images.length === 0) return undefined

  return { text, images }
}

function mapStatus(
  status: string | undefined,
): MessagePart['toolStatus'] | undefined {
  if (!status) return undefined
  switch (status) {
    case 'pending':
      return 'pending'
    case 'in_progress':
    case 'running':
      return 'running'
    case 'completed':
    case 'success':
      return 'complete'
    case 'failed':
    case 'error':
      return 'error'
    default:
      return undefined
  }
}
