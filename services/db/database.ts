import * as SQLite from 'expo-sqlite';

/**
 * Database service for DroidCode.
 * Handles initialization, migrations, and provides access to the database.
 *
 * Ported from: data/local/db/DroidCodeDatabase.kt
 */

const DATABASE_NAME = 'droidcode.db';
const CURRENT_VERSION = 3;

// Migration definitions
interface Migration {
  version: number;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
}

const migrations: Migration[] = [
  {
    version: 1,
    up: async (db) => {
      // Create hosts table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS hosts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          host TEXT NOT NULL,
          port INTEGER NOT NULL DEFAULT 4096,
          is_secure INTEGER NOT NULL DEFAULT 0,
          last_connected INTEGER,
          created_at INTEGER NOT NULL
        );
      `);

      // Create session_preferences table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS session_preferences (
          session_id TEXT PRIMARY KEY,
          host_id INTEGER NOT NULL,
          selected_agent TEXT NOT NULL DEFAULT 'build',
          thinking_mode TEXT NOT NULL DEFAULT 'normal',
          input_text TEXT,
          alias TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE
        );
      `);

      // Create projects table (for multi-project support)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          host_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          directory TEXT NOT NULL,
          port INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          parent_id TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE
        );
      `);

      // Create schema_version table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY
        );
      `);

      await db.runAsync('INSERT INTO schema_version (version) VALUES (?)', 1);
    },
  },
  {
    version: 2,
    up: async (db) => {
      // Add new columns to projects table for full project management
      // Use AUTOINCREMENT for numeric IDs instead of text
      await db.execAsync(`
        -- Create new projects table with proper schema
        CREATE TABLE IF NOT EXISTS projects_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          host_id INTEGER NOT NULL,
          parent_project_id INTEGER,
          manifest_id TEXT,
          name TEXT NOT NULL,
          directory TEXT NOT NULL,
          port INTEGER NOT NULL,
          pid INTEGER,
          status TEXT NOT NULL DEFAULT 'unknown',
          last_connected INTEGER,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_project_id) REFERENCES projects_new(id) ON DELETE CASCADE
        );
      `);

      // Migrate data from old table if it exists and has data
      try {
        await db.execAsync(`
          INSERT INTO projects_new (host_id, name, directory, port, status, created_at)
          SELECT host_id, name, directory, port, status, created_at FROM projects;
        `);
      } catch {
        // Old table may not exist or be empty, that's fine
      }

      // Drop old table and rename new one
      await db.execAsync('DROP TABLE IF EXISTS projects');
      await db.execAsync('ALTER TABLE projects_new RENAME TO projects');

      // Create index for faster lookups
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_projects_host_id ON projects(host_id)');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_projects_parent ON projects(parent_project_id)');
    },
  },
  {
    version: 3,
    up: async (db) => {
      // Create session_metadata table for tracking agent mode and busy status
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS session_metadata (
          session_id TEXT PRIMARY KEY,
          last_agent TEXT,
          is_busy INTEGER NOT NULL DEFAULT 0,
          last_activity INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      // Create index for faster lookups by last_activity
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_session_metadata_activity ON session_metadata(last_activity DESC)');
    },
  },
];

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  private initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

  /**
   * Initialize the database and run migrations.
   * Safe to call multiple times - will only initialize once.
   */
  async init(): Promise<SQLite.SQLiteDatabase> {
    if (this.db) {
      return this.db;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<SQLite.SQLiteDatabase> {
    console.log('[Database] Opening database...');
    this.db = await SQLite.openDatabaseAsync(DATABASE_NAME);

    // Enable foreign keys
    await this.db.execAsync('PRAGMA foreign_keys = ON;');

    // Run migrations
    await this.runMigrations();

    console.log('[Database] Initialization complete');
    return this.db;
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Get current version
    let currentVersion = 0;
    try {
      const result = await this.db.getFirstAsync<{ version: number }>(
        'SELECT version FROM schema_version LIMIT 1'
      );
      currentVersion = result?.version ?? 0;
    } catch {
      // Table doesn't exist yet, that's fine
      currentVersion = 0;
    }

    console.log(`[Database] Current version: ${currentVersion}, target: ${CURRENT_VERSION}`);

    // Run pending migrations
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        console.log(`[Database] Running migration ${migration.version}...`);
        await migration.up(this.db);
        await this.db.runAsync(
          'UPDATE schema_version SET version = ?',
          migration.version
        );
        console.log(`[Database] Migration ${migration.version} complete`);
      }
    }
  }

  /**
   * Get the database instance. Throws if not initialized.
   */
  getDatabase(): SQLite.SQLiteDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
      this.initPromise = null;
    }
  }

  /**
   * Reset the database (for testing or debugging).
   */
  async reset(): Promise<void> {
    if (this.db) {
      await this.db.execAsync('DROP TABLE IF EXISTS session_metadata');
      await this.db.execAsync('DROP TABLE IF EXISTS session_preferences');
      await this.db.execAsync('DROP TABLE IF EXISTS projects');
      await this.db.execAsync('DROP TABLE IF EXISTS hosts');
      await this.db.execAsync('DROP TABLE IF EXISTS schema_version');
      await this.close();
      await this.init();
    }
  }
}

// Export singleton instance
export const database = new DatabaseService();

// Export type for use in repositories
export type { SQLite };
