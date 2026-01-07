import { database } from '../database';
import type { Project, ProjectStatus } from '@/types';

/**
 * Repository for Project entities.
 * Ported from: data/local/db/dao/ProjectDao.kt
 */

interface ProjectRow {
  id: number;
  host_id: number;
  name: string;
  directory: string;
  port: number;
  pid: number | null;
  status: string;
  last_connected: number | null;
  created_at: number;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    hostId: row.host_id,
    name: row.name,
    directory: row.directory,
    port: row.port,
    pid: row.pid ?? undefined,
    status: row.status as ProjectStatus,
    lastConnected: row.last_connected ?? undefined,
    createdAt: row.created_at,
  };
}

class ProjectRepository {
  /**
   * Get all projects for a host, ordered by last connected date.
   */
  async getByHost(hostId: number): Promise<Project[]> {
    const db = database.getDatabase();
    const rows = await db.getAllAsync<ProjectRow>(
      `SELECT * FROM projects
       WHERE host_id = ?
       ORDER BY last_connected DESC NULLS LAST, created_at DESC`,
      hostId
    );
    return rows.map(rowToProject);
  }

  /**
   * Get a project by ID.
   */
  async getById(id: number): Promise<Project | null> {
    const db = database.getDatabase();
    const row = await db.getFirstAsync<ProjectRow>(
      'SELECT * FROM projects WHERE id = ?',
      id
    );
    return row ? rowToProject(row) : null;
  }

  /**
   * Get a project by port.
   */
  async getByPort(hostId: number, port: number): Promise<Project | null> {
    const db = database.getDatabase();
    const row = await db.getFirstAsync<ProjectRow>(
      'SELECT * FROM projects WHERE host_id = ? AND port = ?',
      hostId,
      port
    );
    return row ? rowToProject(row) : null;
  }

  /**
   * Insert a new project.
   */
  async insert(project: Omit<Project, 'id'>): Promise<number> {
    const db = database.getDatabase();
    const result = await db.runAsync(
      `INSERT INTO projects
       (host_id, name, directory, port, pid, status, last_connected, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      project.hostId,
      project.name,
      project.directory,
      project.port,
      project.pid ?? null,
      project.status,
      project.lastConnected ?? null,
      project.createdAt
    );
    return result.lastInsertRowId;
  }

  /**
   * Update an existing project.
   */
  async update(id: number, updates: Partial<Omit<Project, 'id' | 'hostId' | 'createdAt'>>): Promise<void> {
    const db = database.getDatabase();

    const setParts: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.name !== undefined) {
      setParts.push('name = ?');
      values.push(updates.name);
    }
    if (updates.directory !== undefined) {
      setParts.push('directory = ?');
      values.push(updates.directory);
    }
    if (updates.port !== undefined) {
      setParts.push('port = ?');
      values.push(updates.port);
    }
    if (updates.pid !== undefined) {
      setParts.push('pid = ?');
      values.push(updates.pid ?? null);
    }
    if (updates.status !== undefined) {
      setParts.push('status = ?');
      values.push(updates.status);
    }
    if (updates.lastConnected !== undefined) {
      setParts.push('last_connected = ?');
      values.push(updates.lastConnected ?? null);
    }

    if (setParts.length === 0) return;

    values.push(id);
    await db.runAsync(
      `UPDATE projects SET ${setParts.join(', ')} WHERE id = ?`,
      ...values
    );
  }

  /**
   * Update project status and optionally PID.
   */
  async updateStatus(id: number, status: ProjectStatus, pid?: number): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync(
      'UPDATE projects SET status = ?, pid = ? WHERE id = ?',
      status,
      pid ?? null,
      id
    );
  }

  /**
   * Update last connected timestamp.
   */
  async updateLastConnected(id: number): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync(
      'UPDATE projects SET last_connected = ? WHERE id = ?',
      Date.now(),
      id
    );
  }

  /**
   * Delete a project by ID.
   */
  async delete(id: number): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync('DELETE FROM projects WHERE id = ?', id);
  }

  /**
   * Delete all projects for a host.
   */
  async deleteByHost(hostId: number): Promise<void> {
    const db = database.getDatabase();
    await db.runAsync('DELETE FROM projects WHERE host_id = ?', hostId);
  }

  /**
   * Get all used ports for a host.
   */
  async getUsedPorts(hostId: number): Promise<number[]> {
    const db = database.getDatabase();
    const rows = await db.getAllAsync<{ port: number }>(
      'SELECT port FROM projects WHERE host_id = ?',
      hostId
    );
    return rows.map((r) => r.port);
  }

  /**
   * Allocate the next available port for a project.
   * Uses port range 4100-4199, finding the first unused port.
   */
  async allocatePort(hostId: number): Promise<number> {
    const BASE_PORT = 4100;
    const MAX_PORT = 4199;
    const usedPorts = await this.getUsedPorts(hostId);

    for (let port = BASE_PORT; port <= MAX_PORT; port++) {
      if (!usedPorts.includes(port)) {
        return port;
      }
    }

    throw new Error('No available ports in range 4100-4199');
  }

  /**
   * Check if a project with the given directory exists for this host.
   */
  async existsByDirectory(hostId: number, directory: string): Promise<boolean> {
    const db = database.getDatabase();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM projects WHERE host_id = ? AND directory = ?',
      hostId,
      directory
    );
    return (result?.count ?? 0) > 0;
  }
}

export const projectRepository = new ProjectRepository();
