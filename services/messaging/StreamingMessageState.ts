/**
 * StreamingMessageState - Manages streaming state for a single message.
 *
 * Handles part ordering, efficient content accumulation, and conversion to DTO.
 */

import { MessageAccumulator } from './MessageAccumulator';
import type { ToolPartState } from './types';
import type { MessageDto, MessagePartDto } from '@/types';

interface StreamingPartContext {
  partId: string;
  partType: string;
  content: MessageAccumulator;
  toolState?: ToolPartState;
  sequence: number;
}

/**
 * Manages the streaming state for a single message.
 */
export class StreamingMessageState {
  private _messageId: string;
  private _sessionId: string;
  private _role: 'user' | 'assistant';
  private _agent?: string;
  private _startedAt: number;
  private parts: Map<string, StreamingPartContext> = new Map();
  private partOrder: string[] = [];
  private partSequenceCounter = 0;

  constructor(
    messageId: string,
    sessionId: string,
    role: 'user' | 'assistant',
    agent?: string
  ) {
    this._messageId = messageId;
    this._sessionId = sessionId;
    this._role = role;
    this._agent = agent;
    this._startedAt = Date.now();
  }

  /** Message ID */
  get messageId(): string {
    return this._messageId;
  }

  /** Session ID */
  get sessionId(): string {
    return this._sessionId;
  }

  /** Message role */
  get role(): 'user' | 'assistant' {
    return this._role;
  }

  /** Agent name (if assistant) */
  get agent(): string | undefined {
    return this._agent;
  }

  /** Whether the message has no parts */
  get isEmpty(): boolean {
    return this.parts.size === 0;
  }

  /** Number of parts */
  get partCount(): number {
    return this.parts.size;
  }

  /**
   * Add delta content to a part. Creates part if new.
   *
   * @param partId - Unique identifier for the part
   * @param partType - Type of part (text, thinking, tool, etc.)
   * @param content - Content to add (for text parts)
   * @param toolState - Tool state updates (for tool parts)
   */
  addDelta(
    partId: string,
    partType: string,
    content: string,
    toolState?: Partial<ToolPartState>
  ): void {
    let part = this.parts.get(partId);

    if (!part) {
      // Create new part
      part = {
        partId,
        partType,
        content: new MessageAccumulator(),
        sequence: this.partSequenceCounter++,
      };
      this.parts.set(partId, part);
      this.partOrder.push(partId);
    }

    // For non-tool parts, accumulate content
    if (partType !== 'tool' && content) {
      part.content.append(content);
    }

    // For tool parts, update tool state
    if (toolState) {
      part.toolState = {
        ...part.toolState,
        ...toolState,
      } as ToolPartState;
    }
  }

  /**
   * Build final MessageDto for display.
   */
  toMessageDto(): MessageDto {
    const parts: MessagePartDto[] = this.partOrder.map((partId) => {
      const part = this.parts.get(partId)!;

      if (part.partType === 'tool') {
        return {
          type: 'tool',
          toolName: part.toolState?.name,
          state: part.toolState
            ? {
                status: part.toolState.status,
                input: part.toolState.input,
                output: part.toolState.output,
              }
            : undefined,
        } as MessagePartDto;
      }

      return {
        type: part.partType as MessagePartDto['type'],
        text: part.content.toString(),
      } as MessagePartDto;
    });

    return {
      id: this._messageId,
      role: this._role,
      parts,
      agent: this._agent,
      timestamp: this._startedAt,
    };
  }

  /**
   * Clear all parts.
   */
  clear(): void {
    this.parts.clear();
    this.partOrder = [];
    this.partSequenceCounter = 0;
  }
}
