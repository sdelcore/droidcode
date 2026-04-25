import { useMemo } from 'react'
import type { PermissionOutcome, PermissionRequestPayload } from '@/services/wagent'
import { useChatStore } from '@/stores'
import { Button } from '@/components/ui/button'

interface PermissionBannerProps {
  sessionId: string
  request: PermissionRequestPayload
}

export function PermissionBanner({ sessionId, request }: PermissionBannerProps) {
  const respond = useChatStore((s) => s.respondPermission)

  const outcomes = useMemo(() => {
    const order: PermissionOutcome[] = ['allow_always', 'allow_once', 'reject']
    return order.filter((o) => (request.availableOutcomes ?? []).includes(o))
  }, [request.availableOutcomes])

  const title = request.toolCall?.title ?? request.toolCall?.name ?? 'Agent requests permission'

  return (
    <div className="border-y border-amber-500/40 bg-amber-500/10 p-3">
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        <div className="text-sm font-medium">{String(title)}</div>
        <div className="flex flex-wrap gap-2">
          {outcomes.map((outcome) => (
            <Button
              key={outcome}
              size="sm"
              variant={outcome === 'reject' ? 'ghost' : 'default'}
              onClick={() => respond(sessionId, request.requestId, outcome)}
            >
              {outcomeLabel(outcome)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

function outcomeLabel(outcome: PermissionOutcome): string {
  switch (outcome) {
    case 'allow_always':
      return 'Allow always'
    case 'allow_once':
      return 'Allow once'
    case 'reject':
      return 'Deny'
  }
}
