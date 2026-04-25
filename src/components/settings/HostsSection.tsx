import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Server, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { fetchHealth, wagentBaseUrl as hostBaseUrl } from '@/services/wagent'
import { useHostStore } from '@/stores'
import type { Host } from '@/types'

export function HostsSection() {
  const hosts = useHostStore((s) => s.hosts)
  const removeHost = useHostStore((s) => s.removeHost)
  const [adding, setAdding] = useState(false)

  async function handleRemove(host: Host) {
    if (!window.confirm(`Remove host "${host.name}"? Sessions stay registered with the daemon.`)) {
      return
    }
    try {
      await removeHost(host.id)
      toast.success(`Removed ${host.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Remove failed')
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Hosts</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sandbox-agent daemons droidcode can reach.
          </p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {adding && (
          <AddHostForm
            onCancel={() => setAdding(false)}
            onAdded={() => setAdding(false)}
          />
        )}
        {hosts.length === 0 && !adding ? (
          <p className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No hosts yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hosts.map((h) => (
              <li
                key={h.id}
                className="flex items-start justify-between gap-2 rounded-md border border-border p-3"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Server className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{h.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {hostBaseUrl(h)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {h.lastConnected
                        ? `Last connected ${new Date(h.lastConnected).toLocaleString()}`
                        : 'Never connected'}
                    </p>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleRemove(h)}
                  aria-label="Remove host"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

interface AddHostFormProps {
  onCancel(): void
  onAdded(host: Host): void
}

function AddHostForm({ onCancel, onAdded }: AddHostFormProps) {
  const addHost = useHostStore((s) => s.addHost)
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('2468')
  const [isSecure, setIsSecure] = useState(false)
  const [token, setToken] = useState('')
  const [companionUrl, setCompanionUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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
        companionUrl: companionUrl.trim() || undefined,
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
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-md border border-border p-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="host-name">Name</Label>
        <Input
          id="host-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="workbox"
          autoFocus
          className="h-11 text-base sm:h-9 sm:text-sm"
        />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="host-addr">Host</Label>
          <Input
            id="host-addr"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="workbox.tailnet.ts.net"
            className="h-11 text-base sm:h-9 sm:text-sm"
          />
        </div>
        <div className="flex w-24 flex-col gap-1.5">
          <Label htmlFor="host-port">Port</Label>
          <Input
            id="host-port"
            inputMode="numeric"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            className="h-11 text-base sm:h-9 sm:text-sm"
          />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <Label htmlFor="host-secure" className="cursor-pointer">
          Use HTTPS
        </Label>
        <Switch id="host-secure" checked={isSecure} onCheckedChange={setIsSecure} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="host-token">Token (optional)</Label>
        <Input
          id="host-token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          type="password"
          autoComplete="off"
          className="h-11 text-base sm:h-9 sm:text-sm"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="host-companion">Companion URL (optional)</Label>
        <Input
          id="host-companion"
          value={companionUrl}
          onChange={(e) => setCompanionUrl(e.target.value)}
          placeholder={`http://${host || 'host'}:2469`}
          className="h-11 text-base sm:h-9 sm:text-sm"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Checking…' : 'Add host'}
        </Button>
      </div>
    </form>
  )
}
