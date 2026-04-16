import { useEffect, useState } from 'react'
import { Link, createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useConfigStore, useHostStore, useProjectStore } from '@/stores'
import type { ProjectFolder } from '@/types'

export const Route = createFileRoute('/projects/$hostId')({
  component: ProjectsForHost,
})

function ProjectsForHost() {
  const { hostId } = useParams({ from: '/projects/$hostId' })
  const numericHostId = Number(hostId)
  const navigate = useNavigate()

  const host = useHostStore((s) => s.hosts.find((h) => h.id === numericHostId))
  const projects = useProjectStore((s) => s.byHost[numericHostId] ?? [])
  const loadForHost = useProjectStore((s) => s.loadForHost)
  const rememberProject = useProjectStore((s) => s.rememberProject)
  const removeProject = useProjectStore((s) => s.removeProject)

  const agents = useConfigStore((s) => s.agentsByHost[numericHostId] ?? [])
  const loadAgents = useConfigStore((s) => s.loadAgents)
  const agentsError = useConfigStore((s) => s.error)

  const [newDir, setNewDir] = useState('')
  const [newName, setNewName] = useState('')

  useEffect(() => {
    loadForHost(numericHostId)
    if (host) loadAgents(numericHostId)
  }, [numericHostId, host, loadForHost, loadAgents])

  if (!host) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <p className="text-sm text-muted-foreground">Host not found.</p>
        <Button asChild size="sm" variant="outline">
          <Link to="/hosts">Back to hosts</Link>
        </Button>
      </main>
    )
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const directory = newDir.trim()
    if (!directory) {
      toast.error('Directory required')
      return
    }
    try {
      const project = await rememberProject({
        hostId: numericHostId,
        name: newName.trim() || directory.split('/').filter(Boolean).pop() || directory,
        directory,
      })
      setNewDir('')
      setNewName('')
      toast.success(`Remembered ${project.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed')
    }
  }

  function openProject(p: ProjectFolder) {
    navigate({
      to: '/sessions/$hostId/$projectId',
      params: { hostId: String(numericHostId), projectId: String(p.id) },
    })
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/hosts" className="hover:text-foreground">
            Hosts
          </Link>
          <span>/</span>
          <span>{host.name}</span>
        </div>
        <h1 className="text-2xl font-semibold">{host.name}</h1>
        <p className="text-sm text-muted-foreground">
          {host.isSecure ? 'https' : 'http'}://{host.host}:{host.port}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agents on this host</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {agentsError && (
            <p className="text-sm text-destructive">{agentsError}</p>
          )}
          {!agentsError && agents.length === 0 && (
            <p className="text-sm text-muted-foreground">Loading agents…</p>
          )}
          {agents.map((a) => (
            <Badge key={a.id} variant={a.installed ? 'default' : 'secondary'}>
              {a.id}
              {!a.installed && ' · not installed'}
              {a.installed && !a.credentialsAvailable && ' · no creds'}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Separator />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Project directories</h2>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form className="grid grid-cols-[1fr_1fr_auto] items-end gap-2" onSubmit={handleAdd}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dir">Directory</Label>
                <Input
                  id="dir"
                  value={newDir}
                  onChange={(e) => setNewDir(e.target.value)}
                  placeholder="/home/sdelcore/src/droidcode"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nm">Name (optional)</Label>
                <Input
                  id="nm"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="droidcode"
                />
              </div>
              <Button type="submit" size="sm">
                Remember
              </Button>
            </form>
          </CardContent>
        </Card>

        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No directories remembered yet. Add one above.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Card>
                  <CardContent className="flex flex-row items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p.directory}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" onClick={() => openProject(p)}>
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await removeProject(p.id)
                          toast.success('Removed')
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
