import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { connectDaemon } from '@/services/sandboxAgent/client'
import type { AgentInfo } from 'sandbox-agent'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const [agents, setAgents] = useState<AgentInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [baseUrl, setBaseUrl] = useState('http://localhost:2468')
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    connectDaemon(baseUrl)
      .then((sdk) => sdk.listAgents())
      .then((res) => {
        if (!cancelled) {
          setAgents(res.agents)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setAgents(null)
          setError(e instanceof Error ? e.message : String(e))
        }
      })
    return () => {
      cancelled = true
    }
  }, [baseUrl, nonce])

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">DroidCode</h1>
        <p className="text-sm text-muted-foreground">
          Phase 1 smoke test · sandbox-agent SDK
        </p>
      </header>

      <div className="flex items-center gap-2">
        <input
          className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          aria-label="Daemon base URL"
        />
        <Button onClick={() => setNonce((n) => n + 1)} size="sm">
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!agents && !error && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {agents && (
        <ul className="flex flex-col gap-2">
          {agents.map((a) => (
            <li
              key={a.id}
              className="rounded border border-border bg-card p-3 text-sm"
            >
              <div className="font-medium">{a.id}</div>
              <div className="text-muted-foreground">
                {a.installed ? 'installed' : 'not installed'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
