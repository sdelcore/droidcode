/**
 * StreamingMessageState Tests
 *
 * Tests for managing per-message streaming state.
 */

import { StreamingMessageState } from '@/services/messaging/StreamingMessageState';
import type { MessageDto } from '@/types';

describe('StreamingMessageState', () => {
  let state: StreamingMessageState;

  beforeEach(() => {
    state = new StreamingMessageState(
      'msg-1',
      'session-1',
      'assistant',
      'build'
    );
  });

  describe('initialization', () => {
    it('should initialize with message metadata', () => {
      expect(state.messageId).toBe('msg-1');
      expect(state.sessionId).toBe('session-1');
      expect(state.role).toBe('assistant');
      expect(state.agent).toBe('build');
    });

    it('should start empty', () => {
      expect(state.isEmpty).toBe(true);
      expect(state.partCount).toBe(0);
    });

    it('should work without agent', () => {
      const noAgentState = new StreamingMessageState(
        'msg-2',
        'session-1',
        'user'
      );
      expect(noAgentState.agent).toBeUndefined();
    });
  });

  describe('addDelta', () => {
    it('should create new part on first delta', () => {
      state.addDelta('part-1', 'text', 'Hello');

      expect(state.isEmpty).toBe(false);
      expect(state.partCount).toBe(1);
    });

    it('should accumulate content for existing part', () => {
      state.addDelta('part-1', 'text', 'Hello');
      state.addDelta('part-1', 'text', ' World');

      const dto = state.toMessageDto();
      expect(dto.parts[0].text).toBe('Hello World');
    });

    it('should maintain part order by sequence', () => {
      state.addDelta('part-1', 'text', 'First');
      state.addDelta('part-2', 'text', 'Second');
      state.addDelta('part-3', 'text', 'Third');

      const dto = state.toMessageDto();
      expect(dto.parts[0].text).toBe('First');
      expect(dto.parts[1].text).toBe('Second');
      expect(dto.parts[2].text).toBe('Third');
    });

    it('should handle interleaved deltas for multiple parts', () => {
      state.addDelta('part-1', 'text', 'A');
      state.addDelta('part-2', 'thinking', 'Think');
      state.addDelta('part-1', 'text', 'B');
      state.addDelta('part-2', 'thinking', 'ing');
      state.addDelta('part-1', 'text', 'C');

      const dto = state.toMessageDto();
      expect(dto.parts[0].text).toBe('ABC');
      expect(dto.parts[1].text).toBe('Thinking');
    });
  });

  describe('tool parts', () => {
    it('should handle tool parts with state', () => {
      state.addDelta('part-1', 'tool', '', {
        name: 'read_file',
        status: 'running',
      });

      const dto = state.toMessageDto();
      expect(dto.parts[0].type).toBe('tool');
      expect(dto.parts[0].toolName).toBe('read_file');
      expect(dto.parts[0].state?.status).toBe('running');
    });

    it('should update tool state progressively', () => {
      // Tool starts running
      state.addDelta('part-1', 'tool', '', {
        name: 'read_file',
        status: 'running',
        input: '/path/to/file',
      });

      let dto = state.toMessageDto();
      expect(dto.parts[0].state?.status).toBe('running');
      expect(dto.parts[0].state?.input).toBe('/path/to/file');

      // Tool completes
      state.addDelta('part-1', 'tool', '', {
        status: 'completed',
        output: 'file contents',
      });

      dto = state.toMessageDto();
      expect(dto.parts[0].state?.status).toBe('completed');
      expect(dto.parts[0].state?.output).toBe('file contents');
      expect(dto.parts[0].state?.input).toBe('/path/to/file'); // Preserved
    });

    it('should not accumulate content for tool parts', () => {
      state.addDelta('part-1', 'tool', 'ignored', { name: 'test', status: 'running' });
      state.addDelta('part-1', 'tool', 'also ignored', {});

      const dto = state.toMessageDto();
      // Tool parts don't have text content
      expect(dto.parts[0].text).toBeUndefined();
    });
  });

  describe('toMessageDto', () => {
    it('should convert to MessageDto correctly', () => {
      state.addDelta('part-1', 'text', 'Hello');

      const dto = state.toMessageDto();

      expect(dto.id).toBe('msg-1');
      expect(dto.role).toBe('assistant');
      expect(dto.agent).toBe('build');
      expect(dto.parts).toHaveLength(1);
      expect(dto.parts[0].type).toBe('text');
      expect(dto.parts[0].text).toBe('Hello');
      expect(dto.timestamp).toBeGreaterThan(0);
    });

    it('should handle empty state', () => {
      const dto = state.toMessageDto();

      expect(dto.id).toBe('msg-1');
      expect(dto.parts).toHaveLength(0);
    });

    it('should handle multiple part types', () => {
      state.addDelta('part-1', 'thinking', 'Let me think...');
      state.addDelta('part-2', 'text', 'Here is my answer');
      state.addDelta('part-3', 'tool', '', { name: 'bash', status: 'completed' });

      const dto = state.toMessageDto();

      expect(dto.parts).toHaveLength(3);
      expect(dto.parts[0].type).toBe('thinking');
      expect(dto.parts[1].type).toBe('text');
      expect(dto.parts[2].type).toBe('tool');
    });
  });

  describe('isEmpty', () => {
    it('should report isEmpty when no parts', () => {
      expect(state.isEmpty).toBe(true);
    });

    it('should report not empty after adding parts', () => {
      state.addDelta('part-1', 'text', 'test');
      expect(state.isEmpty).toBe(false);
    });
  });

  describe('partCount', () => {
    it('should track part count', () => {
      expect(state.partCount).toBe(0);

      state.addDelta('part-1', 'text', 'a');
      expect(state.partCount).toBe(1);

      state.addDelta('part-2', 'text', 'b');
      expect(state.partCount).toBe(2);

      // Same part, count shouldn't increase
      state.addDelta('part-1', 'text', 'c');
      expect(state.partCount).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all parts', () => {
      state.addDelta('part-1', 'text', 'Hello');
      state.addDelta('part-2', 'text', 'World');

      state.clear();

      expect(state.isEmpty).toBe(true);
      expect(state.partCount).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty content deltas', () => {
      state.addDelta('part-1', 'text', '');
      state.addDelta('part-1', 'text', 'Hello');
      state.addDelta('part-1', 'text', '');

      const dto = state.toMessageDto();
      expect(dto.parts[0].text).toBe('Hello');
    });

    it('should handle unicode content', () => {
      state.addDelta('part-1', 'text', '你好');
      state.addDelta('part-1', 'text', ' 🎉');

      const dto = state.toMessageDto();
      expect(dto.parts[0].text).toBe('你好 🎉');
    });

    it('should handle large content', () => {
      const largeChunk = 'x'.repeat(10000);
      state.addDelta('part-1', 'text', largeChunk);
      state.addDelta('part-1', 'text', largeChunk);

      const dto = state.toMessageDto();
      expect(dto.parts[0].text?.length).toBe(20000);
    });
  });
});
