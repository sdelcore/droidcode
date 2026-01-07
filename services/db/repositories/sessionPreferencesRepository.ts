import { database } from '../database';
import type { AgentType, ThinkingModeType } from '@/types';

/**
 * Repository for SessionPreferences entities.
 * Ported from: data/local/db/dao/SessionPreferencesDao.kt
 */

export interface SessionPreferences {
  sessionId: string;
  hostId: number;
  selectedAgent: AgentType;
  thinkingMode: ThinkingModeType;
  inputText?: string;
  alias?: string;
  createdAt: number;
  updatedAt: number;
}

interface SessionPreferencesRow {
  session_id: string;
  host_id: number;
  selected_agent: string;
  thinking_mode: string;
  input_text: string | null;
  alias: string | null;
  created_at: number;
  updated_at: number;
}

function rowToPreferences(row: SessionPreferencesRow): SessionPreferences {
  return {
    sessionId: row.session_id,
    hostId: row.host_id,
    selectedAgent: row.selected_agent as AgentType,
    thinkingMode: row.thinking_mode as ThinkingModeType,
    inputText: row.input_text ?? undefined,
    alias: row.alias ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class SessionPreferencesRepository {
  /**
   * Get preferences for a session.
   */
  async get(sessionId: string): Promise<SessionPreferences | null> {
    const db = database.getDatabase();
    const row = await db.getFirstAsync<SessionPreferencesRow>(
      'SELECT * FROM session_preferences WHERE session_id = ?',
      sessionId
    );
    return row ? rowToPreferences(row) : null;
  }

  /**
   * Get all preferences for a host.
   */
  async getByHostId(hostId: number): Promise<SessionPreferences[]> {
    const db = database.getDatabase();
    const rows = await db.getAllAsync<SessionPreferencesRow>(
      'SELECT * FROM session_preferences WHERE host_id = ? ORDER BY updated_at DESC',
      hostId
    );
    return rows.map(rowToPreferences);
  }

  /**
   * Insert or update preferences (upsert).
   */
  async upsert(prefs: Omit<SessionPreferences, 'createdAt' | 'updatedAt'>): Promise<void> {
    const db = database.getDatabase();
    const now = Date.now();

    // Check if exists
    const existing = await this.get(prefs.sessionId);

    if (existing) {
      await db.runAsync(
        `UPDATE session_preferences SET
          selected_agent = ?,
          thinking_mode = ?,
          input_text = ?,
          alias = ?,
          updated_at = ?
         WHERE session_id = ?`,
        prefs.selectedAgent,
        prefs.thinkingMode,
        prefs.inputText ?? null,
        prefs.alias ?? null,
        now,
        prefs.sessionId
      );
    } else {
      await db.runAsync(
        `INSERT INTO session_preferences
          (session_id, host_id, selected_agent, thinking_mode, input_text, alias, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        prefs.sessionId,
        prefs.hostId,
        prefs.selectedAgent,
        prefs.thinkingMode,
        prefs.inputText ?? null,
        prefs.alias ?? null,
        now,
        now
      );
    }
  }

  /**
   * Update only the input text (draft).
   */
  async updateInputText(sessionId: string, inputText: string): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync(
      'UPDATE session_preferences SET input_text = ?, updated_at = ? WHERE session_id = ?',
      inputText,
      Date.now(),
      sessionId
    );
  }

  /**
   * Update selected agent.
   */
  async updateAgent(sessionId: string, agent: AgentType): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync(
      'UPDATE session_preferences SET selected_agent = ?, updated_at = ? WHERE session_id = ?',
      agent,
      Date.now(),
      sessionId
    );
  }

  /**
   * Update thinking mode.
   */
  async updateThinkingMode(sessionId: string, mode: ThinkingModeType): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync(
      'UPDATE session_preferences SET thinking_mode = ?, updated_at = ? WHERE session_id = ?',
      mode,
      Date.now(),
      sessionId
    );
  }

  /**
   * Update alias.
   */
  async updateAlias(sessionId: string, alias: string | null): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync(
      'UPDATE session_preferences SET alias = ?, updated_at = ? WHERE session_id = ?',
      alias,
      Date.now(),
      sessionId
    );
  }

  /**
   * Delete preferences for a session.
   */
  async delete(sessionId: string): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync('DELETE FROM session_preferences WHERE session_id = ?', sessionId);
  }

  /**
   * Delete all preferences for a host.
   */
  async deleteByHostId(hostId: number): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync('DELETE FROM session_preferences WHERE host_id = ?', hostId);
  }

  /**
   * Get recent sessions (for quick access).
   */
  async getRecent(limit: number = 10): Promise<SessionPreferences[]> {
    const db = database.getDatabase();
    const rows = await db.getAllAsync<SessionPreferencesRow>(
      'SELECT * FROM session_preferences ORDER BY updated_at DESC LIMIT ?',
      limit
    );
    return rows.map(rowToPreferences);
  }
}

export const sessionPreferencesRepository = new SessionPreferencesRepository();
