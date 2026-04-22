import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, FolderOpen, Loader2, Pin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { listFsEntries, type FsEntry } from '@/services/sandboxAgent/fs'
import type { Host, ProjectFolder } from '@/types'

interface FolderComboboxProps {
  host: Host | null
  value: string
  onChange(value: string): void
  rememberedFolders?: ProjectFolder[]
  disabled?: boolean
  placeholder?: string
  id?: string
}

export function FolderCombobox({
  host,
  value,
  onChange,
  rememberedFolders = [],
  disabled,
  placeholder = '/home/you/src/project',
  id,
}: FolderComboboxProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Close the dropdown when a click/tap lands outside the container.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        disabled={disabled}
        placeholder={placeholder}
        className="h-11 text-base sm:h-9 sm:text-sm"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {open && (
        <FolderDropdown
          host={host}
          value={value}
          rememberedFolders={rememberedFolders}
          onPick={(path) => {
            // Navigate into: update input but keep dropdown open so the
            // user can keep drilling without re-focusing.
            onChange(path)
          }}
        />
      )}
    </div>
  )
}

interface FolderDropdownProps {
  host: Host | null
  value: string
  rememberedFolders: ProjectFolder[]
  onPick(path: string): void
}

function FolderDropdown({ host, value, rememberedFolders, onPick }: FolderDropdownProps) {
  const trimmed = value.trim()
  const isAbsolute = trimmed.startsWith('/')
  const currentPath = isAbsolute ? trimmed : '/'
  const parent = currentPath === '/' ? null : parentOf(currentPath)

  // Result state keyed by the path it came from, so we can derive "loading"
  // from `state.path !== currentPath` without an extra setState on every
  // effect fire (which the react-hooks linter disallows).
  const [state, setState] = useState<{
    path: string | null
    entries: FsEntry[]
    error: string | null
  }>({ path: null, entries: [], error: null })
  const loading = host !== null && state.path !== currentPath
  const entries = state.entries
  const error = state.error

  useEffect(() => {
    if (!host) return
    let cancelled = false
    listFsEntries(host, currentPath)
      .then((rows) => {
        if (cancelled) return
        setState({
          path: currentPath,
          entries: rows
            .filter((r) => r.entryType === 'directory')
            .sort((a, b) => a.name.localeCompare(b.name)),
          error: null,
        })
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          path: currentPath,
          entries: [],
          error: err instanceof Error ? err.message : 'Browse failed',
        })
      })
    return () => {
      cancelled = true
    }
  }, [host, currentPath])

  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
      {rememberedFolders.length > 0 && (
        <div className="border-b border-border/60">
          <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Recent
          </div>
          {rememberedFolders.slice(0, 6).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.directory)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Pin className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
                {p.directory}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="sticky top-0 border-b border-border bg-popover/95 px-3 py-1.5 font-mono text-[11px] text-muted-foreground backdrop-blur">
        {currentPath}
      </div>

      {parent && (
        <button
          type="button"
          onClick={() => onPick(parent)}
          className="flex w-full items-center gap-2 border-b border-border/50 px-3 py-2.5 text-left text-sm hover:bg-accent sm:py-2"
        >
          <ChevronLeft className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Back</span>
        </button>
      )}

      {!host ? (
        <div className="p-3 text-sm text-muted-foreground">Pick a host first.</div>
      ) : loading ? (
        <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <div className="p-3 text-sm text-destructive">{error}</div>
      ) : entries.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground">No subfolders.</div>
      ) : (
        entries.map((e) => (
          <button
            key={e.path}
            type="button"
            onClick={() => onPick(e.path)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent sm:py-2"
          >
            <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{e.name}</span>
          </button>
        ))
      )}
    </div>
  )
}

function parentOf(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  if (i <= 0) return '/'
  return trimmed.slice(0, i)
}
