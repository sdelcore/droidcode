import { useState } from 'react'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import { useHostStore, useSettingsStore } from '@/stores'
import { fetchHealth, wagentBaseUrl } from '@/services/wagent'
import { hostHue } from '@/services/identity'
import type { Host } from '@/types'

declare const __APP_VERSION__: string

export function MobileSettings() {
  const hosts = useHostStore((s) => s.hosts)
  const { theme = 'dark', setTheme } = useTheme()
  const autoAccept = useSettingsStore((s) => s.autoAcceptPermissions)
  const setAutoAccept = useSettingsStore((s) => s.setAutoAcceptPermissions)
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="mobile-shell">
      <div className="m-scroll" style={{ padding: 0 }}>
        <div className="m-list">
          <div className="h">
            <h2>Settings</h2>
          </div>

          <div className="m-sect-label">
            <span>Hosts</span>
            <span>{hosts.length}</span>
          </div>
          {hosts.map((h) => (
            <HostRow key={h.id} host={h} />
          ))}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="m-row"
            style={
              {
                background: 'transparent',
                borderStyle: 'dashed',
                justifyContent: 'center',
                color: 'var(--muted-foreground)',
                '--c': 'var(--muted-foreground)',
              } as React.CSSProperties
            }
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              + Add host (paste wagent URL)
            </span>
          </button>

          <div className="m-sect-label">
            <span>Preferences</span>
          </div>
          <PrefToggle
            label="Theme"
            value={theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'}
            onCycle={() => {
              const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark'
              setTheme(next)
            }}
          />
          <PrefToggle
            label="Auto-accept permissions"
            value={autoAccept ? 'All tools' : 'Manual approval'}
            onCycle={() => setAutoAccept(!autoAccept)}
          />

          <div className="m-sect-label">
            <span>About</span>
          </div>
          <div
            className="m-row"
            style={{ '--c': 'var(--muted-foreground)' } as React.CSSProperties}
          >
            <div className="meta">
              <div className="title">droidcode</div>
              <div className="sub">v{__APP_VERSION__} · wagent client · MIT</div>
            </div>
          </div>
        </div>
      </div>

      {addOpen && (
        <AddHostSheet onClose={() => setAddOpen(false)} />
      )}
    </div>
  )
}

interface PrefRowProps {
  label: string
  value: string
  onCycle(): void
}

function PrefToggle({ label, value, onCycle }: PrefRowProps) {
  return (
    <button
      type="button"
      className="m-row"
      onClick={onCycle}
      style={{ '--c': 'var(--muted-foreground)' } as React.CSSProperties}
    >
      <div className="meta">
        <div className="title">{label}</div>
        <div className="sub">{value}</div>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: 'var(--muted-foreground)' }}
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  )
}

function HostRow({ host }: { host: Host }) {
  const removeHost = useHostStore((s) => s.removeHost)
  const hue = hostHue(host.id)

  async function handleDelete() {
    if (!window.confirm(`Remove host "${host.name}"?`)) return
    try {
      await removeHost(host.id)
      toast.success(`Removed ${host.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Remove failed')
    }
  }

  return (
    <div
      className="m-row"
      style={{ '--c': hue } as React.CSSProperties}
      onClick={handleDelete}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleDelete()
      }}
    >
      <div className="meta">
        <div className="title">
          <span>{host.name}</span>
        </div>
        <div className="sub">
          <span className="dot" />
          <span>{host.lastConnected ? 'connected' : 'never connected'}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{wagentBaseUrl(host)}</span>
        </div>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: 'var(--muted-foreground)' }}
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </div>
  )
}

interface AddHostSheetProps {
  onClose(): void
}

function AddHostSheet({ onClose }: AddHostSheetProps) {
  const addHost = useHostStore((s) => s.addHost)
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('2468')
  const [token, setToken] = useState('')
  const [isSecure, setIsSecure] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleAdd() {
    const portNum = Number.parseInt(port, 10)
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      toast.error('Port must be 1–65535')
      return
    }
    if (!name.trim() || !host.trim()) {
      toast.error('Name and host are required')
      return
    }
    setSubmitting(true)
    try {
      const baseUrl = wagentBaseUrl({ host: host.trim(), port: portNum, isSecure })
      const healthy = await fetchHealth({ baseUrl })
      if (!healthy) toast.warning(`Could not reach ${baseUrl}. Saving anyway.`)
      await addHost({
        name: name.trim(),
        host: host.trim(),
        port: portNum,
        isSecure,
        token: token.trim() || undefined,
      })
      toast.success(`Added ${name.trim()}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Add failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="m-sheet-scrim" onClick={onClose}>
      <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <span className="grabber" />
        <h2>Add host</h2>
        <div className="lede">Paste a wagent URL and (optionally) a bearer token.</div>

        <div className="m-field">
          <label>Name</label>
          <input
            className="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="workbox"
          />
        </div>

        <div className="m-field">
          <label>Host</label>
          <input
            className="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="workbox.tailnet.ts.net"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8 }}>
          <div className="m-field">
            <label>Port</label>
            <input
              className="text"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </div>
          <div className="m-field">
            <label>HTTPS</label>
            <button
              type="button"
              className="text"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              onClick={() => setIsSecure((s) => !s)}
            >
              {isSecure ? 'on' : 'off'}
            </button>
          </div>
        </div>

        <div className="m-field">
          <label>Token (optional)</label>
          <input
            className="text"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Leave blank for --no-token daemons"
          />
        </div>

        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={submitting}
            onClick={handleAdd}
          >
            {submitting ? 'Checking…' : 'Add host'}
          </button>
        </div>
      </div>
    </div>
  )
}
