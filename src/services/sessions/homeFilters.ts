import type { SessionRecord } from 'sandbox-agent'
import type { Host, SessionPreferences, SortPreset } from '@/types'
import { isSessionRunning, sessionCwd, sessionDisplayName } from './sortAndFilter'

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

export function parseHomeSearch(search: HomeSearch): HomeFilterState {
  return {
    query: search.q ?? '',
    hostIds: parseNumericSet(search.h),
    projectDirs: parseStringSet(search.p),
    statuses: parseStatusSet(search.s),
    sort: search.sort ?? 'recent',
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

// Per-session view projection: an enriched tile payload that carries the
// host context alongside the raw SDK record, so the grid can render a
// host pill + project label without needing extra lookups.
export interface FlatSession {
  session: SessionRecord
  hostId: number
  hostName: string
  alias?: string
  cwd?: string
  projectKey: string // directory — stable URL-safe key (encoded by caller)
}

export interface BuildFlatSessionsInput {
  byHost: Record<number, SessionRecord[]>
  hosts: Host[]
  prefs: Record<string, SessionPreferences>
}

export function buildFlatSessions({
  byHost,
  hosts,
  prefs,
}: BuildFlatSessionsInput): FlatSession[] {
  const out: FlatSession[] = []
  for (const host of hosts) {
    const records = byHost[host.id] ?? []
    for (const record of records) {
      const cwd = sessionCwd(record)
      out.push({
        session: record,
        hostId: host.id,
        hostName: host.name,
        alias: prefs[record.id]?.alias,
        cwd,
        projectKey: cwd ?? '',
      })
    }
  }
  return out
}

export interface FacetOption<T extends string | number> {
  value: T
  label: string
  count: number
}

export function hostFacets(
  flat: FlatSession[],
  hosts: Host[],
): FacetOption<number>[] {
  const counts = new Map<number, number>()
  for (const f of flat) counts.set(f.hostId, (counts.get(f.hostId) ?? 0) + 1)
  return hosts
    .filter((h) => counts.has(h.id))
    .map((h) => ({ value: h.id, label: h.name, count: counts.get(h.id) ?? 0 }))
}

// Project facets are derived from whichever sessions are currently visible
// *after* host filtering, so they behave like a cascading refinement.
export function projectFacets(flat: FlatSession[]): FacetOption<string>[] {
  const counts = new Map<string, number>()
  for (const f of flat) {
    if (!f.cwd) continue
    counts.set(f.cwd, (counts.get(f.cwd) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([dir, count]) => ({ value: dir, label: projectLabelFromPath(dir), count }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function projectLabelFromPath(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const basename = trimmed.split('/').pop()
  return basename && basename.length > 0 ? basename : trimmed
}

export function applyHomeFilters(
  flat: FlatSession[],
  filters: HomeFilterState,
): FlatSession[] {
  const q = filters.query.trim().toLowerCase()
  return flat.filter((f) => {
    if (filters.hostIds.size > 0 && !filters.hostIds.has(f.hostId)) return false
    if (filters.projectDirs.size > 0 && !filters.projectDirs.has(f.cwd ?? '')) {
      return false
    }
    if (filters.statuses.size > 0) {
      const label: HomeStatus = isSessionRunning(f.session) ? 'running' : 'completed'
      if (!filters.statuses.has(label)) return false
    }
    if (q.length > 0) {
      const haystack = [
        f.alias ?? '',
        f.hostName,
        f.cwd ?? '',
        sessionDisplayName(f.session),
        f.session.agent ?? '',
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

export function sortFlatByRecent(flat: FlatSession[]): FlatSession[] {
  return flat.slice().sort((a, b) => activityTs(b) - activityTs(a))
}

export function sortFlatByCreated(flat: FlatSession[]): FlatSession[] {
  return flat.slice().sort((a, b) => a.session.createdAt - b.session.createdAt)
}

export function sortFlatByAlpha(flat: FlatSession[]): FlatSession[] {
  return flat
    .slice()
    .sort((a, b) =>
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
}

export function applyHomeSort(
  flat: FlatSession[],
  preset: SortPreset,
): FlatSession[] {
  switch (preset) {
    case 'created':
      return sortFlatByCreated(flat)
    case 'alpha':
      return sortFlatByAlpha(flat)
    case 'recent':
    case 'workflow':
    case 'duration':
    case 'files':
    default:
      return sortFlatByRecent(flat)
  }
}

function activityTs(f: FlatSession): number {
  return f.session.destroyedAt ?? f.session.createdAt
}
