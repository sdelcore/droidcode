import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { HomePage } from '@/components/home/HomePage'
import { validateHomeSearch, type HomeSearch } from '@/services/sessions/homeFilters'

export const Route = createFileRoute('/')({
  component: HomeRoute,
  validateSearch: (raw: Record<string, unknown>): HomeSearch => validateHomeSearch(raw),
})

function HomeRoute() {
  const search = useSearch({ from: '/' })
  const navigate = useNavigate()
  // Placeholder: the unified New Session modal lands in the next commit.
  // Until then, the old drill-down at /hosts still works and can reach
  // the existing NewSessionDialog via a project page.
  const requestNewSession = () => navigate({ to: '/hosts' })

  return <HomePage search={search} onRequestNewSession={requestNewSession} />
}
