import { useState } from 'react'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { HomePage } from '@/components/home/HomePage'
import { NewSessionDialog } from '@/components/NewSessionDialog'
import { validateHomeSearch, type HomeSearch } from '@/services/sessions/homeFilters'

export const Route = createFileRoute('/')({
  component: HomeRoute,
  validateSearch: (raw: Record<string, unknown>): HomeSearch => validateHomeSearch(raw),
})

function HomeRoute() {
  const search = useSearch({ from: '/' })
  const navigate = useNavigate()
  const [newOpen, setNewOpen] = useState(false)

  return (
    <>
      <HomePage search={search} onRequestNewSession={() => setNewOpen(true)} />
      <NewSessionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(hostId, sessionId) =>
          navigate({
            to: '/chat/$hostId/$sessionId',
            params: { hostId: String(hostId), sessionId },
          })
        }
      />
    </>
  )
}
