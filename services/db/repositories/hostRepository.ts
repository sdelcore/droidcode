import { database } from '../database';
import type { Host } from '@/types';

/**
 * Repository for Host entities.
 * Ported from: data/local/db/dao/HostDao.kt
 */

interface HostRow {
  id: number;
  name: string;
  host: string;
  port: number;
  is_secure: number;
  last_connected: number | null;
  created_at: number;
}

function rowToHost(row: HostRow): Host {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    isSecure: row.is_secure === 1,
    lastConnected: row.last_connected ?? undefined,
    createdAt: row.created_at,
  };
}

class HostRepository {
  /**
   * Get all hosts, ordered by last connected (most recent first).
   */
  async getAll(): Promise<Host[]> {
    const db = database.getDatabase();
    const rows = await db.getAllAsync<HostRow>(
      'SELECT * FROM hosts ORDER BY last_connected DESC NULLS LAST, created_at DESC'
    );
    return rows.map(rowToHost);
  }

  /**
   * Get a host by ID.
   */
  async getById(id: number): Promise<Host | null> {
    const db = database.getDatabase();
    const row = await db.getFirstAsync<HostRow>(
      'SELECT * FROM hosts WHERE id = ?',
      id
    );
    return row ? rowToHost(row) : null;
  }

  /**
   * Insert a new host.
   */
  async insert(host: Omit<Host, 'id' | 'createdAt'>): Promise<number> {
    const db = database.getDatabase();
    const now = Date.now();
    const result = await db.runAsync(
      `INSERT INTO hosts (name, host, port, is_secure, last_connected, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      host.name,
      host.host,
      host.port,
      host.isSecure ? 1 : 0,
      host.lastConnected ?? null,
      now
    );
    return result.lastInsertRowId;
  }

  /**
   * Update an existing host.
   */
  async update(id: number, updates: Partial<Omit<Host, 'id' | 'createdAt'>>): Promise<void> {
    const db = database.getDatabase();

    const setParts: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.name !== undefined) {
      setParts.push('name = ?');
      values.push(updates.name);
    }
    if (updates.host !== undefined) {
      setParts.push('host = ?');
      values.push(updates.host);
    }
    if (updates.port !== undefined) {
      setParts.push('port = ?');
      values.push(updates.port);
    }
    if (updates.isSecure !== undefined) {
      setParts.push('is_secure = ?');
      values.push(updates.isSecure ? 1 : 0);
    }
    if (updates.lastConnected !== undefined) {
      setParts.push('last_connected = ?');
      values.push(updates.lastConnected ?? null);
    }

    if (setParts.length === 0) return;

    values.push(id);
    await db.runAsync(
      `UPDATE hosts SET ${setParts.join(', ')} WHERE id = ?`,
      ...values
    );
  }

  /**
   * Update last connected timestamp.
   */
  async updateLastConnected(id: number): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync(
      'UPDATE hosts SET last_connected = ? WHERE id = ?',
      Date.now(),
      id
    );
  }

  /**
   * Delete a host by ID.
   */
  async delete(id: number): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync('DELETE FROM hosts WHERE id = ?', id);
  }

  /**
   * Delete all hosts.
   */
  async deleteAll(): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync('DELETE FROM hosts');
  }

  /**
   * Check if a host with the same host:port exists.
   */
  async exists(host: string, port: number): Promise<boolean> {
    const db = database.getDatabase();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM hosts WHERE host = ? AND port = ?',
      host,
      port
    );
    return (result?.count ?? 0) > 0;
  }
}

export const hostRepository = new HostRepository();
