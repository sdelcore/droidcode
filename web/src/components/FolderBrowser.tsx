import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ChevronRight, FolderOpen, Home, Loader2, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { listFsEntries, type FsEntry } from '@/services/sandboxAgent/fs'
import { fetchBootstrapMeta } from '@/services/sync/companion'
import type { Host } from '@/types'

interface FolderBrowserProps {
  host: Host | null
  open: boolean
  onOpenChange(open: boolean): void
  initialPath?: string
  onSelect(absolutePath: string): void
}

export function FolderBrowser(props: FolderBrowserProps) {
  const isNarrow = useIsNarrow()
  if (isNarrow) {
    return (
      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent side="bottom" className="flex h-[85dvh] flex-col rounded-t-xl p-0">
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>Browse folders</SheetTitle>
          </SheetHeader>
          <BrowserBody {...props} />
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[80dvh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle>Browse folders</DialogTitle>
        </DialogHeader>
        <BrowserBody {...props} />
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

function BrowserBody({ host, initialPath, onOpenChange, onSelect }: FolderBrowserProps) {
  const [home, setHome] = useState<string | null>(null)
  const [path, setPath] = useState<string | null>(initialPath ?? null)
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchBootstrapMeta().then((meta) => {
      if (cancelled) return
      const h = meta?.home ?? '/'
      setHome(h)
      if (!path) setPath(h)
    })
    return () => {
      cancelled = true
    }
    // We only want this once per open; path is updated in-flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!host || !path) return
    let cancelled = false
    setLoading(true)
    setError(null)
    listFsEntries(host, path)
      .then((rows) => {
        if (cancelled) return
        setEntries(rows.filter((e) => e.entryType === 'directory'))
      })
      .catch((err) => {
        if (cancelled) return
        setEntries([])
        setError(err instanceof Error ? err.message : 'Browse failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [host, path])

  function navigateUp() {
    if (!path || path === '/') return
    const parent = path.replace(/\/[^/]+\/?$/, '') || '/'
    setPath(parent)
  }

  function navigateInto(entry: FsEntry) {
    setPath(entry.path)
  }

  function confirmSelect() {
    if (!path) return
    onSelect(path)
    onOpenChange(false)
  }

  if (!host) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Pick a host first.
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap text-xs">
          <Button
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            onClick={() => home && setPath(home)}
            aria-label="Home"
            disabled={!home}
          >
            <Home className="size-3.5" />
          </Button>
          {path && <Breadcrumbs path={path} onNavigate={setPath} />}
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto size-7 shrink-0"
            onClick={() => setPath((p) => p ?? null)}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {path && path !== '/' && (
          <button
            type="button"
            onClick={navigateUp}
            className="flex items-center gap-2 border-b border-border px-4 py-3 text-left text-sm hover:bg-accent sm:py-2"
          >
            <ChevronRight className="size-4 rotate-180 text-muted-foreground" />
            <span className="text-muted-foreground">Up one level</span>
          </button>
        )}
        {loading ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Empty folder.</div>
        ) : (
          entries
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((e) => (
              <button
                key={e.path}
                type="button"
                onClick={() => navigateInto(e)}
                className="flex items-center gap-2 border-b border-border/50 px-4 py-3 text-left text-sm hover:bg-accent sm:py-2"
              >
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{e.name}</span>
                <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </button>
            ))
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border p-3">
        <div className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {path ?? '—'}
        </div>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          disabled={!path}
          onClick={() => {
            if (!path) {
              toast.error('No folder selected')
              return
            }
            confirmSelect()
          }}
        >
          Use this folder
        </Button>
      </div>
    </div>
  )
}

function Breadcrumbs({ path, onNavigate }: { path: string; onNavigate(p: string): void }) {
  const segments = path.split('/').filter(Boolean)
  return (
    <>
      <button
        type="button"
        onClick={() => onNavigate('/')}
        className="shrink-0 rounded px-1.5 py-0.5 font-mono hover:bg-accent"
      >
        /
      </button>
      {segments.map((seg, i) => {
        const subPath = '/' + segments.slice(0, i + 1).join('/')
        return (
          <span key={subPath} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onNavigate(subPath)}
              className="rounded px-1.5 py-0.5 font-mono hover:bg-accent"
            >
              {seg}
            </button>
            {i < segments.length - 1 && (
              <ChevronRight className="size-3 text-muted-foreground" />
            )}
          </span>
        )
      })}
    </>
  )
}
