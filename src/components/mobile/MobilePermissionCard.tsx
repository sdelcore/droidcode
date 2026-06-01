import type { PermissionOutcome, PermissionRequestPayload } from '@/services/wagent'
import { respondPermission } from '@/stores'

interface MobilePermissionCardProps {
  sessionId: string
  request: PermissionRequestPayload
}

export function MobilePermissionCard({ sessionId, request }: MobilePermissionCardProps) {
  const title = request.toolCall?.title ?? request.toolCall?.name ?? 'tool'
  const available = (request.availableOutcomes ?? []) as PermissionOutcome[]
  const allowOutcome: PermissionOutcome | null = available.includes('allow_once')
    ? 'allow_once'
    : available.includes('allow_always')
      ? 'allow_always'
      : null
  const denyOutcome: PermissionOutcome | null = available.includes('reject') ? 'reject' : null

  return (
    <div className="m-perm">
      <div className="head">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        Permission · {request.toolCall?.name ?? 'tool'}
      </div>
      <div className="what">{String(title)}</div>
      <div className="reason">
        Tools that touch the filesystem or run shell commands need approval before they execute.
      </div>
      <div className="actions">
        {denyOutcome && (
          <button
            type="button"
            className="btn deny"
            onClick={() => respondPermission(sessionId, request.requestId, denyOutcome)}
          >
            Deny
          </button>
        )}
        {allowOutcome && (
          <button
            type="button"
            className="btn allow"
            onClick={() => respondPermission(sessionId, request.requestId, allowOutcome)}
          >
            {allowOutcome === 'allow_always' ? 'Allow always' : 'Allow once'}
          </button>
        )}
      </div>
    </div>
  )
}
