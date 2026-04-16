import { useCallback, useRef } from 'react'
import { Send, Square } from 'lucide-react'
import { toast } from 'sonner'
import { useChatStore } from '@/stores'
import { Button } from '@/components/ui/button'

interface ChatInputProps {
  value: string
  onChange(value: string): void
  disabled?: boolean
}

export function ChatInput({ value, onChange, disabled }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const sendPrompt = useChatStore((s) => s.sendPrompt)
  const interrupt = useChatStore((s) => s.interrupt)
  const runClientSlashCommand = useChatStore((s) => s.runClientSlashCommand)

  const handleSend = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (trimmed.startsWith('/')) {
      const name = trimmed.slice(1).split(/\s+/, 1)[0]
      const result = runClientSlashCommand(name)
      if (result.message) {
        if (result.handled) toast.success(result.message)
        else toast.info(result.message)
      }
      if (result.handled) {
        onChange('')
        return
      }
    }
    onChange('')
    try {
      await sendPrompt(trimmed)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Send failed')
    }
  }, [value, onChange, sendPrompt, runClientSlashCommand])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-border bg-background/95 p-3 backdrop-blur">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Connecting…' : 'Message the agent…'}
        rows={1}
        disabled={disabled}
        className="min-h-9 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
      />
      {isStreaming ? (
        <Button size="icon" variant="destructive" onClick={interrupt} aria-label="Interrupt">
          <Square className="size-4" />
        </Button>
      ) : (
        <Button
          size="icon"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          aria-label="Send"
        >
          <Send className="size-4" />
        </Button>
      )}
    </div>
  )
}
