import { database } from '../database'

/**
 * Repository for ModelPreferences entities.
 * Stores default model selection per host and optional per-session overrides.
 */

export interface ModelPreference {
  id: number
  hostId: number
  sessionId: string | null  // null = global default for host
  providerId: string
  modelId: string
  createdAt: number
  updatedAt: number
}

interface ModelPreferenceRow {
  id: number
  host_id: number
  session_id: string | null
  provider_id: string
  model_id: string
  created_at: number
  updated_at: number
}

function rowToPreference(row: ModelPreferenceRow): ModelPreference {
  return {
    id: row.id,
    hostId: row.host_id,
    sessionId: row.session_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

class ModelPreferencesRepository {
  /**
   * Get global default model for a host.
   * Returns the preference with session_id = NULL.
   */
  async getGlobalDefault(hostId: number): Promise<ModelPreference | null> {
    const db = database.getDatabase()
    const row = await db.getFirstAsync<ModelPreferenceRow>(
      'SELECT * FROM model_preferences WHERE host_id = ? AND session_id IS NULL',
      hostId
    )
    return row ? rowToPreference(row) : null
  }

  /**
   * Set global default model for a host.
   * Creates or updates the preference with session_id = NULL.
   */
  async setGlobalDefault(hostId: number, providerId: string, modelId: string): Promise<void> {
    const db = database.getDatabase()
    const now = Date.now()

    // Check if global default exists
    const existing = await this.getGlobalDefault(hostId)

    if (existing) {
      await db.runAsync(
        `UPDATE model_preferences SET
          provider_id = ?,
          model_id = ?,
          updated_at = ?
         WHERE host_id = ? AND session_id IS NULL`,
        providerId,
        modelId,
        now,
        hostId
      )
    } else {
      await db.runAsync(
        `INSERT INTO model_preferences
          (host_id, session_id, provider_id, model_id, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?)`,
        hostId,
        providerId,
        modelId,
        now,
        now
      )
    }
  }

  /**
   * Get session-specific model override.
   * Returns the preference with specific session_id.
   */
  async getSessionOverride(sessionId: string): Promise<ModelPreference | null> {
    const db = database.getDatabase()
    const row = await db.getFirstAsync<ModelPreferenceRow>(
      'SELECT * FROM model_preferences WHERE session_id = ?',
      sessionId
    )
    return row ? rowToPreference(row) : null
  }

  /**
   * Set session-specific model override.
   * Creates or updates the preference for a specific session.
   */
  async setSessionOverride(
    hostId: number,
    sessionId: string,
    providerId: string,
    modelId: string
  ): Promise<void> {
    const db = database.getDatabase()
    const now = Date.now()

    // Check if session override exists
    const existing = await this.getSessionOverride(sessionId)

    if (existing) {
      await db.runAsync(
        `UPDATE model_preferences SET
          provider_id = ?,
          model_id = ?,
          updated_at = ?
         WHERE session_id = ?`,
        providerId,
        modelId,
        now,
        sessionId
      )
    } else {
      await db.runAsync(
        `INSERT INTO model_preferences
          (host_id, session_id, provider_id, model_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        hostId,
        sessionId,
        providerId,
        modelId,
        now,
        now
      )
    }
  }

  /**
   * Clear session-specific override, reverting to global default.
   */
  async clearSessionOverride(sessionId: string): Promise<void> {
    const db = database.getDatabase()
    await db.runAsync('DELETE FROM model_preferences WHERE session_id = ?', sessionId)
  }

  /**
   * Get the effective model preference for a session.
   * First checks for session override, then falls back to global default.
   */
  async getEffectivePreference(
    hostId: number,
    sessionId: string | null
  ): Promise<ModelPreference | null> {
    // Check for session override first
    if (sessionId) {
      const sessionPref = await this.getSessionOverride(sessionId)
      if (sessionPref) return sessionPref
    }

    // Fall back to global default
    return this.getGlobalDefault(hostId)
  }

  /**
   * Delete all preferences for a host.
   */
  async deleteByHostId(hostId: number): Promise<void> {
    const db = database.getDatabase()
    await db.runAsync('DELETE FROM model_preferences WHERE host_id = ?', hostId)
  }

  /**
   * Get all session overrides for a host (for debugging/management).
   */
  async getSessionOverrides(hostId: number): Promise<ModelPreference[]> {
    const db = database.getDatabase()
    const rows = await db.getAllAsync<ModelPreferenceRow>(
      'SELECT * FROM model_preferences WHERE host_id = ? AND session_id IS NOT NULL ORDER BY updated_at DESC',
      hostId
    )
    return rows.map(rowToPreference)
  }
}

export const modelPreferencesRepository = new ModelPreferencesRepository()
