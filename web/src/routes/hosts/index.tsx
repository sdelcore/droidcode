import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHostStore } from '@/stores'
import { hostBaseUrl } from '@/services/sandboxAgent/client'
import type { Host } from '@/types'

export const Route = createFileRoute('/hosts/')({
  component: HostsIndex,
})

function HostsIndex() {
  const hosts = useHostStore((s) => s.hosts)
  const isLoading = useHostStore((s) => s.isLoading)
  const error = useHostStore((s) => s.error)

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hosts</h1>
          <p className="text-sm text-muted-foreground">
            Sandbox-agent daemons droidcode can connect to.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/hosts/add">Add host</Link>
        </Button>
      </div>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!isLoading && hosts.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-3">
          {hosts.map((h) => (
            <HostRow key={h.id} host={h} />
          ))}
        </ul>
      )}
    </main>
  )
}

function HostRow({ host }: { host: Host }) {
  const removeHost = useHostStore((s) => s.removeHost)
  const navigate = useNavigate()

  const handleRemove = async () => {
    try {
      await removeHost(host.id)
      toast.success(`Removed ${host.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Remove failed')
    }
  }

  return (
    <li>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{host.name}</CardTitle>
            <p className="truncate text-xs text-muted-foreground">{hostBaseUrl(host)}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              onClick={() => navigate({ to: '/projects/$hostId', params: { hostId: String(host.id) } })}
            >
              Open
            </Button>
            <Button size="sm" variant="ghost" onClick={handleRemove}>
              Remove
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 text-xs text-muted-foreground">
          {host.lastConnected
            ? `Last connected ${new Date(host.lastConnected).toLocaleString()}`
            : 'Never connected'}
        </CardContent>
      </Card>
    </li>
  )
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No hosts yet. Add one to connect to a sandbox-agent daemon.
        </p>
        <Button asChild size="sm">
          <Link to="/hosts/add">Add your first host</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
