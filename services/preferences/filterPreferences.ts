import AsyncStorage from '@react-native-async-storage/async-storage'

import type {
  SessionFilters,
  SerializedSessionFilters,
} from '@/types/domain'
import {
  DEFAULT_SESSION_FILTERS,
  serializeFilters,
  deserializeFilters,
} from '@/types/domain'

const FILTER_PREFERENCES_KEY = '@droidcode/filter_preferences'

/**
 * Service for persisting session filter preferences to AsyncStorage.
 * Preferences are stored globally (not per-project) and persist across app restarts.
 */
export const filterPreferencesService = {
  /**
   * Load saved filter preferences from storage.
   * Returns default filters if none are saved or if there's an error.
   */
  async load(): Promise<SessionFilters> {
    try {
      const json = await AsyncStorage.getItem(FILTER_PREFERENCES_KEY)
      if (!json) {
        return { ...DEFAULT_SESSION_FILTERS, agents: new Set(), statuses: new Set() }
      }

      const serialized: SerializedSessionFilters = JSON.parse(json)
      return deserializeFilters(serialized)
    } catch (error) {
      console.error('[FilterPreferences] Failed to load preferences:', error)
      return { ...DEFAULT_SESSION_FILTERS, agents: new Set(), statuses: new Set() }
    }
  },

  /**
   * Save filter preferences to storage.
   */
  async save(filters: SessionFilters): Promise<void> {
    try {
      const serialized = serializeFilters(filters)
      const json = JSON.stringify(serialized)
      await AsyncStorage.setItem(FILTER_PREFERENCES_KEY, json)
    } catch (error) {
      console.error('[FilterPreferences] Failed to save preferences:', error)
    }
  },

  /**
   * Clear saved filter preferences.
   */
  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(FILTER_PREFERENCES_KEY)
    } catch (error) {
      console.error('[FilterPreferences] Failed to clear preferences:', error)
    }
  },
}
