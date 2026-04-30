import type { Session } from '@/services/wagent'
import type { Host, SortPreset } from '@/types'
import { isSessionRunning, sessionCwd, sessionDisplayName } from './sessionFields'

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export type HomeStatus = 'running' | 'completed'

export interface HomeSearch {
  q?: string
  h?: string
  p?: string
  s?: string
  sort?: SortPreset
}

export interface HomeFilterState {
  query: string
  hostIds: Set<number>
  projectDirs: Set<string>
  statuses: Set<HomeStatus>
  sort: SortPreset
}

export const DEFAULT_HOME_FILTERS: HomeFilterState = {
  query: '',
  hostIds: new Set(),
  projectDirs: new Set(),
  statuses: new Set(),
  sort: 'recent',
}

export interface FlatSession {
  session: Session
  hostId: number
  hostName: string
  alias?: string
  cwd?: string
  projectKey: string
}

export interface FacetOption<T extends string | number> {
  value: T
  label: string
  count: number
}

export interface HomeView {
  filters: HomeFilterState
  visible: FlatSession[]
  total: number
  facets: {
    hosts: FacetOption<number>[]
    projects: FacetOption<string>[]
  }
}

// ----------------------------------------------------------------------------
// URL ↔ filter state
// ----------------------------------------------------------------------------

const SORT_PRESETS: Set<SortPreset> = new Set([
  'recent',
  'workflow',
  'created',
  'duration',
  'files',
  'alpha',
])

export function validateHomeSearch(raw: Record<string, unknown>): HomeSearch {
  return {
    q: typeof raw.q === 'string' && raw.q.length > 0 ? raw.q : undefined,
    h: typeof raw.h === 'string' && raw.h.length > 0 ? raw.h : undefined,
    p: typeof raw.p === 'string' && raw.p.length > 0 ? raw.p : undefined,
    s: typeof raw.s === 'string' && raw.s.length > 0 ? raw.s : undefined,
    sort:
      typeof raw.sort === 'string' && SORT_PRESETS.has(raw.sort as SortPreset)
        ? (raw.sort as SortPreset)
        : undefined,
  }
}

export function serializeHomeFilters(filters: HomeFilterState): HomeSearch {
  return {
    q: filters.query.length > 0 ? filters.query : undefined,
    h: filters.hostIds.size > 0 ? Array.from(filters.hostIds).join(',') : undefined,
    p:
      filters.projectDirs.size > 0
        ? Array.from(filters.projectDirs).join(',')
        : undefined,
    s: filters.statuses.size > 0 ? Array.from(filters.statuses).join(',') : undefined,
    sort: filters.sort !== 'recent' ? filters.sort : undefined,
  }
}

// ----------------------------------------------------------------------------
// Public entry point — one cascade, one bundle
// ----------------------------------------------------------------------------

export interface BuildHomeViewInput {
  search: HomeSearch
  byHost: Record<number, Session[]>
  hosts: Host[]
}

export function buildHomeView({ search, byHost, hosts }: BuildHomeViewInput): HomeView {
  const filters = mergeFilters(search)
  const flat = buildFlatSessions(byHost, hosts)

  // Cascade: hosts unfiltered → host filter → projects refine on host-filtered →
  // status, query refine further → sort. Keeps facet counts honest at each step.
  const hostFiltered = applyHostFilter(flat, filters.hostIds)
  const projectFiltered = applyProjectFilter(hostFiltered, filters.projectDirs)
  const statusFiltered = applyStatusFilter(projectFiltered, filters.statuses)
  const queryFiltered = applyQueryFilter(statusFiltered, filters.query)
  const visible = applySort(queryFiltered, filters.sort)

  return {
    filters,
    visible,
    total: flat.length,
    facets: {
      hosts: hostFacets(flat, hosts),
      projects: projectFacets(hostFiltered),
    },
  }
}

export function projectLabelFromPath(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const basename = trimmed.split('/').pop()
  return basename && basename.length > 0 ? basename : trimmed
}

// ----------------------------------------------------------------------------
// Private — the cascade steps
// ----------------------------------------------------------------------------

function mergeFilters(search: HomeSearch): HomeFilterState {
  return {
    query: search.q ?? DEFAULT_HOME_FILTERS.query,
    hostIds: parseNumericSet(search.h),
    projectDirs: parseStringSet(search.p),
    statuses: parseStatusSet(search.s),
    sort: search.sort ?? DEFAULT_HOME_FILTERS.sort,
  }
}

function buildFlatSessions(
  byHost: Record<number, Session[]>,
  hosts: Host[],
): FlatSession[] {
  const out: FlatSession[] = []
  for (const host of hosts) {
    const records = byHost[host.id] ?? []
    for (const record of records) {
      const cwd = sessionCwd(record)
      out.push({
        session: record,
        hostId: host.id,
        hostName: host.name,
        alias: record.alias ?? undefined,
        cwd,
        projectKey: cwd ?? '',
      })
    }
  }
  return out
}

function applyHostFilter(flat: FlatSession[], hostIds: Set<number>): FlatSession[] {
  if (hostIds.size === 0) return flat
  return flat.filter((f) => hostIds.has(f.hostId))
}

function applyProjectFilter(
  flat: FlatSession[],
  projectDirs: Set<string>,
): FlatSession[] {
  if (projectDirs.size === 0) return flat
  return flat.filter((f) => projectDirs.has(f.cwd ?? ''))
}

function applyStatusFilter(
  flat: FlatSession[],
  statuses: Set<HomeStatus>,
): FlatSession[] {
  if (statuses.size === 0) return flat
  return flat.filter((f) => {
    const label: HomeStatus = isSessionRunning(f.session) ? 'running' : 'completed'
    return statuses.has(label)
  })
}

function applyQueryFilter(flat: FlatSession[], query: string): FlatSession[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return flat
  return flat.filter((f) => {
    const haystack = [
      f.alias ?? '',
      f.hostName,
      f.cwd ?? '',
      sessionDisplayName(f.session),
      f.session.agent ?? '',
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}

function hostFacets(flat: FlatSession[], hosts: Host[]): FacetOption<number>[] {
  const counts = new Map<number, number>()
  for (const f of flat) counts.set(f.hostId, (counts.get(f.hostId) ?? 0) + 1)
  return hosts
    .filter((h) => counts.has(h.id))
    .map((h) => ({ value: h.id, label: h.name, count: counts.get(h.id) ?? 0 }))
}

function projectFacets(flat: FlatSession[]): FacetOption<string>[] {
  const counts = new Map<string, number>()
  for (const f of flat) {
    if (!f.cwd) continue
    counts.set(f.cwd, (counts.get(f.cwd) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([dir, count]) => ({ value: dir, label: projectLabelFromPath(dir), count }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function applySort(flat: FlatSession[], preset: SortPreset): FlatSession[] {
  switch (preset) {
    case 'created':
      return flat.slice().sort((a, b) => a.session.createdAt - b.session.createdAt)
    case 'alpha':
      return flat.slice().sort((a, b) =>
        sessionDisplayName(
          a.session,
          a.alias ? { sessionId: a.session.id, hostId: a.hostId, alias: a.alias } : undefined,
        ).localeCompare(
          sessionDisplayName(
            b.session,
            b.alias ? { sessionId: b.session.id, hostId: b.hostId, alias: b.alias } : undefined,
          ),
        ),
      )
    case 'recent':
    case 'workflow':
    case 'duration':
    case 'files':
    default:
      return flat.slice().sort((a, b) => activityTs(b) - activityTs(a))
  }
}

function activityTs(f: FlatSession): number {
  return f.session.destroyedAt ?? f.session.createdAt
}

function parseNumericSet(value?: string): Set<number> {
  if (!value) return new Set()
  const out = new Set<number>()
  for (const part of value.split(',')) {
    const n = Number.parseInt(part, 10)
    if (Number.isFinite(n)) out.add(n)
  }
  return out
}

function parseStringSet(value?: string): Set<string> {
  if (!value) return new Set()
  return new Set(
    value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  )
}

function parseStatusSet(value?: string): Set<HomeStatus> {
  if (!value) return new Set()
  const out = new Set<HomeStatus>()
  for (const part of value.split(',')) {
    if (part === 'running' || part === 'completed') out.add(part)
  }
  return out
}
