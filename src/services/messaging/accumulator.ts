import type { ContentBlock, EventEnvelope } from '@/services/wagent'
import type { Message, MessagePart } from '@/types'

interface AccumulatorState {
  messages: Message[]
  lastAgentMessageId: string | undefined
  // toolCallId → coordinates so tool_call_update can mutate the right part.
  toolCallIndex: Map<string, { messageIndex: number; partIndex: number }>
}

export class MessageAccumulator {
  private state: AccumulatorState = {
    messages: [],
    lastAgentMessageId: undefined,
    toolCallIndex: new Map(),
  }

  get messages(): Message[] {
    return this.state.messages
  }

  reset(): void {
    this.state = {
      messages: [],
      lastAgentMessageId: undefined,
      toolCallIndex: new Map(),
    }
  }

  push(event: EventEnvelope): void {
    const payload = event.payload
    switch (payload.kind) {
      case 'user_message_chunk':
        this.startUserMessage(event, payload as UserMessagePayload)
        break
      case 'agent_message_chunk':
        this.appendAgentChunk(event, payload as AgentChunkPayload, 'text')
        break
      case 'agent_thought_chunk':
        this.appendAgentChunk(event, payload as AgentChunkPayload, 'thought')
        break
      case 'tool_call':
        this.startToolCall(event, payload as ToolCallPayload)
        break
      case 'tool_call_update':
        this.updateToolCall(payload as ToolCallUpdatePayload)
        break
      case 'stop':
        this.markStreamingDone()
        break
      // plan / permission_request / permission_resolved / subprocess_died /
      // session_destroyed are surfaced by stores directly, not in messages.
      default:
        break
    }
  }

  private startUserMessage(event: EventEnvelope, payload: UserMessagePayload): void {
    const last = this.state.messages[this.state.messages.length - 1]
    if (last) last.isStreaming = false

    const id = `u:${event.eventIndex}`
    const parts: MessagePart[] = []
    const content = Array.isArray(payload.content) ? payload.content : []
    for (let i = 0; i < content.length; i++) {
      const block = content[i]
      if (!block) continue
      if (block.type === 'image' && block.data && block.mimeType) {
        parts.push({
          kind: 'image',
          id: `${id}:img:${i}`,
          content: '',
          dataUrl: `data:${block.mimeType};base64,${block.data}`,
          mimeType: block.mimeType,
        })
      } else if (block.type === 'text' && typeof block.text === 'string') {
        parts.push({ kind: 'text', id: `${id}:${parts.length}`, content: block.text })
      }
    }

    this.state.messages.push({
      id,
      role: 'user',
      parts,
      isStreaming: false,
      createdAt: event.createdAt,
    })
    this.state.lastAgentMessageId = undefined
  }

  private appendAgentChunk(
    event: EventEnvelope,
    payload: AgentChunkPayload,
    partKind: 'text' | 'thought',
  ): void {
    const messageId = payload.messageId ?? undefined
    const target = this.resolveOrCreateAssistant(event, messageId)

    const text = typeof payload.text === 'string' ? payload.text : ''
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

  private startToolCall(event: EventEnvelope, payload: ToolCallPayload): void {
    const toolCallId = payload.toolCallId
    if (!toolCallId) return

    const target = this.resolveOrCreateAssistant(event)
    const part: MessagePart = {
      kind: 'tool_call',
      id: toolCallId,
      content: '',
      toolName: payload.title ?? payload.name ?? 'tool',
      toolStatus: mapStatus(payload.status) ?? 'pending',
    }
    target.parts.push(part)
    this.state.toolCallIndex.set(toolCallId, {
      messageIndex: this.state.messages.length - 1,
      partIndex: target.parts.length - 1,
    })
  }

  private updateToolCall(payload: ToolCallUpdatePayload): void {
    const toolCallId = payload.toolCallId
    if (!toolCallId) return
    const coords = this.state.toolCallIndex.get(toolCallId)
    if (!coords) return
    const part = this.state.messages[coords.messageIndex]?.parts[coords.partIndex]
    if (!part || part.kind !== 'tool_call') return

    if (payload.status) part.toolStatus = mapStatus(payload.status) ?? part.toolStatus
    if (payload.title) part.toolName = payload.title
  }

  private markStreamingDone(): void {
    const last = this.state.messages[this.state.messages.length - 1]
    if (last) last.isStreaming = false
  }

  private resolveOrCreateAssistant(event: EventEnvelope, messageId?: string): Message {
    const last = this.state.messages[this.state.messages.length - 1]
    const sameLogicalMessage =
      last &&
      last.role === 'assistant' &&
      (messageId === undefined || messageId === this.state.lastAgentMessageId)

    if (sameLogicalMessage) {
      if (messageId) this.state.lastAgentMessageId = messageId
      return last
    }

    if (last) last.isStreaming = false
    const created: Message = {
      id: messageId ?? `a:${event.eventIndex}`,
      role: 'assistant',
      parts: [],
      isStreaming: true,
      createdAt: event.createdAt,
    }
    this.state.messages.push(created)
    if (messageId) this.state.lastAgentMessageId = messageId
    return created
  }
}

interface UserMessagePayload {
  kind: 'user_message_chunk'
  messageId?: string
  content?: ContentBlock[]
}

interface AgentChunkPayload {
  kind: 'agent_message_chunk' | 'agent_thought_chunk'
  messageId?: string
  text?: string
}

interface ToolCallPayload {
  kind: 'tool_call'
  toolCallId?: string
  title?: string
  name?: string
  status?: string
}

interface ToolCallUpdatePayload {
  kind: 'tool_call_update'
  toolCallId?: string
  status?: string
  title?: string
}

function mapStatus(status: string | undefined): MessagePart['toolStatus'] | undefined {
  if (!status) return undefined
  switch (status) {
    case 'pending':
      return 'pending'
    case 'in_progress':
    case 'running':
      return 'running'
    case 'completed':
    case 'complete':
    case 'success':
      return 'complete'
    case 'failed':
    case 'error':
      return 'error'
    default:
      return undefined
  }
}
