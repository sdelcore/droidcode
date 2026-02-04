import axios, { AxiosInstance } from 'axios';
import { createLogger } from '@/services/debug/logger';
import type {
  SessionDto,
  MessageDto,
  MessageResponseDto,
  SendMessageRequest,
  ModelDto,
  HealthResponse,
  TodoDto,
  FileDiffDto,
  FileNodeDto,
  AgentType,
  ThinkingModeType,
  PermissionResponse,
  AgentDto,
  ConfigProvidersResponse,
  ProviderDto,
  ProviderStatusDto,
  SessionUpdateRequest,
  SessionStatusDto,
  QuestionRequestDto,
} from '@/types';

import { THINKING_MODES } from '@/types';
import { useHostStore } from '@/stores/hostStore';

/**
 * API Client for OpenCode server.
 * Ported from: data/remote/api/OpenCodeApi.kt
 *
 * @see https://opencode.ai/docs/server - Official OpenCode Server API documentation
 */
class ApiClient {
  // Cache axios instances per host+port combination for better performance
  private clientCache = new Map<string, AxiosInstance>();
  private logger = createLogger('ApiClient');

  /**
   * Get an axios client for a host, optionally using a custom port.
   * Caches instances by host+port combination to avoid recreation overhead.
   * @param hostId - The host ID to look up
   * @param port - Optional port override (for project-specific ports 4100+)
   * @param signal - Optional AbortSignal for request cancellation
   */
  private getClient(hostId: number, port?: number, signal?: AbortSignal): AxiosInstance {
    const host = useHostStore.getState().hosts.find((h) => h.id === hostId);
    if (!host) {
      throw new Error(`Host not found: ${hostId}`);
    }

    // Use custom port if provided, otherwise use host's default port
    const actualPort = port ?? host.port;
    const baseURL = `${host.isSecure ? 'https' : 'http'}://${host.host}:${actualPort}`;
    const cacheKey = `${hostId}:${actualPort}`;

    // Return cached instance if available and no signal is provided
    // (signal requires new instance since it's per-request)
    if (!signal && this.clientCache.has(cacheKey)) {
      return this.clientCache.get(cacheKey)!;
    }

    const client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
    });

    // Cache instance only if no signal (reusable instance)
    if (!signal) {
      this.clientCache.set(cacheKey, client);
    }

    return client;
  }

  /**
   * Make a POST request using fetch API for better React Native compatibility.
   * Axios has known issues with POST requests returning empty bodies on React Native.
   * @param timeoutMs - Optional timeout in milliseconds (default: 30000)
   * @param signal - Optional AbortSignal for request cancellation
   */
  private async fetchPost<T = void>(
    hostId: number,
    path: string,
    body?: unknown,
    port?: number,
    timeoutMs: number = 30000,
    signal?: AbortSignal
  ): Promise<T | void> {
    const host = useHostStore.getState().hosts.find((h) => h.id === hostId);
    if (!host) {
      throw new Error(`Host not found: ${hostId}`);
    }

    const actualPort = port ?? host.port;
    const baseURL = `${host.isSecure ? 'https' : 'http'}://${host.host}:${actualPort}`;
    const url = `${baseURL}${path}`;

    // Create AbortController for timeout
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    // If external signal provided, listen for abort and propagate
    const abortHandler = () => timeoutController.abort();
    if (signal) {
      signal.addEventListener('abort', abortHandler);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: timeoutController.signal,
      });

      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }

      if (!response.ok) {
        const error = new Error(`Request failed with status ${response.status}`);
        (error as any).response = { status: response.status };
        (error as any).isTimeout = false;
        throw error;
      }

      // Return parsed JSON if response has content
      const text = await response.text();
      if (text) {
        return JSON.parse(text) as T;
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }

      // Check if error was caused by abort
      if (error.name === 'AbortError') {
        // Check if it was the external signal that aborted (user cancellation)
        if (signal?.aborted) {
          // Re-throw as AbortError for cancellation
          throw error;
        }
        // Otherwise it was timeout
        const timeoutError = new Error('Request timed out');
        (timeoutError as any).isTimeout = true;
        (timeoutError as any).response = { status: 408 }; // Request Timeout
        throw timeoutError;
      }

      throw error;
    }
  }

  // Health
  async checkHealth(hostId: number): Promise<HealthResponse> {
    const client = this.getClient(hostId);
    const response = await client.get<HealthResponse>('/health');
    return response.data;
  }

  /**
   * Check health on a specific port (for project health checks).
   */
  async checkHealthOnPort(hostId: number, port: number): Promise<HealthResponse> {
    const host = useHostStore.getState().hosts.find((h) => h.id === hostId);
    if (!host) {
      throw new Error(`Host not found: ${hostId}`);
    }

    const baseURL = `${host.isSecure ? 'https' : 'http'}://${host.host}:${port}`;
    const client = axios.create({
      baseURL,
      timeout: 5000, // Shorter timeout for health checks
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await client.get<HealthResponse>('/health');
    return response.data;
  }

  /**
   * Check global health endpoint (for connection monitoring).
   * Uses /global/health which is project-independent.
   */
  async checkGlobalHealth(hostId: number, port: number): Promise<HealthResponse> {
    const host = useHostStore.getState().hosts.find((h) => h.id === hostId);
    if (!host) {
      throw new Error(`Host not found: ${hostId}`);
    }

    const baseURL = `${host.isSecure ? 'https' : 'http'}://${host.host}:${port}`;
    const client = axios.create({
      baseURL,
      timeout: 5000, // Shorter timeout for health checks
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await client.get<HealthResponse>('/global/health');
    return response.data;
  }

  // Sessions
  async getSessions(hostId: number, port?: number): Promise<SessionDto[]> {
    const client = this.getClient(hostId, port);
    const response = await client.get<SessionDto[]>('/session');
    return response.data;
  }

  async getSession(hostId: number, sessionId: string, port?: number): Promise<SessionDto> {
    const client = this.getClient(hostId, port);
    const response = await client.get<SessionDto>(`/session/${sessionId}`);
    return response.data;
  }

  async getChildSessions(hostId: number, sessionId: string, port?: number): Promise<SessionDto[]> {
    const client = this.getClient(hostId, port);
    const response = await client.get<SessionDto[]>(`/session/${sessionId}/children`);
    return response.data;
  }

  async createSession(hostId: number, directory?: string, port?: number): Promise<SessionDto> {
    const client = this.getClient(hostId, port);
    const response = await client.post<SessionDto>('/session', { directory });
    return response.data;
  }

  async deleteSession(hostId: number, sessionId: string, port?: number): Promise<void> {
    const client = this.getClient(hostId, port);
    await client.delete(`/session/${sessionId}`);
  }

  // Messages
  async getMessages(
    hostId: number,
    sessionId: string,
    options?: { limit?: number },
    port?: number,
    signal?: AbortSignal
  ): Promise<MessageDto[]> {
    const client = this.getClient(hostId, port, signal);
    const params = options?.limit ? { limit: options.limit } : undefined;
    const response = await client.get<MessageResponseDto[]>(`/session/${sessionId}/message`, { params });

    // Transform from { info, parts } format to flat MessageDto format
    return response.data.map(item => ({
      id: item.info.id,
      role: item.info.role as 'user' | 'assistant',
      parts: item.parts,
      agent: item.info.agent,
      timestamp: item.info.time?.created ?? Date.now(),
    }));
  }

  async sendMessage(
    hostId: number,
    sessionId: string,
    options: {
      text: string;
      agent?: AgentType;
      thinkingMode?: ThinkingModeType;
      images?: string[];
      model?: ModelDto;
    },
    port?: number,
    signal?: AbortSignal
  ): Promise<void> {
    // Build parts array
    const parts: any[] = [{ type: 'text', text: options.text }];

    // Add images if provided (expects data URLs like "data:image/jpeg;base64,...")
    if (options.images) {
      for (const dataUrl of options.images) {
        // Parse mediaType from data URL (format: data:mediaType;base64,...)
        const mediaTypeMatch = dataUrl.match(/^data:([^;]+);base64,/);
        const mediaType = mediaTypeMatch?.[1] || 'image/jpeg';

        parts.push({
          type: 'file',
          mime: mediaType,
          url: dataUrl,
        });
      }
    }

    // Build request - only include variant if it has a value
    const variant = options.thinkingMode
      ? THINKING_MODES[options.thinkingMode].variant
      : null;

    const request: SendMessageRequest = {
      parts,
      agent: options.agent,
      model: options.model,
      ...(variant && { variant }),
    };

    // Use longer timeout for messages with images (90s vs 30s default)
    const timeout = options.images && options.images.length > 0 ? 90000 : 30000;
    
    // Use fetch instead of axios for React Native compatibility with empty responses
    await this.fetchPost(hostId, `/session/${sessionId}/message`, request, port, timeout, signal);
  }

  // Session operations
  async abortSession(hostId: number, sessionId: string, port?: number, signal?: AbortSignal): Promise<void> {
    await this.fetchPost(hostId, `/session/${sessionId}/abort`, undefined, port, 30000, signal);
  }

  async revertSession(hostId: number, sessionId: string, messageId: string, port?: number, signal?: AbortSignal): Promise<void> {
    await this.fetchPost(hostId, `/session/${sessionId}/revert`, { messageID: messageId }, port, 30000, signal);
  }

  async unrevertSession(hostId: number, sessionId: string, port?: number, signal?: AbortSignal): Promise<void> {
    await this.fetchPost(hostId, `/session/${sessionId}/unrevert`, undefined, port, 30000, signal);
  }

  async forkSession(hostId: number, sessionId: string, messageId: string, port?: number, signal?: AbortSignal): Promise<string> {
    const client = this.getClient(hostId, port, signal);
    const response = await client.post<{ sessionId: string }>(`/session/${sessionId}/fork`, {
      messageID: messageId,
    });
    return response.data.sessionId;
  }

  // Todos
  async getTodos(hostId: number, sessionId: string, port?: number): Promise<TodoDto[]> {
    const client = this.getClient(hostId, port);
    try {
      const response = await client.get<TodoDto[]>(`/session/${sessionId}/todo`);
      // Ensure we always return an array, even if the response is null/undefined
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      // Log the error but return empty array to prevent UI crashes
      console.error('Failed to fetch todos:', error);
      return [];
    }
  }

  // Diffs
  async getDiffs(hostId: number, sessionId: string, port?: number): Promise<FileDiffDto[]> {
    const client = this.getClient(hostId, port);
    const response = await client.get<{ files: FileDiffDto[] }>(`/session/${sessionId}/diff`);
    return response.data.files;
  }

  // Permissions
  /**
   * Respond to a permission request.
   * Uses the new /permission/:requestID/reply endpoint.
   * @param message Optional feedback message when rejecting
   */
  async respondToPermission(
    hostId: number,
    permissionId: string,
    response: PermissionResponse,
    message?: string,
    port?: number,
    signal?: AbortSignal
  ): Promise<void> {
    // Map app response values to API values
    // App uses: 'accept' | 'accept_always' | 'deny'
    // API expects: 'once' | 'always' | 'reject'
    const apiResponseMap: Record<PermissionResponse, string> = {
      'accept': 'once',
      'accept_always': 'always',
      'deny': 'reject',
    };
    const reply = apiResponseMap[response];

    // Build request body - only include message if provided and rejecting
    const body: { reply: string; message?: string } = { reply };
    if (message && response === 'deny') {
      body.message = message;
    }

    await this.fetchPost(hostId, `/permission/${permissionId}/reply`, body, port, 30000, signal);
  }

  // Files (for autocomplete)
  async listFiles(hostId: number, path: string, port?: number): Promise<FileNodeDto[]> {
    const client = this.getClient(hostId, port);
    const response = await client.get<FileNodeDto[]>('/file', {
      params: { path },
    });
    return response.data;
  }

  // Shell - execute command and return output
  async runShellCommand(
    hostId: number,
    sessionId: string,
    command: string,
    port?: number
  ): Promise<string> {
    const client = this.getClient(hostId, port);
    const response = await client.post<{
      output?: string;
      result?: string;
      parts?: Array<{ type: string; text?: string; content?: string; state?: { output?: string } }>;
    }>(
      `/session/${sessionId}/shell`,
      { command, agent: 'build' }
    );
    // API may return output in different fields depending on version
    // Try legacy fields first
    if (response.data.output) return response.data.output;
    if (response.data.result) return response.data.result;
    // Extract output from parts array (tool results have state.output)
    if (response.data.parts && Array.isArray(response.data.parts)) {
      const outputs = response.data.parts
        .map(part => part.state?.output || part.text || part.content || '')
        .filter(Boolean);
      if (outputs.length > 0) return outputs.join('\n');
    }
    return '';
  }

  // Summarize/Compact session
  async summarizeSession(hostId: number, sessionId: string, port?: number, signal?: AbortSignal): Promise<void> {
    await this.fetchPost(hostId, `/session/${sessionId}/summarize`, undefined, port, 30000, signal);
  }

  // Execute slash command
  async executeCommand(
    hostId: number,
    sessionId: string,
    command: string,
    args?: string,
    port?: number,
    signal?: AbortSignal
  ): Promise<void> {
    await this.fetchPost(hostId, `/session/${sessionId}/command`, { command, arguments: args }, port, 30000, signal);
  }

  // Get available slash commands
  async getCommands(hostId: number, port?: number): Promise<{ name: string; description: string; aliases?: string[] }[]> {
    const client = this.getClient(hostId, port);
    const response = await client.get<{ name: string; description: string; aliases?: string[] }[]>('/command');
    return response.data;
  }

  // ==================== NEW HIGH-PRIORITY ENDPOINTS ====================

  // Agents - get available agents from server
  async getAgents(hostId: number, port?: number): Promise<AgentDto[]> {
    const client = this.getClient(hostId, port);
    const response = await client.get<AgentDto[]>('/agent');
    return response.data;
  }

  // Providers - get provider configuration with models
  async getProviders(hostId: number, port?: number): Promise<ConfigProvidersResponse> {
    const client = this.getClient(hostId, port);
    const response = await client.get<ConfigProvidersResponse>('/config/providers');
    return response.data;
  }

  // Provider status - get connection status for all providers
  async getProviderStatus(hostId: number, port?: number): Promise<ProviderStatusDto[]> {
    const client = this.getClient(hostId, port);
    const response = await client.get<{ all: ProviderDto[], connected: string[] }>('/provider');
    
    // Transform API response into ProviderStatusDto array
    // API returns { all: Provider[], connected: ["anthropic", "openai"] }
    // We need: [{ id: "anthropic", name: "Anthropic", connected: true }, ...]
    const connectedSet = new Set(response.data.connected);
    
    return response.data.all.map(provider => ({
      id: provider.id,
      name: provider.name,
      connected: connectedSet.has(provider.id),
    }));
  }

  // Update session - rename, etc.
  async updateSession(
    hostId: number,
    sessionId: string,
    data: SessionUpdateRequest,
    port?: number
  ): Promise<void> {
    const client = this.getClient(hostId, port);
    await client.patch(`/session/${sessionId}`, data);
  }

  // ==================== QUESTION TOOL ====================

  /**
   * List pending questions from the AI agent.
   */
  async listQuestions(hostId: number, port?: number): Promise<QuestionRequestDto[]> {
    const client = this.getClient(hostId, port);
    const response = await client.get<QuestionRequestDto[]>('/question');
    return response.data;
  }

  /**
   * Reply to a question request with answers.
   * @param answers Array of arrays - each inner array contains the selected label(s) for that question
   */
  async replyToQuestion(
    hostId: number,
    requestId: string,
    answers: string[][],
    port?: number,
    signal?: AbortSignal
  ): Promise<void> {
    await this.fetchPost(
      hostId,
      `/question/${requestId}/reply`,
      { answers },
      port,
      30000,
      signal
    );
  }

  /**
   * Reject/dismiss a question request.
   */
  async rejectQuestion(
    hostId: number,
    requestId: string,
    port?: number,
    signal?: AbortSignal
  ): Promise<void> {
    await this.fetchPost(
      hostId,
      `/question/${requestId}/reject`,
      {},
      port,
      30000,
      signal
    );
  }
}

export const apiClient = new ApiClient();
