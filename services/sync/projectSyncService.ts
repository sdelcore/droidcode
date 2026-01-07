/**
 * Project Sync Service
 *
 * Manages bidirectional synchronization between local SQLite database and
 * server-side ~/.opencode/droidcode.json config file.
 *
 * The server config is the source of truth for port assignments, ensuring
 * all devices connecting to the same host use consistent port mappings.
 */

import { apiClient } from '@/services/api/apiClient';
import { createLogger } from '@/services/debug/logger';
import type { Project } from '@/types';
import {
  CONFIG_SCHEMA_VERSION,
  CONFIG_PATH,
  SyncError,
  SyncErrorCode,
  type DroidCodeServerConfig,
  type SyncedProjectConfig,
  type SyncResult,
} from '@/types/sync';

const logger = createLogger('ProjectSync');

// Debounce time for writes (ms)
const WRITE_DEBOUNCE_MS = 2000;

// Max retries for operations
const MAX_RETRIES = 3;

// Retry backoff base (ms)
const RETRY_BACKOFF_BASE_MS = 500;

/**
 * Project Sync Service - manages bidirectional sync between
 * local SQLite and server-side ~/.opencode/droidcode.json
 */
class ProjectSyncService {
  // Cache manager sessions per host for shell command execution
  private managerSessions: Map<number, string> = new Map();

  // Debounce timers for writes
  private writeTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  // In-flight read operations to prevent duplicate requests
  private pendingReads: Map<number, Promise<DroidCodeServerConfig | null>> = new Map();

  // Cached config per host (for quick access during writes)
  private configCache: Map<number, DroidCodeServerConfig> = new Map();

  /**
   * Read the config file from the server.
   * Returns null if file doesn't exist or is malformed.
   */
  async readConfig(hostId: number): Promise<DroidCodeServerConfig | null> {
    // Prevent duplicate concurrent reads
    const pending = this.pendingReads.get(hostId);
    if (pending) {
      return pending;
    }

    const readPromise = this.doReadConfig(hostId);
    this.pendingReads.set(hostId, readPromise);

    try {
      const result = await readPromise;
      if (result) {
        this.configCache.set(hostId, result);
      }
      return result;
    } finally {
      this.pendingReads.delete(hostId);
    }
  }

  /**
   * Internal method to read config with retries.
   */
  private async doReadConfig(hostId: number): Promise<DroidCodeServerConfig | null> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const sessionId = await this.getManagerSession(hostId);

        // Use cat with error handling - returns marker if file doesn't exist
        const command = `cat ${CONFIG_PATH} 2>/dev/null || echo "DROIDCODE_NO_CONFIG"`;
        const output = await apiClient.runShellCommand(hostId, sessionId, command);

        if (output.includes('DROIDCODE_NO_CONFIG') || !output.trim()) {
          logger.info('No config file found on server');
          return null;
        }

        const config = JSON.parse(output) as DroidCodeServerConfig;

        // Validate schema version
        if (config.version !== CONFIG_SCHEMA_VERSION) {
          logger.warn(`Config version mismatch: ${config.version} vs ${CONFIG_SCHEMA_VERSION}`);
          // Future: implement migration
        }

        const projectCount = Object.keys(config.projects || {}).length;
        logger.info(`Read config with ${projectCount} projects`);
        return config;
      } catch (error) {
        lastError = error as Error;

        // Check if it's a JSON parse error
        if (error instanceof SyntaxError) {
          logger.error(`Config file is malformed JSON: ${error.message}`);
          // Malformed config - we'll treat as no config and let it be recreated
          return null;
        }

        // Exponential backoff for retries
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * RETRY_BACKOFF_BASE_MS;
          logger.warn(`Read attempt ${attempt} failed, retrying in ${delay}ms: ${lastError.message}`);
          await this.sleep(delay);

          // Clear session cache on repeated failures (might be expired)
          if (attempt >= 2) {
            this.managerSessions.delete(hostId);
          }
        }
      }
    }

    logger.error(`Failed to read config after ${MAX_RETRIES} attempts: ${lastError?.message}`);
    return null;
  }

  /**
   * Write the config file to the server atomically.
   * Creates the ~/.opencode directory if it doesn't exist.
   */
  async writeConfig(hostId: number, config: DroidCodeServerConfig): Promise<boolean> {
    try {
      const sessionId = await this.getManagerSession(hostId);

      // Update lastSyncAt timestamp
      config.lastSyncAt = Date.now();

      // Serialize config as single line to avoid shell escaping issues
      const jsonContent = JSON.stringify(config);

      logger.info(`Writing config with ${Object.keys(config.projects).length} projects`);

      // Escape for shell: use single quotes and escape single quotes within
      const escapedJson = jsonContent.replace(/'/g, "'\\''");

      // Write atomically using echo with single quotes
      // First just write the file, then verify it was written
      const writeCommand = `mkdir -p $HOME/.opencode && echo '${escapedJson}' > ${CONFIG_PATH}.tmp && mv ${CONFIG_PATH}.tmp ${CONFIG_PATH}`;

      await apiClient.runShellCommand(hostId, sessionId, writeCommand);

      // Verify the file was written by reading it back
      const verifyCommand = `cat ${CONFIG_PATH} 2>/dev/null | head -c 50 || echo "DROIDCODE_NOT_FOUND"`;
      const verifyOutput = await apiClient.runShellCommand(hostId, sessionId, verifyCommand);

      if (verifyOutput && !verifyOutput.includes('DROIDCODE_NOT_FOUND')) {
        logger.info('Config written and verified successfully');
        this.configCache.set(hostId, config);
        return true;
      }

      logger.error(`Config write failed - verification: ${verifyOutput}`);
      return false;
    } catch (error) {
      logger.error(`Failed to write config: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  /**
   * Schedule a debounced write to prevent excessive writes during rapid changes.
   */
  scheduleWrite(hostId: number, config: DroidCodeServerConfig): void {
    // Cancel existing timer
    const existingTimer = this.writeTimers.get(hostId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new write
    const timer = setTimeout(async () => {
      this.writeTimers.delete(hostId);
      await this.writeConfig(hostId, config);
    }, WRITE_DEBOUNCE_MS);

    this.writeTimers.set(hostId, timer);
  }

  /**
   * Main sync method - reconciles local and server state.
   * Server config is the source of truth for port assignments.
   */
  async syncProjects(hostId: number, localProjects: Project[]): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      syncedProjects: [],
      localOnlyProjects: [],
      errors: [],
      configCreated: false,
    };

    try {
      // 1. Read server config
      let serverConfig = await this.readConfig(hostId);

      // 2. If no server config, create from local projects
      // Only write if we actually have local projects to seed with
      if (!serverConfig) {
        if (localProjects.length > 0) {
          serverConfig = this.createConfigFromLocalProjects(localProjects);
          result.configCreated = true;

          // Write initial config to server
          const writeSuccess = await this.writeConfig(hostId, serverConfig);
          if (!writeSuccess) {
            result.errors.push('Failed to write initial config to server');
          }
        } else {
          // No server config and no local projects - create empty config in memory only
          // Don't write to server to avoid overwriting a config that failed to read
          logger.info('No server config and no local projects - skipping write');
          serverConfig = {
            version: CONFIG_SCHEMA_VERSION,
            lastSyncAt: Date.now(),
            projects: {},
          };
        }
      }

      // 3. Extract synced projects from server config
      result.syncedProjects = Object.values(serverConfig.projects);

      // 4. Find local-only projects (exist locally but not on server)
      const serverDirectories = new Set(
        Object.keys(serverConfig.projects)
      );

      for (const localProject of localProjects) {
        if (!serverDirectories.has(localProject.directory)) {
          result.localOnlyProjects.push(localProject);
        }
      }

      // 5. If there are local-only projects, add them to server config
      if (result.localOnlyProjects.length > 0) {
        logger.info(`Found ${result.localOnlyProjects.length} local-only projects, adding to server config`);

        for (const localProject of result.localOnlyProjects) {
          const syncedProject = this.projectToSyncedConfig(localProject);
          serverConfig.projects[localProject.directory] = syncedProject;
          result.syncedProjects.push(syncedProject);
        }

        // Schedule write with updated config
        this.scheduleWrite(hostId, serverConfig);
        result.localOnlyProjects = []; // They're now synced
      }

      result.success = true;
      logger.info(`Sync completed: ${result.syncedProjects.length} projects`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      result.errors.push(message);
      logger.error(`Sync failed: ${message}`);
      return result;
    }
  }

  /**
   * Add or update a project in the server config.
   * Used when creating new projects locally.
   */
  async upsertProject(hostId: number, project: SyncedProjectConfig): Promise<boolean> {
    try {
      // Get current config or create new one
      let config = this.configCache.get(hostId) || await this.readConfig(hostId);

      if (!config) {
        config = {
          version: CONFIG_SCHEMA_VERSION,
          lastSyncAt: Date.now(),
          projects: {},
        };
      }

      // Update project
      config.projects[project.directory] = {
        ...project,
        updatedAt: Date.now(),
      };

      // Write back
      return await this.writeConfig(hostId, config);
    } catch (error) {
      logger.error(`Failed to upsert project: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  /**
   * Remove a project from the server config.
   * Used when deleting projects locally.
   */
  async removeProject(hostId: number, directory: string): Promise<boolean> {
    try {
      let config = this.configCache.get(hostId) || await this.readConfig(hostId);

      if (!config) {
        logger.info('No config to remove project from');
        return true;
      }

      if (config.projects[directory]) {
        delete config.projects[directory];
        return await this.writeConfig(hostId, config);
      }

      return true;
    } catch (error) {
      logger.error(`Failed to remove project: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  /**
   * Check if a server is running on the given port.
   */
  async checkServerHealth(hostId: number, port: number): Promise<boolean> {
    try {
      await apiClient.checkHealthOnPort(hostId, port);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get port for a directory from server config.
   * Returns null if directory not in config.
   */
  async getPortForDirectory(hostId: number, directory: string): Promise<number | null> {
    const config = this.configCache.get(hostId) || await this.readConfig(hostId);

    if (!config?.projects[directory]) {
      return null;
    }

    return config.projects[directory].port;
  }

  // In-memory reserved ports to prevent race conditions during spawn
  private reservedPorts: Map<number, Set<number>> = new Map();

  /**
   * Allocate and reserve a new port that doesn't conflict with server config.
   * Returns first available port in 4100-4199 range.
   *
   * IMPORTANT: This immediately reserves the port in memory to prevent
   * race conditions when multiple projects are spawned quickly.
   * Call releasePortReservation() if spawn fails.
   */
  async allocatePort(hostId: number, directory: string): Promise<number> {
    const config = this.configCache.get(hostId) || await this.readConfig(hostId);

    const usedPorts = new Set<number>();

    // Add ports from server config
    if (config) {
      for (const project of Object.values(config.projects)) {
        usedPorts.add(project.port);
      }
    }

    // Add in-memory reserved ports (prevents race conditions)
    const reserved = this.reservedPorts.get(hostId);
    if (reserved) {
      for (const port of reserved) {
        usedPorts.add(port);
      }
    }

    // Find first available port in range 4100-4199
    for (let port = 4100; port < 4200; port++) {
      if (!usedPorts.has(port)) {
        // Reserve this port immediately
        this.reservePort(hostId, port);
        logger.info(`Allocated and reserved port ${port} for ${directory}`);
        return port;
      }
    }

    throw new SyncError(
      'All ports in range 4100-4199 are in use',
      SyncErrorCode.NETWORK_ERROR,
      false
    );
  }

  /**
   * Reserve a port in memory (prevents race conditions during spawn).
   */
  private reservePort(hostId: number, port: number): void {
    let reserved = this.reservedPorts.get(hostId);
    if (!reserved) {
      reserved = new Set();
      this.reservedPorts.set(hostId, reserved);
    }
    reserved.add(port);
  }

  /**
   * Release a port reservation (call on spawn failure).
   */
  releasePortReservation(hostId: number, port: number): void {
    const reserved = this.reservedPorts.get(hostId);
    if (reserved) {
      reserved.delete(port);
      logger.info(`Released port reservation: ${port}`);
    }
  }

  /**
   * Clear port reservation after successful upsert (port now in config).
   */
  clearPortReservation(hostId: number, port: number): void {
    const reserved = this.reservedPorts.get(hostId);
    if (reserved) {
      reserved.delete(port);
    }
  }

  /**
   * Generate a stable project ID from directory path.
   */
  generateProjectId(directory: string): string {
    // Simple hash function for ID generation
    let hash = 0;
    for (let i = 0; i < directory.length; i++) {
      const char = directory.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `proj_${Math.abs(hash).toString(16).padStart(8, '0')}`;
  }

  /**
   * Convert a local Project to SyncedProjectConfig.
   */
  projectToSyncedConfig(project: Project): SyncedProjectConfig {
    return {
      id: this.generateProjectId(project.directory),
      name: project.name,
      directory: project.directory,
      port: project.port,
      createdAt: project.createdAt,
      updatedAt: Date.now(),
    };
  }

  /**
   * Create a new config from local projects.
   */
  private createConfigFromLocalProjects(localProjects: Project[]): DroidCodeServerConfig {
    const config: DroidCodeServerConfig = {
      version: CONFIG_SCHEMA_VERSION,
      lastSyncAt: Date.now(),
      projects: {},
    };

    for (const project of localProjects) {
      config.projects[project.directory] = this.projectToSyncedConfig(project);
    }

    return config;
  }

  /**
   * Get or create a manager session for shell commands on the main host.
   */
  private async getManagerSession(hostId: number): Promise<string> {
    const cached = this.managerSessions.get(hostId);
    if (cached) {
      // Verify session still exists
      try {
        await apiClient.getSession(hostId, cached);
        return cached;
      } catch {
        // Session no longer valid, create new one
        this.managerSessions.delete(hostId);
      }
    }

    // Create new manager session
    const session = await apiClient.createSession(hostId);
    this.managerSessions.set(hostId, session.id);
    logger.info(`Created manager session: ${session.id}`);
    return session.id;
  }

  /**
   * Clear cached session for a host (e.g., on disconnect).
   */
  clearSession(hostId: number): void {
    this.managerSessions.delete(hostId);
  }

  /**
   * Clear all cached data for a host.
   */
  clearCache(hostId: number): void {
    this.managerSessions.delete(hostId);
    this.configCache.delete(hostId);
    this.pendingReads.delete(hostId);
    this.reservedPorts.delete(hostId);

    const timer = this.writeTimers.get(hostId);
    if (timer) {
      clearTimeout(timer);
      this.writeTimers.delete(hostId);
    }
  }

  /**
   * Sleep helper for retries.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const projectSyncService = new ProjectSyncService();
