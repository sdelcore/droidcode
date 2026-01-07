import { create } from 'zustand';
import type { Project, ProjectStatus, SyncedProjectConfig } from '@/types';
import { projectRepository } from '@/services/db/repositories/projectRepository';
import { apiClient } from '@/services/api/apiClient';
import { debugLogManager } from '@/services/debug/debugLogManager';
import { sseConnectionManager } from '@/services/sse/sseConnectionManager';
import { projectSyncService } from '@/services/sync';
import { useHostStore } from './hostStore';

/**
 * Project store - manages OpenCode project instances.
 *
 * Uses SQLite for persistence via projectRepository.
 * Projects represent OpenCode server instances running on different ports.
 */

// Cache manager sessions per host for shell command execution
const managerSessions: Map<number, string> = new Map();

/**
 * Get or create a manager session for shell commands on the main host.
 */
async function getManagerSession(hostId: number): Promise<string> {
  const cached = managerSessions.get(hostId);
  if (cached) {
    // Verify session still exists
    try {
      await apiClient.getSession(hostId, cached);
      return cached;
    } catch {
      // Session no longer valid, create new one
      managerSessions.delete(hostId);
    }
  }

  // Create new manager session
  const session = await apiClient.createSession(hostId);
  managerSessions.set(hostId, session.id);
  debugLogManager.info('ProjectStore', `Created manager session: ${session.id}`);
  return session.id;
}

interface ProjectState {
  projects: Project[];
  selectedProjectId: number | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: (hostId: number) => Promise<void>;
  loadProjects: (hostId: number) => Promise<void>;
  addProject: (project: Omit<Project, 'id'>) => Promise<number>;
  updateProject: (id: number, updates: Partial<Project>) => Promise<void>;
  removeProject: (id: number) => Promise<void>;
  selectProject: (id: number | null) => void;
  updateLastConnected: (id: number) => Promise<void>;
  updateStatus: (id: number, status: ProjectStatus, pid?: number) => Promise<void>;
  spawnProject: (hostId: number, name: string, directory: string) => Promise<number>;
  stopProject: (id: number) => Promise<void>;
  checkHealth: (id: number) => Promise<ProjectStatus>;
  refresh: (hostId: number) => Promise<void>;
  reset: () => void;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  selectedProjectId: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: async (hostId: number) => {
    if (get().isInitialized) return;
    await get().loadProjects(hostId);
    set({ isInitialized: true });
  },

  loadProjects: async (hostId: number) => {
    set({ isLoading: true, error: null });

    try {
      // 1. First, load cached projects from local DB (instant UI)
      const localProjects = await projectRepository.getByHost(hostId);

      // Stale-while-revalidate: show cached data immediately
      set({
        projects: localProjects,
        isLoading: false,
      });

      // 2. Sync with server config in background (non-blocking)
      // Server config is the source of truth for port assignments
      const syncResult = await projectSyncService.syncProjects(hostId, localProjects);

      if (syncResult.success && syncResult.syncedProjects.length > 0) {
        // 3. Update local DB with server config (server wins for ports)
        const updatedProjects: Project[] = [];

        for (const serverProject of syncResult.syncedProjects) {
          // Check if project exists locally
          const existingLocal = localProjects.find(
            (p) => p.directory === serverProject.directory
          );

          if (existingLocal) {
            // Update local project with server port if different
            if (existingLocal.port !== serverProject.port || existingLocal.name !== serverProject.name) {
              debugLogManager.info('ProjectStore', `Updating project ${existingLocal.id} port ${existingLocal.port} -> ${serverProject.port}`);
              await projectRepository.update(existingLocal.id, {
                port: serverProject.port,
                name: serverProject.name,
              });
            }
            updatedProjects.push({
              ...existingLocal,
              port: serverProject.port,
              name: serverProject.name,
            });
          } else {
            // Create local entry for server-only project
            debugLogManager.info('ProjectStore', `Creating local record for server project: ${serverProject.directory}`);
            const newId = await projectRepository.insert({
              hostId,
              name: serverProject.name,
              directory: serverProject.directory,
              port: serverProject.port,
              status: 'unknown',
              createdAt: serverProject.createdAt,
            });
            updatedProjects.push({
              id: newId,
              hostId,
              name: serverProject.name,
              directory: serverProject.directory,
              port: serverProject.port,
              status: 'unknown' as ProjectStatus,
              createdAt: serverProject.createdAt,
            });
          }
        }

        // Update UI with synced projects
        set({ projects: updatedProjects });

        // 4. Health check all projects to update status (non-blocking)
        const host = useHostStore.getState().hosts.find((h) => h.id === hostId);
        if (host) {
          for (const project of updatedProjects) {
            // Fire and forget - don't block UI
            get().checkHealth(project.id).catch((err) => {
              debugLogManager.error('ProjectStore', `Health check failed for project ${project.id}: ${err}`);
            });
          }

          // 5. Establish SSE connections for projects that appear to be running
          const runningProjects = updatedProjects.filter((p) => p.status === 'running');
          for (const project of runningProjects) {
            const projectUrl = `${host.isSecure ? 'https' : 'http'}://${host.host}:${project.port}`;

            // Connect to per-session SSE endpoint (/event)
            sseConnectionManager.connectAsync(`project-${project.id}`, projectUrl)
              .then(() => {
                debugLogManager.info('ProjectStore', `SSE connected for running project ${project.id}`);
              })
              .catch((err) => {
                debugLogManager.error('ProjectStore', `SSE connection failed for running project ${project.id}: ${err}`);
              });

            // Connect to global SSE endpoint (/global/event) for session lifecycle events
            sseConnectionManager.connectAsync(`project-${project.id}-global`, projectUrl, '/global/event')
              .then(() => {
                debugLogManager.info('ProjectStore', `Global SSE connected for running project ${project.id}`);
              })
              .catch((err) => {
                debugLogManager.error('ProjectStore', `Global SSE connection failed for running project ${project.id}: ${err}`);
              });
          }
        }
      } else {
        // Sync failed or no server projects - just health check local projects
        const host = useHostStore.getState().hosts.find((h) => h.id === hostId);
        if (host) {
          for (const project of localProjects) {
            get().checkHealth(project.id).catch((err) => {
              debugLogManager.error('ProjectStore', `Health check failed for project ${project.id}: ${err}`);
            });
          }

          const runningProjects = localProjects.filter((p) => p.status === 'running');
          for (const project of runningProjects) {
            const projectUrl = `${host.isSecure ? 'https' : 'http'}://${host.host}:${project.port}`;

            sseConnectionManager.connectAsync(`project-${project.id}`, projectUrl)
              .then(() => {
                debugLogManager.info('ProjectStore', `SSE connected for running project ${project.id}`);
              })
              .catch((err) => {
                debugLogManager.error('ProjectStore', `SSE connection failed for running project ${project.id}: ${err}`);
              });

            sseConnectionManager.connectAsync(`project-${project.id}-global`, projectUrl, '/global/event')
              .then(() => {
                debugLogManager.info('ProjectStore', `Global SSE connected for running project ${project.id}`);
              })
              .catch((err) => {
                debugLogManager.error('ProjectStore', `Global SSE connection failed for running project ${project.id}: ${err}`);
              });
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load projects';
      set({ error: message, isLoading: false });
    }
  },

  addProject: async (projectData) => {
    set({ isLoading: true, error: null });

    try {
      const id = await projectRepository.insert(projectData);
      await get().loadProjects(projectData.hostId);
      return id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add project';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  updateProject: async (id, updates) => {
    set({ isLoading: true, error: null });

    try {
      await projectRepository.update(id, updates);
      // Refresh local state
      const project = await projectRepository.getById(id);
      if (project) {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
          isLoading: false,
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update project';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  removeProject: async (id) => {
    set({ isLoading: true, error: null });

    try {
      // Get project to know its directory for server config removal
      const project = get().projects.find((p) => p.id === id);

      // Remove from local DB
      await projectRepository.delete(id);

      // Remove from server config (fire and forget - don't block UI)
      if (project) {
        projectSyncService.removeProject(project.hostId, project.directory).catch((err) => {
          debugLogManager.error('ProjectStore', `Failed to remove project from server config: ${err}`);
        });
      }

      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
        isLoading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove project';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  selectProject: (id) => {
    set({ selectedProjectId: id });
  },

  updateLastConnected: async (id) => {
    try {
      await projectRepository.updateLastConnected(id);
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, lastConnected: Date.now() } : p
        ),
      }));
    } catch (error) {
      console.error('Failed to update last connected:', error);
    }
  },

  updateStatus: async (id, status, pid) => {
    try {
      await projectRepository.updateStatus(id, status, pid);
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, status, pid } : p
        ),
      }));
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  },

  spawnProject: async (hostId, name, directory) => {
    set({ isLoading: true, error: null });

    let projectId: number | null = null;
    let port: number | null = null;
    let existingInConfig = false;

    try {
      // 1. Check server config for existing port assignment (server is source of truth)
      port = await projectSyncService.getPortForDirectory(hostId, directory);
      existingInConfig = port !== null;

      if (port) {
        debugLogManager.info('ProjectStore', `Using existing port ${port} from server config for "${name}"`);
      } else {
        // New project - allocate and reserve port from server config
        // Port is reserved immediately to prevent race conditions
        port = await projectSyncService.allocatePort(hostId, directory);
        debugLogManager.info('ProjectStore', `Allocated new port ${port} for project "${name}"`);
      }

      // 2. Check if server is already running on this port
      const isAlreadyRunning = await projectSyncService.checkServerHealth(hostId, port);

      if (isAlreadyRunning) {
        debugLogManager.info('ProjectStore', `Server already running on port ${port}, connecting without spawn`);

        // Just create local record and connect - don't spawn
        const project: Omit<Project, 'id'> = {
          hostId,
          name,
          directory,
          port,
          status: 'running',
          createdAt: Date.now(),
        };

        projectId = await projectRepository.insert(project);

        // Update UI
        set((state) => ({
          projects: [...state.projects, { ...project, id: projectId! }],
          isLoading: false,
        }));

        // Establish SSE connections
        const host = useHostStore.getState().hosts.find((h) => h.id === hostId);
        if (host) {
          const projectUrl = `${host.isSecure ? 'https' : 'http'}://${host.host}:${port}`;
          try {
            await sseConnectionManager.connectAsync(`project-${projectId}`, projectUrl);
            debugLogManager.info('ProjectStore', `SSE connected for project ${projectId}`);
            await sseConnectionManager.connectAsync(`project-${projectId}-global`, projectUrl, '/global/event');
            debugLogManager.info('ProjectStore', `Global SSE connected for project ${projectId}`);
          } catch (sseError) {
            debugLogManager.error('ProjectStore', `SSE connection failed for project ${projectId}: ${sseError}`);
            await projectRepository.updateStatus(projectId, 'error');
            set((state) => ({
              projects: state.projects.map((p) =>
                p.id === projectId ? { ...p, status: 'error' as ProjectStatus } : p
              ),
              isLoading: false,
              error: `Server running but SSE connection failed: ${sseError instanceof Error ? sseError.message : String(sseError)}`,
            }));
            throw sseError;
          }
        }

        // Update server config if this was a new project
        if (!existingInConfig) {
          await projectSyncService.upsertProject(hostId, {
            id: projectSyncService.generateProjectId(directory),
            name,
            directory,
            port,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          // Clear in-memory reservation now that it's in config
          projectSyncService.clearPortReservation(hostId, port);
        }

        return projectId;
      }

      // 3. Server not running - need to spawn
      const project: Omit<Project, 'id'> = {
        hostId,
        name,
        directory,
        port,
        status: 'starting',
        createdAt: Date.now(),
      };

      projectId = await projectRepository.insert(project);
      debugLogManager.info('ProjectStore', `Created project record: ${projectId}`);

      // Update UI immediately
      set((state) => ({
        projects: [...state.projects, { ...project, id: projectId! }],
      }));

      // 4. Get manager session on main host
      const sessionId = await getManagerSession(hostId);
      debugLogManager.info('ProjectStore', `Using manager session: ${sessionId}`);

      // 5. Build and execute spawn command
      const spawnCommand = `cd '${directory}' && nohup $HOME/.opencode/bin/opencode serve --port ${port} --hostname 0.0.0.0 > /dev/null 2>&1 & for i in 1 2 3 4 5; do sleep 0.5; PID=$(pgrep -f 'opencode.*serve.*${port}' | head -1); if [ -n "$PID" ]; then echo "DROIDCODE_PID:$PID"; exit 0; fi; done; echo "DROIDCODE_PID:"`;

      debugLogManager.info('ProjectStore', `Executing spawn command for port ${port}`);
      const output = await apiClient.runShellCommand(hostId, sessionId, spawnCommand);
      debugLogManager.info('ProjectStore', `Spawn output: ${output}`);

      // 6. Parse PID from output
      const pidMatch = output.match(/DROIDCODE_PID:(\d+)/);
      const pid = pidMatch ? parseInt(pidMatch[1], 10) : null;

      if (pid) {
        // Success - update with PID and RUNNING status
        debugLogManager.info('ProjectStore', `Project spawned with PID: ${pid}`);
        await projectRepository.updateStatus(projectId, 'running', pid);
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, status: 'running' as ProjectStatus, pid } : p
          ),
          isLoading: false,
        }));

        // Establish SSE connections for this project
        const host = useHostStore.getState().hosts.find((h) => h.id === hostId);
        if (host) {
          const projectUrl = `${host.isSecure ? 'https' : 'http'}://${host.host}:${port}`;
          try {
            await sseConnectionManager.connectAsync(`project-${projectId}`, projectUrl);
            debugLogManager.info('ProjectStore', `SSE connected for project ${projectId}`);
            await sseConnectionManager.connectAsync(`project-${projectId}-global`, projectUrl, '/global/event');
            debugLogManager.info('ProjectStore', `Global SSE connected for project ${projectId}`);
          } catch (sseError) {
            debugLogManager.error('ProjectStore', `SSE connection failed for project ${projectId}: ${sseError}`);
            await projectRepository.updateStatus(projectId, 'error');
            set((state) => ({
              projects: state.projects.map((p) =>
                p.id === projectId ? { ...p, status: 'error' as ProjectStatus } : p
              ),
              isLoading: false,
              error: `Project started but SSE connection failed: ${sseError instanceof Error ? sseError.message : String(sseError)}`,
            }));
            throw sseError;
          }
        }

        // 7. Update server config with new/updated project
        await projectSyncService.upsertProject(hostId, {
          id: projectSyncService.generateProjectId(directory),
          name,
          directory,
          port,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        // Clear in-memory reservation now that it's in config
        projectSyncService.clearPortReservation(hostId, port);
      } else {
        // No PID found - spawn may have failed
        debugLogManager.error('ProjectStore', `Failed to extract PID from output: ${output}`);
        // Release port reservation on failure
        projectSyncService.releasePortReservation(hostId, port);
        await projectRepository.updateStatus(projectId, 'error');
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, status: 'error' as ProjectStatus } : p
          ),
          isLoading: false,
          error: 'Failed to start OpenCode server - no PID found',
        }));
      }

      return projectId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to spawn project';
      debugLogManager.error('ProjectStore', `Spawn error: ${message}`);

      // Release port reservation on failure (if we allocated one)
      if (port && !existingInConfig) {
        projectSyncService.releasePortReservation(hostId, port);
      }

      // Clean up project record if we created one
      if (projectId) {
        await projectRepository.updateStatus(projectId, 'error');
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, status: 'error' as ProjectStatus } : p
          ),
        }));
      }

      set({ error: message, isLoading: false });
      throw error;
    }
  },

  stopProject: async (id) => {
    set({ isLoading: true, error: null });

    try {
      const project = await projectRepository.getById(id);
      if (!project) {
        throw new Error('Project not found');
      }

      if (!project.pid) {
        // No PID - just mark as stopped
        debugLogManager.info('ProjectStore', `No PID for project ${id}, marking as stopped`);
        await projectRepository.updateStatus(id, 'stopped');
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, status: 'stopped' as ProjectStatus, pid: undefined } : p
          ),
          isLoading: false,
        }));
        return;
      }

      // Update status to stopping
      await projectRepository.updateStatus(id, 'stopping', project.pid);
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, status: 'stopping' as ProjectStatus } : p
        ),
      }));

      // Get manager session and execute kill command
      const sessionId = await getManagerSession(project.hostId);
      const killCommand = `kill ${project.pid} 2>/dev/null; sleep 0.3; kill -0 ${project.pid} 2>/dev/null && echo "STILL_RUNNING" || echo "KILLED"`;

      debugLogManager.info('ProjectStore', `Executing kill command for PID ${project.pid}`);
      const output = await apiClient.runShellCommand(project.hostId, sessionId, killCommand);
      debugLogManager.info('ProjectStore', `Kill output: ${output}`);

      // Update to stopped status
      await projectRepository.updateStatus(id, 'stopped');
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, status: 'stopped' as ProjectStatus, pid: undefined } : p
        ),
        isLoading: false,
      }));

      // Disconnect SSE connections for this project
      sseConnectionManager.disconnect(`project-${id}`);
      sseConnectionManager.disconnect(`project-${id}-global`);
      debugLogManager.info('ProjectStore', `Project ${id} stopped, SSE disconnected`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop project';
      debugLogManager.error('ProjectStore', `Stop error: ${message}`);
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  checkHealth: async (id) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project) {
      return 'error';
    }

    try {
      // Try to make a health check request to the project's port
      await apiClient.checkHealthOnPort(project.hostId, project.port);
      await get().updateStatus(id, 'running', project.pid);
      return 'running';
    } catch {
      await get().updateStatus(id, 'stopped');
      return 'stopped';
    }
  },

  refresh: async (hostId: number) => {
    set({ isLoading: true, error: null });

    try {
      // Clear sync cache to force fresh read from server
      projectSyncService.clearCache(hostId);

      // Re-run full sync with server
      await get().loadProjects(hostId);

      // Check health of each project
      const projects = get().projects;
      for (const project of projects) {
        await get().checkHealth(project.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh projects';
      set({ error: message, isLoading: false });
    }
  },

  reset: () => {
    set({
      projects: [],
      selectedProjectId: null,
      isLoading: false,
      isInitialized: false,
      error: null,
    });
  },
}));
