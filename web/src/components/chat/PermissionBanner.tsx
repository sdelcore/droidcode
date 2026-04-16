import { useMemo } from 'react'
import type { SessionPermissionRequest, PermissionReply } from 'sandbox-agent'
import { useChatStore } from '@/stores'
import { Button } from '@/components/ui/button'

interface PermissionBannerProps {
  request: SessionPermissionRequest
}

export function PermissionBanner({ request }: PermissionBannerProps) {
  const respond = useChatStore((s) => s.respondPermission)

  const replies = useMemo(() => {
    const order: PermissionReply[] = ['always', 'once', 'reject']
    return order.filter((r) => request.availableReplies.includes(r))
  }, [request.availableReplies])

  const toolCall = request.toolCall as { title?: string; kind?: string } | undefined
  const title = toolCall?.title ?? toolCall?.kind ?? 'Agent requests permission'

  return (
    <div className="border-y border-amber-500/40 bg-amber-500/10 p-3">
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        <div className="text-sm font-medium">{String(title)}</div>
        <div className="flex flex-wrap gap-2">
          {replies.map((reply) => (
            <Button
              key={reply}
              size="sm"
              variant={reply === 'reject' ? 'ghost' : 'default'}
              onClick={() => respond(request.id, reply)}
            >
              {replyLabel(reply)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

function replyLabel(reply: PermissionReply): string {
  switch (reply) {
    case 'always':
      return 'Allow always'
    case 'once':
      return 'Allow once'
    case 'reject':
      return 'Deny'
  }
}
