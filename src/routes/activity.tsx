import { createFileRoute } from '@tanstack/react-router'
import { MobileActivity } from '@/components/mobile/MobileActivity'

export const Route = createFileRoute('/activity')({
  component: ActivityRoute,
})

function ActivityRoute() {
  return <MobileActivity />
}
