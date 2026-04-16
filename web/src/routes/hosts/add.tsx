import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHostStore } from '@/stores'
import { fetchHealth, hostBaseUrl } from '@/services/sandboxAgent/client'

export const Route = createFileRoute('/hosts/add')({
  component: AddHost,
})

function AddHost() {
  const navigate = useNavigate()
  const addHost = useHostStore((s) => s.addHost)

  const [name, setName] = useState('')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('2468')
  const [isSecure, setIsSecure] = useState(false)
  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const portNum = Number(port)
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      toast.error('Port must be an integer between 1 and 65535')
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
      if (!healthy) {
        toast.warning(`Could not reach ${baseUrl}. Saving anyway.`)
      }
      const created = await addHost({
        name: name.trim(),
        host: host.trim(),
        port: portNum,
        isSecure,
        token: token.trim() || undefined,
      })
      toast.success(`Added ${created.name}`)
      navigate({ to: '/projects/$hostId', params: { hostId: String(created.id) } })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Add failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Add host</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nightman"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="host">Host</Label>
                <Input
                  id="host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="localhost"
                />
              </div>
              <div className="flex w-24 flex-col gap-1.5">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  inputMode="numeric"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded border border-border p-3">
              <div>
                <Label htmlFor="secure" className="cursor-pointer">
                  Use HTTPS
                </Label>
                <p className="text-xs text-muted-foreground">
                  Required when reaching via Tailscale Serve
                </p>
              </div>
              <Switch id="secure" checked={isSecure} onCheckedChange={setIsSecure} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="token">Token (optional)</Label>
              <Input
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Leave blank for --no-token daemons"
                type="password"
                autoComplete="off"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" asChild>
                <Link to="/hosts">Cancel</Link>
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Checking…' : 'Add host'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
