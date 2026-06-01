import { useHostStore } from '@/stores'
import { hostHue } from '@/services/identity'
import { wagentBaseUrl } from '@/services/wagent'

interface HostsSheetProps {
  activeHostId?: number
  onClose(): void
  onPick(hostId: number): void
}

export function HostsSheet({ activeHostId, onClose, onPick }: HostsSheetProps) {
  const hosts = useHostStore((s) => s.hosts)

  return (
    <div className="m-sheet-scrim" onClick={onClose}>
      <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <span className="grabber" />
        <h2>Switch host</h2>
        <div className="lede">
          Spawn the next session on a different machine. Existing pinned sessions stay.
        </div>
        <div className="m-host-pick">
          {hosts.map((h) => {
            const hue = hostHue(h.id)
            const isSelected = h.id === activeHostId
            return (
              <button
                key={h.id}
                type="button"
                className={'opt' + (isSelected ? ' selected' : '')}
                style={{ '--c': hue } as React.CSSProperties}
                onClick={() => onPick(h.id)}
              >
                <div className="name">{h.name}</div>
                <div className="addr">{wagentBaseUrl(h)}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
