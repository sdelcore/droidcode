import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  interrupt,
  runClientSlashCommand,
  sendPrompt,
  useChatPane,
} from '@/stores'
import { agentName, agentTone, hostHue } from '@/services/identity'
import type { Session } from '@/services/wagent'
import type { Host } from '@/types'

interface MobileComposerProps {
  host: Host
  session: Session
  broadcast: boolean
  broadcastTargets: { hostId: number; sessionId: string }[]
  onToggleBroadcast(): void
}

export function MobileComposer({
  host,
  session,
  broadcast,
  broadcastTargets,
  onToggleBroadcast,
}: MobileComposerProps) {
  const [value, setValue] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)
  const isStreaming = useChatPane(session.id)?.isStreaming ?? false
  const hue = hostHue(host.id)
  const tone = agentTone(session.agent)
  const cwdTail = (session.cwd ?? '').split('/').filter(Boolean).slice(-1)[0] ?? ''

  const handleSend = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed) return

    // Slash commands run only against the active session, not broadcast.
    if (trimmed.startsWith('/')) {
      const name = trimmed.slice(1).split(/\s+/, 1)[0]
      const result = runClientSlashCommand(session.id, name)
      if (result.message) {
        if (result.handled) toast.success(result.message)
        else toast.info(result.message)
      }
      if (result.handled) {
        setValue('')
        return
      }
    }

    setValue('')

    try {
      if (broadcast && broadcastTargets.length > 0) {
        // Fan out the same prompt to every pinned session.
        await Promise.allSettled(
          broadcastTargets.map((t) => sendPrompt(t.sessionId, trimmed)),
        )
        toast.success(`Broadcast to ${broadcastTargets.length} sessions`)
      } else {
        await sendPrompt(session.id, trimmed)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed')
    }
  }, [value, session.id, broadcast, broadcastTargets])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="m-composer">
      <div className="scope">
        {broadcast ? (
          <button
            type="button"
            className="scope-chip broadcast"
            onClick={onToggleBroadcast}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
            </svg>
            broadcast · {broadcastTargets.length} sessions
          </button>
        ) : (
          <>
            <span
              className="scope-chip"
              style={{ '--c': hue } as React.CSSProperties}
            >
              <span className="swatch" />
              {host.name}/{cwdTail}
            </span>
            <span className="scope-chip" style={{ color: tone }}>
              {agentName(session.agent)}
            </span>
            {session.mode && (
              <span className="scope-chip">{session.mode}</span>
            )}
            {broadcastTargets.length > 1 && (
              <button
                type="button"
                className="scope-chip"
                onClick={onToggleBroadcast}
                aria-label="Enable broadcast"
              >
                + broadcast
              </button>
            )}
          </>
        )}
      </div>
      <div className="box">
        <textarea
          ref={textRef}
          rows={1}
          placeholder={
            broadcast
              ? `Message all ${broadcastTargets.length} sessions…`
              : `Message ${agentName(session.agent)}…`
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {isStreaming ? (
          <button
            type="button"
            className="stopbtn"
            aria-label="Interrupt"
            onClick={() => interrupt(session.id)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
            >
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="send"
            disabled={!value.trim()}
            onClick={handleSend}
            aria-label="Send"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12l14-7-5 16-3-7-6-2z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
