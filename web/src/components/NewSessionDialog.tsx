import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Check,
  ChevronRight,
  FolderOpen,
  FolderSearch,
  Plus,
  Server,
} from 'lucide-react'
import type { AgentInfo } from 'sandbox-agent'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { FolderBrowser } from '@/components/FolderBrowser'
import { useConfigStore, useHostStore, useSessionStore } from '@/stores'
import { useMetadataStore } from '@/stores/metadataStore'
import { projectRepository, sessionPreferencesRepository } from '@/services/db'
import { fetchHealth, hostBaseUrl } from '@/services/sandboxAgent/client'
import { formatError } from '@/services/errors/formatError'
import { sessionCwd } from '@/services/sessions/sortAndFilter'
import type { ProjectFolder, SessionPreferences } from '@/types'

interface NewSessionDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  onCreated(hostId: number, sessionId: string): void
  initialHostId?: number
  initialCwd?: string
}

const EMPTY_AGENTS: AgentInfo[] = []

function folderBasename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() || 'session'
}

function suggestAlias(path: string): string {
  // Shown in the placeholder so the user sees what the default will be
  // if they leave the alias blank. The real uniqueness check happens at
  // submit time in computeDefaultAlias.
  return folderBasename(path.trim())
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function computeDefaultAlias(hostId: number, folderPath: string): Promise<string> {
  const basename = folderBasename(folderPath)
  const [prefs, sessions] = [
    await sessionPreferencesRepository.getByHost(hostId),
    useSessionStore.getState().byHost[hostId] ?? [],
  ]
  const sessionIdsInFolder = new Set(
    sessions.filter((s) => sessionCwd(s) === folderPath).map((s) => s.id),
  )
  const used = new Set<string>(
    prefs
      .filter(
        (p: SessionPreferences) =>
          p.alias && p.alias.length > 0 && sessionIdsInFolder.has(p.sessionId),
      )
      .map((p) => p.alias as string),
  )
  if (!used.has(basename)) return basename
  const pattern = new RegExp(`^${escapeRegex(basename)}-(\\d+)$`)
  let maxN = 1
  for (const a of used) {
    const m = pattern.exec(a)
    if (m) {
      const n = Number.parseInt(m[1], 10)
      if (Number.isFinite(n) && n > maxN) maxN = n
    }
  }
  return `${basename}-${maxN + 1}`
}

export function NewSessionDialog(props: NewSessionDialogProps) {
  const isNarrow = useIsNarrow()
  if (isNarrow) {
    return (
      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent side="bottom" className="flex h-[92dvh] flex-col rounded-t-xl p-0">
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>New session</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <NewSessionForm {...props} />
          </div>
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New session</DialogTitle>
        </DialogHeader>
        <NewSessionForm {...props} desktop />
      </DialogContent>
    </Dialog>
  )
}

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < 640,
  )
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return narrow
}

interface NewSessionFormProps extends NewSessionDialogProps {
  desktop?: boolean
}

function NewSessionForm({
  open,
  onOpenChange,
  onCreated,
  initialHostId,
  initialCwd,
  desktop,
}: NewSessionFormProps) {
  const hosts = useHostStore((s) => s.hosts)
  const addHost = useHostStore((s) => s.addHost)
  const loadAgents = useConfigStore((s) => s.loadAgents)
  const createSession = useSessionStore((s) => s.createSession)

  const [hostId, setHostId] = useState<number | null>(initialHostId ?? null)
  const [folder, setFolder] = useState<string>(initialCwd ?? '')
  const [folderError, setFolderError] = useState<string | null>(null)
  const [alias, setAlias] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('')
  const [rememberedFolders, setRememberedFolders] = useState<ProjectFolder[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<'form' | 'addHost'>('form')
  const [browseOpen, setBrowseOpen] = useState(false)

  // Reset when the modal opens, so previous session state doesn't leak in.
  useEffect(() => {
    if (!open) return
    const defaultHost =
      initialHostId ??
      (hosts.length === 1 ? hosts[0].id : (hosts[0]?.id ?? null))
    setHostId(defaultHost)
    setFolder(initialCwd ?? '')
    setAlias('')
    setSelectedAgent('')
    setFolderError(null)
    setMode('form')
  }, [open, initialHostId, initialCwd, hosts])

  useEffect(() => {
    if (hostId !== null) loadAgents(hostId)
  }, [hostId, loadAgents])

  useEffect(() => {
    let cancelled = false
    if (hostId === null) {
      setRememberedFolders([])
      return
    }
    projectRepository.getByHost(hostId).then((rows) => {
      if (!cancelled) setRememberedFolders(rows)
    })
    return () => {
      cancelled = true
    }
  }, [hostId])

  const agents = useConfigStore((s) =>
    hostId !== null ? (s.agentsByHost[hostId] ?? EMPTY_AGENTS) : EMPTY_AGENTS,
  )
  const installed = useMemo(
    () => agents.filter((a) => a.installed && a.credentialsAvailable),
    [agents],
  )

  useEffect(() => {
    if (!selectedAgent && installed.length > 0) {
      setSelectedAgent(installed[0].id)
    }
  }, [installed, selectedAgent])

  function validateFolder(value: string): string | null {
    const trimmed = value.trim()
    if (trimmed.length === 0) return 'Folder is required'
    if (trimmed.startsWith('~')) return "Use an absolute path — the daemon doesn't expand ~"
    if (!trimmed.startsWith('/')) return 'Path must be absolute (start with /)'
    return null
  }

  async function handleCreate() {
    if (hostId === null) {
      toast.error('Pick a host first')
      return
    }
    const folderMsg = validateFolder(folder)
    if (folderMsg) {
      setFolderError(folderMsg)
      return
    }
    if (!selectedAgent) {
      toast.error('No agent selected')
      return
    }
    setSubmitting(true)
    try {
      const cwd = folder.trim()
      // Remember the folder for future sessions on this host. If it already
      // exists, upsert just bumps lastUsed.
      await projectRepository.upsert({
        hostId,
        directory: cwd,
        name: cwd.split('/').pop() || cwd,
      })
      const record = await createSession(hostId, { agent: selectedAgent, cwd })
      const trimmedAlias = alias.trim()
      const finalAlias =
        trimmedAlias.length > 0 ? trimmedAlias : await computeDefaultAlias(hostId, cwd)
      await sessionPreferencesRepository.save({
        sessionId: record.id,
        hostId,
        agent: selectedAgent,
        alias: finalAlias,
      })
      useMetadataStore.getState().upsertSession(hostId, {
        id: record.id,
        alias: finalAlias,
      })
      onCreated(hostId, record.id)
      onOpenChange(false)
    } catch (err) {
      console.error('createSession failed', err)
      const msg = formatError(err, 'Create failed')
      const hint = /internal/i.test(msg)
        ? `. Check that ${folder.trim()} exists on the host and the agent has permission.`
        : ''
      toast.error(`${msg}${hint}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'addHost') {
    return (
      <AddHostInline
        onCancel={() => setMode('form')}
        onAdded={(newHost) => {
          setHostId(newHost.id)
          setMode('form')
        }}
        addHost={addHost}
      />
    )
  }

  const selectedHost = hostId !== null ? hosts.find((h) => h.id === hostId) : null
  const hostLabel = selectedHost?.name ?? 'Pick a host'

  return (
    <div className="flex flex-col gap-4">
      <Field label="Host" icon={<Server className="size-4 text-muted-foreground" />}>
        <HostPicker
          hosts={hosts}
          selectedId={hostId}
          onSelect={setHostId}
          onAddNew={() => setMode('addHost')}
          hostLabel={hostLabel}
        />
      </Field>

      <Field
        label="Folder"
        icon={<FolderSearch className="size-4 text-muted-foreground" />}
        error={folderError ?? undefined}
        hint={
          rememberedFolders.length > 0
            ? `Saved folders: ${rememberedFolders.length}. Browse to pick any directory on the host.`
            : 'Absolute path on the host. Browse to pick interactively.'
        }
      >
        <div className="flex gap-2">
          <Input
            value={folder}
            onChange={(e) => {
              setFolder(e.target.value)
              if (folderError) setFolderError(null)
            }}
            onBlur={() => setFolderError(validateFolder(folder))}
            placeholder="/home/you/src/project"
            list="remembered-folders"
            className="h-11 text-base sm:h-9 sm:text-sm"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setBrowseOpen(true)}
            disabled={hostId === null}
            className="h-11 shrink-0 sm:h-9"
            aria-label="Browse folders"
            title="Browse folders on the host"
          >
            <FolderOpen className="size-4" />
            <span className="hidden sm:inline">Browse</span>
          </Button>
        </div>
        <datalist id="remembered-folders">
          {rememberedFolders.map((p) => (
            <option key={p.id} value={p.directory}>
              {p.name}
            </option>
          ))}
        </datalist>
      </Field>

      <Field
        label="Alias (optional)"
        hint={
          folder.trim().length > 0 && !validateFolder(folder)
            ? `Defaults to "${suggestAlias(folder)}" if left blank`
            : undefined
        }
      >
        <Input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder={
            folder.trim().length > 0 && !validateFolder(folder)
              ? suggestAlias(folder)
              : 'e.g. Phase 7 plan'
          }
          className="h-11 text-base sm:h-9 sm:text-sm"
        />
      </Field>

      <FolderBrowser
        host={selectedHost ?? null}
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        initialPath={folder.trim().startsWith('/') ? folder.trim() : undefined}
        onSelect={(p) => {
          setFolder(p)
          setFolderError(null)
        }}
      />

      {installed.length > 1 && (
        <Field label="Agent">
          <div className="flex flex-wrap gap-2">
            {installed.map((a) => (
              <AgentChip
                key={a.id}
                label={a.id}
                selected={a.id === selectedAgent}
                onSelect={() => setSelectedAgent(a.id)}
              />
            ))}
          </div>
        </Field>
      )}

      {installed.length === 0 && hostId !== null && (
        <p className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
          No installed agents with credentials on this host.
        </p>
      )}

      <div
        className={
          desktop
            ? 'mt-2 flex items-center justify-end gap-2'
            : 'sticky bottom-0 -mx-4 mt-2 flex items-center justify-end gap-2 border-t border-border bg-background px-4 py-3'
        }
      >
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          disabled={
            submitting || hostId === null || installed.length === 0 || !selectedAgent
          }
          onClick={handleCreate}
        >
          {submitting ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  icon?: React.ReactNode
  error?: string
  hint?: string
  children: React.ReactNode
}

function Field({ label, icon, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

interface HostPickerProps {
  hosts: ReturnType<typeof useHostStore.getState>['hosts']
  selectedId: number | null
  onSelect(id: number): void
  onAddNew(): void
  hostLabel: string
}

function HostPicker({ hosts, selectedId, onSelect, onAddNew }: HostPickerProps) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border">
      {hosts.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={() => onSelect(h.id)}
          className={
            'flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent sm:py-2 ' +
            (selectedId === h.id ? 'bg-accent' : '')
          }
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{h.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {h.isSecure ? 'https' : 'http'}://{h.host}:{h.port}
            </span>
          </div>
          {selectedId === h.id && <Check className="size-4 text-primary" />}
        </button>
      ))}
      <button
        type="button"
        onClick={onAddNew}
        className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:py-2"
      >
        <span className="flex items-center gap-2">
          <Plus className="size-4" />
          Add host
        </span>
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

interface AddHostInlineProps {
  onCancel(): void
  onAdded(host: ReturnType<typeof useHostStore.getState>['hosts'][number]): void
  addHost: ReturnType<typeof useHostStore.getState>['addHost']
}

function AddHostInline({ onCancel, onAdded, addHost }: AddHostInlineProps) {
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('2468')
  const [isSecure, setIsSecure] = useState(false)
  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleAdd() {
    const portNum = Number.parseInt(port, 10)
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      toast.error('Port must be 1–65535')
      return
    }
    if (!name.trim() || !host.trim()) {
      toast.error('Name and host are required')
      return
    }
    setSubmitting(true)
    try {
      const baseUrl = hostBaseUrl({ host: host.trim(), port: portNum, isSecure })
      const healthy = await fetchHealth({ baseUrl })
      if (!healthy) toast.warning(`Could not reach ${baseUrl}. Saving anyway.`)
      const created = await addHost({
        name: name.trim(),
        host: host.trim(),
        port: portNum,
        isSecure,
        token: token.trim() || undefined,
      })
      toast.success(`Added ${created.name}`)
      onAdded(created)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Add failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="workbox"
          autoFocus
          className="h-11 text-base sm:h-9 sm:text-sm"
        />
      </Field>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Host">
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="workbox.tailnet.ts.net"
            className="h-11 text-base sm:h-9 sm:text-sm"
          />
        </Field>
        <div className="w-24">
          <Field label="Port">
            <Input
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="h-11 text-base sm:h-9 sm:text-sm"
            />
          </Field>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <Label htmlFor="addhost-secure" className="cursor-pointer">
          Use HTTPS
        </Label>
        <Switch id="addhost-secure" checked={isSecure} onCheckedChange={setIsSecure} />
      </div>
      <Field label="Token (optional)">
        <Input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          type="password"
          autoComplete="off"
          placeholder="Leave blank for --no-token daemons"
          className="h-11 text-base sm:h-9 sm:text-sm"
        />
      </Field>
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Back
        </Button>
        <Button disabled={submitting} onClick={handleAdd}>
          {submitting ? 'Checking…' : 'Add host'}
        </Button>
      </div>
    </div>
  )
}

function AgentChip({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect(): void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        'rounded-full border px-3 py-1.5 text-sm transition-colors sm:py-1 ' +
        (selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border hover:border-primary/50')
      }
    >
      {label}
    </button>
  )
}
