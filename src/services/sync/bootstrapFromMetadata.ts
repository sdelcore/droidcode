import type { SessionRecord } from 'sandbox-agent'
import type { Host, ProjectFolder, SessionPreferences } from '@/types'
import { useMetadataStore, type RemoteSessionMeta } from '@/stores/metadataStore'
import { projectRepository, sessionPreferencesRepository } from '@/services/db'
import { seedSessionIfMissing } from '@/services/sandboxAgent/client'

// Pull metadata from the companion server (sessions + projects) and:
//
//   1) Seed the SDK's local persist driver with any sessions we don't have
//      yet, so listSessions / resumeSession work on a fresh browser.
//   2) Mirror companion projects into local Dexie (additive).
//   3) Mirror companion aliases into sessionPreferences (fill-if-missing).

export async function bootstrapFromMetadata(host: Host): Promise<void> {
  const bucket = await useMetadataStore.getState().loadForHost(host.id)
  if (!bucket || bucket.offline) return

  for (const session of Object.values(bucket.sessions)) {
    const record = buildSessionRecord(session)
    if (!record) continue
    try {
      await seedSessionIfMissing(record)
    } catch (err) {
      console.warn('seed session failed', session.id, err)
    }
  }

  const existing = await projectRepository.getByHost(host.id)
  const existingByDir = new Map<string, ProjectFolder>()
  for (const p of existing) existingByDir.set(p.directory, p)
  for (const rp of bucket.projects) {
    if (existingByDir.has(rp.directory)) continue
    try {
      await projectRepository.upsert({
        hostId: host.id,
        name: rp.name,
        directory: rp.directory,
      })
    } catch (err) {
      console.warn('project mirror failed', rp.directory, err)
    }
  }

  for (const session of Object.values(bucket.sessions)) {
    if (!session.alias) continue
    const pref = await sessionPreferencesRepository.get(session.id)
    if (pref?.alias) continue
    const next: SessionPreferences = {
      ...pref,
      sessionId: session.id,
      hostId: host.id,
      alias: session.alias,
      agent: session.agent ?? pref?.agent,
    }
    try {
      await sessionPreferencesRepository.save(next)
    } catch (err) {
      console.warn('alias mirror failed', session.id, err)
    }
  }
}

function buildSessionRecord(meta: RemoteSessionMeta): SessionRecord | null {
  if (!meta.id || !meta.agent || !meta.agentSessionId || !meta.lastConnectionId) {
    return null
  }
  return {
    id: meta.id,
    agent: meta.agent,
    agentSessionId: meta.agentSessionId,
    lastConnectionId: meta.lastConnectionId,
    createdAt: meta.createdAt ?? Date.now(),
    destroyedAt: meta.destroyedAt,
    sessionInit: (meta.sessionInit as SessionRecord['sessionInit']) ?? undefined,
  }
}
