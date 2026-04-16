import { create } from 'zustand'
import { projectRepository } from '@/services/db'
import type { ProjectFolder } from '@/types'

interface ProjectStoreState {
  byHost: Record<number, ProjectFolder[]>
  selectedProjectId: number | null
  isLoading: boolean
  error: string | null

  loadForHost(hostId: number): Promise<void>
  rememberProject(input: {
    hostId: number
    name: string
    directory: string
  }): Promise<ProjectFolder>
  removeProject(id: number): Promise<void>
  selectProject(id: number | null): void
}

export const useProjectStore = create<ProjectStoreState>()((set, get) => ({
  byHost: {},
  selectedProjectId: null,
  isLoading: false,
  error: null,

  async loadForHost(hostId) {
    set({ isLoading: true, error: null })
    try {
      const projects = await projectRepository.getByHost(hostId)
      set({
        byHost: { ...get().byHost, [hostId]: projects },
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load projects',
        isLoading: false,
      })
    }
  },

  async rememberProject(input) {
    const project = await projectRepository.upsert(input)
    const list = get().byHost[input.hostId] ?? []
    const filtered = list.filter((p) => p.id !== project.id)
    set({
      byHost: {
        ...get().byHost,
        [input.hostId]: [project, ...filtered],
      },
    })
    return project
  },

  async removeProject(id) {
    const project = await projectRepository.getById(id)
    if (!project) return
    await projectRepository.delete(id)
    const list = get().byHost[project.hostId] ?? []
    set({
      byHost: {
        ...get().byHost,
        [project.hostId]: list.filter((p) => p.id !== id),
      },
      selectedProjectId:
        get().selectedProjectId === id ? null : get().selectedProjectId,
    })
  },

  selectProject(id) {
    set({ selectedProjectId: id })
  },
}))
