import { create } from 'zustand';
import type { SessionDto, SseEvent, AgentType } from '@/types';
import { apiClient } from '@/services/api/apiClient';
import { sessionMetadataRepository } from '@/services/db/sessionMetadataRepository';

/**
 * Fetch the last agent used in a session by looking at the most recent assistant message.
 * Returns undefined if no messages or no agent found.
 */
async function fetchLastAgentForSession(
  hostId: number,
  sessionId: string,
  port?: number
): Promise<AgentType | undefined> {
  try {
    // Fetch messages for this session (limit to 10 most recent)
    const messages = await apiClient.getMessages(hostId, sessionId, { limit: 10 }, port);
    
    // Find the last assistant message with an agent
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.agent) {
        return msg.agent as AgentType;
      }
    }
    
    return undefined;
  } catch (error) {
    console.error(`[SessionStore] Failed to fetch last agent for ${sessionId}:`, error);
    return undefined;
  }
}

/**
 * Metadata about a session that's tracked client-side for UI enhancements.
 * This includes the last agent used and current busy/idle status.
 */
interface SessionMetadata {
  lastAgent?: AgentType;
  isBusy: boolean;
  lastActivity: number;
}

/**
 * Time threshold (in milliseconds) for considering a busy state as stale.
 * If a session has been marked as busy for longer than this without activity,
 * it's assumed to be idle (prevents stuck spinners from missed SSE events).
 */
const STALE_BUSY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clean up stale busy states in session metadata.
 * If a session is marked as busy but hasn't had activity in > 5 minutes,
 * reset it to idle. This prevents indefinitely spinning indicators when
 * the app missed a session.status:idle SSE event (e.g., app was closed).
 * 
 * @param metadata - Map of session IDs to metadata
 * @returns Object with cleaned metadata and list of cleaned session IDs
 */
function cleanStaleBusyStates(metadata: Record<string, SessionMetadata>): {
  cleaned: Record<string, SessionMetadata>;
  staleSessionIds: string[];
} {
  const now = Date.now();
  const cleaned: Record<string, SessionMetadata> = {};
  const staleSessionIds: string[] = [];

  for (const [sessionId, meta] of Object.entries(metadata)) {
    if (meta.isBusy && (now - meta.lastActivity) > STALE_BUSY_THRESHOLD_MS) {
      // This busy state is stale - reset to idle
      cleaned[sessionId] = {
        ...meta,
        isBusy: false,
      };
      staleSessionIds.push(sessionId);
    } else {
      // Keep as-is
      cleaned[sessionId] = meta;
    }
  }

  return { cleaned, staleSessionIds };
}

interface SessionState {
  sessions: SessionDto[];
  childSessions: Record<string, SessionDto[]>; // Map of parentSessionId -> child sessions
  sessionMetadata: Record<string, SessionMetadata>; // Map of sessionId -> metadata
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  currentHostId: number | null;
  currentPort: number | null;

  // Actions
  fetchSessions: (hostId: number, port?: number) => Promise<void>;
  fetchChildSessions: (sessionId: string, port?: number) => Promise<void>;
  createSession: (hostId: number, directory?: string, port?: number) => Promise<string | null>;
  deleteSession: (sessionId: string, port?: number) => Promise<void>;
  deleteMultipleSessions: (
    sessionIds: string[], 
    port?: number,
    onProgress?: (completed: number, total: number) => void
  ) => Promise<{ success: number; failed: string[] }>;
  refreshSession: (sessionId: string, port?: number) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => void;
  renameSession: (sessionId: string, title: string, port?: number) => Promise<boolean>;
  clearSessions: () => void;
  
  // Metadata actions
  updateSessionAgent: (sessionId: string, agent: AgentType) => void;
  updateSessionStatus: (sessionId: string, isBusy: boolean) => void;
  getSessionMetadata: (sessionId: string) => SessionMetadata | undefined;
  
  // SSE event handling
  handleGlobalSessionEvent: (event: SseEvent) => void;
  
  // Internal helpers (prefixed with _)
  _upsertSession: (sessionDto: SessionDto) => void;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  sessions: [],
  childSessions: {},
  sessionMetadata: {},
  isLoading: false,
  isRefreshing: false,
  error: null,
  currentHostId: null,
  currentPort: null,

  fetchSessions: async (hostId: number, port?: number) => {
    // Stale-while-revalidate pattern: Show cached sessions while refreshing
    const hasExistingSessions = get().sessions.length > 0;
    const startTime = Date.now();

    if (hasExistingSessions) {
      // Background refresh - keep showing existing sessions
      set({ isRefreshing: true, error: null, currentHostId: hostId, currentPort: port ?? null });
    } else {
      // Initial load - show loading state
      set({ isLoading: true, error: null, currentHostId: hostId, currentPort: port ?? null });
    }

    try {
      const allSessions = await apiClient.getSessions(hostId, port);
      console.log(`[SessionStore] getSessions API call took ${Date.now() - startTime}ms`);
      // Filter out child sessions (sessions with parentID) - only show top-level sessions
      const parentSessions = allSessions.filter((s) => !s.parentID);
      // Sort by updated time, most recent first
      parentSessions.sort((a, b) => b.time.updated - a.time.updated);

      // Show sessions immediately (stale-while-revalidate)
      set({ sessions: parentSessions, isLoading: false, isRefreshing: false });

      // Load metadata from database in background (non-blocking)
      const sessionIds = parentSessions.map((s) => s.id);
      sessionMetadataRepository.getMany(sessionIds)
        .then(async (metadataMap) => {
          // Convert Map to Record for store
          const rawMetadata: Record<string, SessionMetadata> = {};
          metadataMap.forEach((metadata, sessionId) => {
            rawMetadata[sessionId] = metadata;
          });

          // Clean up stale busy states (sessions marked busy for > 5 minutes)
          const { cleaned: sessionMetadata, staleSessionIds } = cleanStaleBusyStates(rawMetadata);

          // Update database for any cleaned stale states (async, non-blocking)
          if (staleSessionIds.length > 0) {
            console.log(`[SessionStore] Cleaned ${staleSessionIds.length} stale busy state(s):`, staleSessionIds);
            staleSessionIds.forEach((sessionId) => {
              sessionMetadataRepository.updateBusyStatus(sessionId, false).catch((error) => {
                console.error('[SessionStore] Failed to persist cleaned busy state:', error);
              });
            });
          }

          // Update metadata in store
          set({ sessionMetadata });

          // Backfill agent data for sessions missing it (background operation)
          const sessionsNeedingAgent = parentSessions.filter(
            (session) => !sessionMetadata[session.id]?.lastAgent
          );

          if (sessionsNeedingAgent.length > 0) {
            console.log(`[SessionStore] Backfilling agent data for ${sessionsNeedingAgent.length} session(s)...`);
            const backfillStartTime = Date.now();

            // Fetch agents in parallel (with concurrency limit to avoid overwhelming server)
            const agentPromises = sessionsNeedingAgent.map((session) =>
              fetchLastAgentForSession(hostId, session.id, port).then((agent) => ({
                sessionId: session.id,
                agent,
              }))
            );

            const results = await Promise.all(agentPromises);
            
            // Build map of sessions with discovered agents
            const agentMap = new Map<string, AgentType>();
            const updatedMetadata: Record<string, SessionMetadata> = { ...sessionMetadata };
            
            results.forEach(({ sessionId, agent }) => {
              if (agent) {
                agentMap.set(sessionId, agent);
                // Update in-memory metadata
                updatedMetadata[sessionId] = {
                  ...sessionMetadata[sessionId],
                  lastAgent: agent,
                  isBusy: sessionMetadata[sessionId]?.isBusy ?? false,
                  lastActivity: Date.now(),
                };
              }
            });

            if (agentMap.size > 0) {
              console.log(
                `[SessionStore] Backfilled agent data for ${agentMap.size} session(s) in ${Date.now() - backfillStartTime}ms`
              );

              // Persist to database (non-blocking)
              sessionMetadataRepository.batchUpsertAgents(agentMap).catch((error) => {
                console.error('[SessionStore] Failed to persist backfilled agents:', error);
              });

              // Update store with backfilled data
              set({ sessionMetadata: updatedMetadata });
            }
          }
        })
        .catch((error) => {
          console.error('[SessionStore] Failed to load metadata:', error);
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch sessions';
      set({ error: message, isLoading: false, isRefreshing: false });
    }
  },

  fetchChildSessions: async (sessionId: string, port?: number) => {
    const { currentHostId, currentPort } = get();
    if (!currentHostId) return;

    // Use provided port or fall back to stored currentPort
    const effectivePort = port ?? currentPort ?? undefined;

    try {
      const children = await apiClient.getChildSessions(currentHostId, sessionId, effectivePort);
      // Sort by updated time, most recent first
      children.sort((a, b) => b.time.updated - a.time.updated);
      set((state) => ({
        childSessions: {
          ...state.childSessions,
          [sessionId]: children,
        },
      }));
    } catch (error) {
      console.error('Failed to fetch child sessions:', error);
      // Don't set error state for child sessions - it's not critical
    }
  },

  createSession: async (hostId: number, directory?: string, port?: number) => {
    set({ isLoading: true, error: null });

    try {
      const session = await apiClient.createSession(hostId, directory, port);
      set((state) => ({
        sessions: [session, ...state.sessions],
        isLoading: false,
      }));
      return session.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create session';
      set({ error: message, isLoading: false });
      return null;
    }
  },

  deleteSession: async (sessionId: string, port?: number) => {
    const { currentHostId, currentPort } = get();
    if (!currentHostId) return;

    // Use provided port or fall back to stored currentPort
    const effectivePort = port ?? currentPort ?? undefined;

    try {
      await apiClient.deleteSession(currentHostId, sessionId, effectivePort);
      
      // Remove from state
      set((state) => {
        const { [sessionId]: _, ...remainingMetadata } = state.sessionMetadata;
        return {
          sessions: state.sessions.filter((s) => s.id !== sessionId),
          sessionMetadata: remainingMetadata,
        };
      });
      
      // Delete from database (async, non-blocking)
      sessionMetadataRepository.delete(sessionId).catch((error) => {
        console.error('[SessionStore] Failed to delete metadata:', error);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete session';
      set({ error: message });
    }
  },

  deleteMultipleSessions: async (
    sessionIds: string[], 
    port?: number,
    onProgress?: (completed: number, total: number) => void
  ) => {
    const { currentHostId, currentPort } = get();
    if (!currentHostId) {
      return { success: 0, failed: sessionIds };
    }

    // Use provided port or fall back to stored currentPort
    const effectivePort = port ?? currentPort ?? undefined;

    const successfulDeletions: string[] = [];
    const failedDeletions: string[] = [];

    // Delete sessions sequentially (no batch API endpoint available)
    for (let i = 0; i < sessionIds.length; i++) {
      const sessionId = sessionIds[i];
      
      try {
        await apiClient.deleteSession(currentHostId, sessionId, effectivePort);
        successfulDeletions.push(sessionId);
        
        // Delete from database (async, non-blocking)
        sessionMetadataRepository.delete(sessionId).catch((error) => {
          console.error('[SessionStore] Failed to delete metadata:', error);
        });
      } catch (error) {
        console.error(`[SessionStore] Failed to delete session ${sessionId}:`, error);
        failedDeletions.push(sessionId);
      }

      // Call progress callback after each deletion
      if (onProgress) {
        onProgress(i + 1, sessionIds.length);
      }
    }

    // Batch update state - remove all successfully deleted sessions at once
    if (successfulDeletions.length > 0) {
      set((state) => {
        const updatedMetadata = { ...state.sessionMetadata };
        successfulDeletions.forEach((sessionId) => {
          delete updatedMetadata[sessionId];
        });
        
        return {
          sessions: state.sessions.filter((s) => !successfulDeletions.includes(s.id)),
          sessionMetadata: updatedMetadata,
        };
      });
    }

    // Set error if there were any failures
    if (failedDeletions.length > 0) {
      const message = `Failed to delete ${failedDeletions.length} of ${sessionIds.length} session${sessionIds.length > 1 ? 's' : ''}`;
      set({ error: message });
    }

    return {
      success: successfulDeletions.length,
      failed: failedDeletions,
    };
  },

  refreshSession: async (sessionId: string, port?: number) => {
    const { currentHostId, currentPort } = get();
    if (!currentHostId) return;

    // Use provided port or fall back to stored currentPort
    const effectivePort = port ?? currentPort ?? undefined;

    try {
      const session = await apiClient.getSession(currentHostId, sessionId, effectivePort);
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? session : s
        ),
      }));
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }
  },

  updateSessionTitle: (sessionId: string, title: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, title } : s
      ),
    }));
  },

  renameSession: async (sessionId: string, title: string, port?: number) => {
    const { currentHostId, currentPort } = get();
    if (!currentHostId) return false;

    // Use provided port or fall back to stored currentPort
    const effectivePort = port ?? currentPort ?? undefined;

    try {
      await apiClient.updateSession(currentHostId, sessionId, { title }, effectivePort);
      // Update local state
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, title } : s
        ),
      }));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to rename session';
      set({ error: message });
      return false;
    }
  },

  // TODO: Implement shareSession and unshareSession in apiClient
  // shareSession: async (sessionId: string, port?: number) => {
  //   const { currentHostId, currentPort } = get();
  //   if (!currentHostId) return null;
  //   const effectivePort = port ?? currentPort ?? undefined;
  //   try {
  //     const response = await apiClient.shareSession(currentHostId, sessionId, effectivePort);
  //     set((state) => ({
  //       sessions: state.sessions.map((s) =>
  //         s.id === sessionId ? { ...s, share: { url: response.url } } : s
  //       ),
  //     }));
  //     return response.url;
  //   } catch (error) {
  //     const message = error instanceof Error ? error.message : 'Failed to share session';
  //     set({ error: message });
  //     return null;
  //   }
  // },

  // unshareSession: async (sessionId: string, port?: number) => {
  //   const { currentHostId, currentPort } = get();
  //   if (!currentHostId) return false;
  //   const effectivePort = port ?? currentPort ?? undefined;
  //   try {
  //     await apiClient.unshareSession(currentHostId, sessionId, effectivePort);
  //     set((state) => ({
  //       sessions: state.sessions.map((s) =>
  //         s.id === sessionId ? { ...s, share: undefined } : s
  //       ),
  //     }));
  //     return true;
  //   } catch (error) {
  //     const message = error instanceof Error ? error.message : 'Failed to unshare session';
  //     set({ error: message });
  //     return false;
  //   }
  // },

  clearSessions: () => {
    set({ sessions: [], childSessions: {}, sessionMetadata: {}, currentHostId: null, currentPort: null, error: null, isRefreshing: false });
  },

  // Metadata management
  updateSessionAgent: (sessionId: string, agent: AgentType) => {
    const metadata: SessionMetadata = {
      ...get().sessionMetadata[sessionId],
      lastAgent: agent,
      isBusy: get().sessionMetadata[sessionId]?.isBusy ?? false,
      lastActivity: Date.now(),
    };
    
    set((state) => ({
      sessionMetadata: {
        ...state.sessionMetadata,
        [sessionId]: metadata,
      },
    }));
    
    // Persist to database (async, non-blocking)
    sessionMetadataRepository.upsert(sessionId, metadata).catch((error) => {
      console.error('[SessionStore] Failed to persist agent update:', error);
    });
  },

  updateSessionStatus: (sessionId: string, isBusy: boolean) => {
    const metadata: SessionMetadata = {
      ...get().sessionMetadata[sessionId],
      isBusy,
      lastActivity: Date.now(),
    };
    
    set((state) => ({
      sessionMetadata: {
        ...state.sessionMetadata,
        [sessionId]: metadata,
      },
    }));
    
    // Persist to database (async, non-blocking)
    sessionMetadataRepository.upsert(sessionId, metadata).catch((error) => {
      console.error('[SessionStore] Failed to persist status update:', error);
    });
  },

  getSessionMetadata: (sessionId: string) => {
    return get().sessionMetadata[sessionId];
  },
  
  // SSE event handling - process global session lifecycle events
  handleGlobalSessionEvent: (event: SseEvent) => {
    const { currentHostId } = get();
    
    // Only process events for the currently viewed project
    if (!currentHostId) return;
    
    switch (event.type) {
      case 'session.created': {
        // Use upsert to add new session
        get()._upsertSession(event.info);
        break;
      }
      
      case 'session.updated.global': {
        // Use upsert to update session (or add if it doesn't exist yet)
        // This handles race conditions where title update arrives before session.created
        get()._upsertSession(event.info);
        break;
      }
      
      case 'session.updated': {
        // Handle flat format title updates from per-session SSE
        if (event.title) {
          console.log('[SessionStore] Title update (flat format):', event.sessionId, `title: "${event.title}"`);
          get().updateSessionTitle(event.sessionId, event.title);
        } else {
          console.log('[SessionStore] session.updated event without title:', event.sessionId);
        }
        break;
      }
      
      case 'session.deleted': {
        // Remove session from list
        set((state) => {
          const { [event.info.id]: _, ...remainingMetadata } = state.sessionMetadata;
          return {
            sessions: state.sessions.filter((s) => s.id !== event.info.id),
            sessionMetadata: remainingMetadata,
          };
        });
        
        // Delete from database (async, non-blocking)
        sessionMetadataRepository.delete(event.info.id).catch((error) => {
          console.error('[SessionStore] Failed to delete metadata:', error);
        });
        console.log('[SessionStore] Session deleted:', event.info.id);
        break;
      }
      
      case 'session.status': {
        // Update session metadata (busy/idle indicator)
        get().updateSessionStatus(event.sessionId, event.status === 'busy');
        break;
      }
    }
  },
  
  // Internal helper: Upsert session (add if new, update if exists)
  _upsertSession: (sessionDto: SessionDto) => {
    const { sessions } = get();
    
    // Filter out child sessions (sessions with parentID) - only show top-level sessions
    if (sessionDto.parentID) {
      console.log('[SessionStore] Skipping child session:', sessionDto.id);
      return;
    }
    
    const existingIndex = sessions.findIndex((s) => s.id === sessionDto.id);
    
    if (existingIndex >= 0) {
      // Update existing session
      set((state) => ({
        sessions: state.sessions
          .map((s) => (s.id === sessionDto.id ? sessionDto : s))
          .sort((a, b) => b.time.updated - a.time.updated),
      }));
      console.log('[SessionStore] Session upserted (updated):', sessionDto.id, sessionDto.title ? `title: "${sessionDto.title}"` : '(no title)');
    } else {
      // Add new session
      set((state) => ({
        sessions: [sessionDto, ...state.sessions].sort((a, b) => b.time.updated - a.time.updated),
      }));
      console.log('[SessionStore] Session upserted (created):', sessionDto.id, sessionDto.title ? `title: "${sessionDto.title}"` : '(no title)');
    }
  },
}));
