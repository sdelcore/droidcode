import { useState } from 'react'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { HomePage } from '@/components/home/HomePage'
import { NewSessionDialog } from '@/components/NewSessionDialog'
import { MobileSessions } from '@/components/mobile/MobileSessions'
import { useIsMobile } from '@/lib/useIsMobile'
import { validateHomeSearch, type HomeSearch } from '@/services/sessions/homeView'

export const Route = createFileRoute('/')({
  component: HomeRoute,
  validateSearch: (raw: Record<string, unknown>): HomeSearch => validateHomeSearch(raw),
})

function HomeRoute() {
  const search = useSearch({ from: '/' })
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [newOpen, setNewOpen] = useState(false)

  if (isMobile) {
    return <MobileSessions search={search} />
  }

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
