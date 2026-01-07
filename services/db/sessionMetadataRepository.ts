import { database } from './database';
import type { AgentType } from '@/types';

export interface SessionMetadataRow {
  session_id: string;
  last_agent?: string;
  is_busy: number;
  last_activity: number;
  created_at: number;
  updated_at: number;
}

export interface SessionMetadata {
  lastAgent?: AgentType;
  isBusy: boolean;
  lastActivity: number;
}

/**
 * Repository for managing session metadata in SQLite.
 * Tracks the last agent used and busy status for each session.
 */
class SessionMetadataRepository {
  /**
   * Save or update session metadata.
   */
  async upsert(sessionId: string, metadata: SessionMetadata): Promise<void> {
    const db = database.getDatabase();
    const now = Date.now();

    await db.runAsync(
      `INSERT INTO session_metadata (session_id, last_agent, is_busy, last_activity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         last_agent = excluded.last_agent,
         is_busy = excluded.is_busy,
         last_activity = excluded.last_activity,
         updated_at = excluded.updated_at`,
      [
        sessionId,
        metadata.lastAgent || null,
        metadata.isBusy ? 1 : 0,
        metadata.lastActivity,
        now,
        now,
      ]
    );
  }

  /**
   * Get metadata for a specific session.
   */
  async get(sessionId: string): Promise<SessionMetadata | null> {
    const db = database.getDatabase();
    const row = await db.getFirstAsync<SessionMetadataRow>(
      'SELECT * FROM session_metadata WHERE session_id = ?',
      [sessionId]
    );

    if (!row) return null;

    return {
      lastAgent: row.last_agent as AgentType | undefined,
      isBusy: row.is_busy === 1,
      lastActivity: row.last_activity,
    };
  }

  /**
   * Get metadata for multiple sessions at once.
   */
  async getMany(sessionIds: string[]): Promise<Map<string, SessionMetadata>> {
    if (sessionIds.length === 0) {
      return new Map();
    }

    const db = database.getDatabase();
    const placeholders = sessionIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<SessionMetadataRow>(
      `SELECT * FROM session_metadata WHERE session_id IN (${placeholders})`,
      sessionIds
    );

    const map = new Map<string, SessionMetadata>();
    for (const row of rows) {
      map.set(row.session_id, {
        lastAgent: row.last_agent as AgentType | undefined,
        isBusy: row.is_busy === 1,
        lastActivity: row.last_activity,
      });
    }

    return map;
  }

  /**
   * Update the busy status for a session.
   */
  async updateBusyStatus(sessionId: string, isBusy: boolean): Promise<void> {
    const db = database.getDatabase();
    const now = Date.now();

    await db.runAsync(
      `INSERT INTO session_metadata (session_id, is_busy, last_activity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         is_busy = excluded.is_busy,
         last_activity = excluded.last_activity,
         updated_at = excluded.updated_at`,
      [sessionId, isBusy ? 1 : 0, now, now, now]
    );
  }

  /**
   * Update the last agent for a session.
   */
  async updateAgent(sessionId: string, agent: AgentType): Promise<void> {
    const db = database.getDatabase();
    const now = Date.now();

    await db.runAsync(
      `INSERT INTO session_metadata (session_id, last_agent, last_activity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         last_agent = excluded.last_agent,
         last_activity = excluded.last_activity,
         updated_at = excluded.updated_at`,
      [sessionId, agent, now, now, now]
    );
  }

  /**
   * Delete metadata for a session.
   */
  async delete(sessionId: string): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync('DELETE FROM session_metadata WHERE session_id = ?', [sessionId]);
  }

  /**
   * Delete all metadata (for testing/reset).
   */
  async deleteAll(): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync('DELETE FROM session_metadata');
  }

  /**
   * Batch update busy status for multiple sessions (more efficient than individual updates).
   */
  async batchUpdateBusyStatus(sessionIds: string[], isBusy: boolean): Promise<void> {
    if (sessionIds.length === 0) return;

    const db = database.getDatabase();
    const now = Date.now();
    const placeholders = sessionIds.map(() => '?').join(',');

    await db.runAsync(
      `UPDATE session_metadata 
       SET is_busy = ?, last_activity = ?, updated_at = ?
       WHERE session_id IN (${placeholders})`,
      [isBusy ? 1 : 0, now, now, ...sessionIds]
    );
  }

  /**
   * Batch upsert agents for multiple sessions (for backfilling from API).
   */
  async batchUpsertAgents(agentMap: Map<string, AgentType>): Promise<void> {
    if (agentMap.size === 0) return;

    const db = database.getDatabase();
    const now = Date.now();

    // Use individual upserts within a transaction for simplicity
    // SQLite doesn't have a good way to do bulk upserts with different values
    await db.withTransactionAsync(async () => {
      for (const [sessionId, agent] of agentMap.entries()) {
        await db.runAsync(
          `INSERT INTO session_metadata (session_id, last_agent, last_activity, is_busy, created_at, updated_at)
           VALUES (?, ?, ?, 0, ?, ?)
           ON CONFLICT(session_id) DO UPDATE SET
             last_agent = excluded.last_agent,
             last_activity = excluded.last_activity,
             updated_at = excluded.updated_at`,
          [sessionId, agent, now, now, now]
        );
      }
    });
  }
}

export const sessionMetadataRepository = new SessionMetadataRepository();
