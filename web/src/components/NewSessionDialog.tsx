import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { AgentInfo } from 'sandbox-agent'
import { useConfigStore, useSessionStore } from '@/stores'
import { sessionPreferencesRepository } from '@/services/db'
import { formatError } from '@/services/errors/formatError'
import { useMetadataStore } from '@/stores/metadataStore'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface NewSessionDialogProps {
  hostId: number
  cwd: string
  open: boolean
  onOpenChange(open: boolean): void
  onCreated(sessionId: string): void
}

const EMPTY_AGENTS: AgentInfo[] = []

export function NewSessionDialog({
  hostId,
  cwd,
  open,
  onOpenChange,
  onCreated,
}: NewSessionDialogProps) {
  const agents = useConfigStore((s) => s.agentsByHost[hostId] ?? EMPTY_AGENTS)
  const loadAgents = useConfigStore((s) => s.loadAgents)
  const createSession = useSessionStore((s) => s.createSession)

  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      loadAgents(hostId)
      setName('')
    }
  }, [open, hostId, loadAgents])

  const installed = agents.filter((a) => a.installed && a.credentialsAvailable)

  useEffect(() => {
    if (!selectedAgent && installed.length > 0) {
      setSelectedAgent(installed[0].id)
    }
  }, [installed, selectedAgent])

  async function handleCreate() {
    if (!selectedAgent) return
    setSubmitting(true)
    try {
      const record = await createSession(hostId, { agent: selectedAgent, cwd })
      const alias = name.trim()
      if (alias) {
        await sessionPreferencesRepository.save({
          sessionId: record.id,
          hostId,
          agent: selectedAgent,
          alias,
        })
        useMetadataStore.getState().upsertSession(hostId, {
          id: record.id,
          alias,
        })
      }
      onCreated(record.id)
      onOpenChange(false)
    } catch (error) {
      console.error('createSession failed', error)
      const msg = formatError(error, 'Create failed')
      const hint = /internal/i.test(msg)
        ? `. Check that ${cwd} exists on the host and the agent has permission.`
        : ''
      toast.error(`${msg}${hint}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New session</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Directory</Label>
            <p className="truncate text-sm">{cwd}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-name" className="text-xs text-muted-foreground">
              Name (optional)
            </Label>
            <Input
              id="session-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Phase 7 plan"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Agent</Label>
            {installed.length === 0 ? (
              <p className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
                No installed agents with credentials on this host.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {installed.map((a) => (
                  <AgentChip
                    key={a.id}
                    agent={a}
                    selected={a.id === selectedAgent}
                    onSelect={() => setSelectedAgent(a.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={submitting || installed.length === 0 || !selectedAgent}
            onClick={handleCreate}
          >
            {submitting ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AgentChip({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentInfo
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        'rounded-full border px-3 py-1 text-sm transition-colors ' +
        (selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border hover:border-primary/50')
      }
    >
      {agent.id}
    </button>
  )
}
