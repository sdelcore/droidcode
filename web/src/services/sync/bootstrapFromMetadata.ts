import type { SessionRecord } from 'sandbox-agent'
import type { Host, ProjectFolder, SessionPreferences } from '@/types'
import { useMetadataStore, type RemoteSessionMeta } from '@/stores/metadataStore'
import { projectRepository, sessionPreferencesRepository } from '@/services/db'
import { seedSessionIfMissing } from '@/services/sandboxAgent/client'

// When the SDK connects to a host for the first time in this browser, pull
// down the shared metadata file and use it to:
//
//   1) Hydrate the client-side persist driver with SessionRecords we've never
//      seen locally but that exist in the metadata. This makes listSessions /
//      resumeSession work on a fresh browser.
//   2) Mirror project folders into Dexie so the dashboard has names, not
//      just bare cwds.
//   3) Mirror session aliases into sessionPreferences so tiles / headers
//      show the user-given name.
//
// This is idempotent — re-running does nothing if Dexie already agrees with
// the metadata.

export async function bootstrapFromMetadata(host: Host): Promise<void> {
  const data = await useMetadataStore.getState().loadForHost(host.id)
  if (!data) return

  // 1. Seed SDK persist with any sessions we don't have locally.
  for (const session of Object.values(data.sessions)) {
    const record = buildSessionRecord(session)
    if (!record) continue
    try {
      await seedSessionIfMissing(record)
    } catch (err) {
      console.warn('seed session failed', session.id, err)
    }
  }

  // 2. Mirror projects into Dexie (only adding new ones — never delete local
  //    entries that aren't in the remote, since the user may not have saved
  //    them to the remote yet).
  const existing = await projectRepository.getByHost(host.id)
  const existingByDir = new Map<string, ProjectFolder>()
  for (const p of existing) existingByDir.set(p.directory, p)
  for (const rp of data.projects) {
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

  // 3. Mirror aliases into sessionPreferences (only filling in missing ones).
  for (const session of Object.values(data.sessions)) {
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
