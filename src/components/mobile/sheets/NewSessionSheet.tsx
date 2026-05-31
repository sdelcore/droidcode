import { NewSessionDialog } from '@/components/NewSessionDialog'

interface NewSessionSheetProps {
  onClose(): void
  onCreated(hostId: number, sessionId: string): void
  initialHostId?: number
  initialCwd?: string
}

// Bridge between the mobile sessions screen and the existing wagent-aware
// NewSessionDialog (which already renders as a bottom sheet on narrow
// viewports). Keeping the bridge so the mobile flow has a single import.
export function NewSessionSheet({ onClose, onCreated, initialHostId, initialCwd }: NewSessionSheetProps) {
  return (
    <NewSessionDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      onCreated={onCreated}
      initialHostId={initialHostId}
      initialCwd={initialCwd}
    />
  )
}
