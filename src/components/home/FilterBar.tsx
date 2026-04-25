import { useRef, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SortPreset } from '@/types'
import type { FacetOption, HomeFilterState, HomeStatus } from '@/services/sessions/homeFilters'

interface FilterBarProps {
  filters: HomeFilterState
  hostFacets: FacetOption<number>[]
  projectFacets: FacetOption<string>[]
  onChange(next: Partial<HomeFilterState>): void
  onClear(): void
}

const SORT_OPTIONS: { value: SortPreset; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'created', label: 'Created (oldest)' },
  { value: 'alpha', label: 'Alphabetical' },
]

const STATUS_OPTIONS: { value: HomeStatus; label: string }[] = [
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
]

export function FilterBar({
  filters,
  hostFacets,
  projectFacets,
  onChange,
  onClear,
}: FilterBarProps) {
  const [query, setQuery] = useState(filters.query)
  const [prevFilterQuery, setPrevFilterQuery] = useState(filters.query)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local draft when the URL query changes externally (back/forward or
  // Clear button). Derived-from-props pattern per the React docs; runs during
  // render so we avoid setState-in-effect cascades.
  if (prevFilterQuery !== filters.query) {
    setPrevFilterQuery(filters.query)
    setQuery(filters.query)
  }

  function onQueryChange(next: string) {
    setQuery(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onChange({ query: next }), 150)
  }

  const activeCount =
    (filters.query.length > 0 ? 1 : 0) +
    filters.hostIds.size +
    filters.projectDirs.size +
    filters.statuses.size +
    (filters.sort !== 'recent' ? 1 : 0)

  const sortLabel =
    SORT_OPTIONS.find((o) => o.value === filters.sort)?.label ?? 'Sort'

  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search sessions…"
              className="h-11 pl-9 text-base sm:h-9 sm:text-sm"
              inputMode="search"
              aria-label="Search sessions"
            />
            {query.length > 0 && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                onClick={() => onQueryChange('')}
                aria-label="Clear search"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-11 shrink-0 sm:h-9"
                aria-label="Sort"
              >
                <SlidersHorizontal className="size-4" />
                <span className="hidden sm:inline">{sortLabel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SORT_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.value}
                  onSelect={() => onChange({ sort: o.value })}
                >
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {activeCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-11 shrink-0 sm:h-9"
              onClick={onClear}
            >
              Clear
            </Button>
          )}
        </div>

        <ChipRow label="Hosts" empty={hostFacets.length <= 1}>
          {hostFacets.map((f) => (
            <FacetChip
              key={f.value}
              label={`${f.label} · ${f.count}`}
              active={filters.hostIds.has(f.value)}
              onClick={() => {
                const next = new Set(filters.hostIds)
                if (next.has(f.value)) next.delete(f.value)
                else next.add(f.value)
                onChange({ hostIds: next })
              }}
            />
          ))}
        </ChipRow>

        <ChipRow label="Projects" empty={projectFacets.length === 0}>
          {projectFacets.map((f) => (
            <FacetChip
              key={f.value}
              label={`${f.label} · ${f.count}`}
              active={filters.projectDirs.has(f.value)}
              onClick={() => {
                const next = new Set(filters.projectDirs)
                if (next.has(f.value)) next.delete(f.value)
                else next.add(f.value)
                onChange({ projectDirs: next })
              }}
            />
          ))}
        </ChipRow>

        <ChipRow label="Status">
          {STATUS_OPTIONS.map((o) => (
            <FacetChip
              key={o.value}
              label={o.label}
              active={filters.statuses.has(o.value)}
              onClick={() => {
                const next = new Set(filters.statuses)
                if (next.has(o.value)) next.delete(o.value)
                else next.add(o.value)
                onChange({ statuses: next })
              }}
            />
          ))}
        </ChipRow>
      </div>
    </div>
  )
}

interface ChipRowProps {
  label: string
  empty?: boolean
  children: React.ReactNode
}

function ChipRow({ label, empty, children }: ChipRowProps) {
  if (empty) return null
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-muted-foreground sm:w-20">{label}</span>
      <div className="-mx-1 flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  )
}

interface FacetChipProps {
  label: string
  active: boolean
  onClick(): void
}

function FacetChip({ label, active, onClick }: FacetChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'shrink-0 snap-start rounded-full border px-3 py-1.5 text-xs transition-colors sm:py-1 ' +
        (active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border hover:border-primary/50')
      }
    >
      {label}
    </button>
  )
}
