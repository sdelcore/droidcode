import { useCallback, useRef, useState } from 'react'
import { ImagePlus, Send, Square, X } from 'lucide-react'
import { toast } from 'sonner'
import { useChatStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { randomId } from '@/services/util/id'

const MAX_IMAGES = 5

interface ChatInputProps {
  sessionId: string
  value: string
  onChange(value: string): void
  disabled?: boolean
}

interface ImageAttachment {
  id: string
  dataUrl: string
  mimeType: string
}

export function ChatInput({ sessionId, value, onChange, disabled }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<ImageAttachment[]>([])
  const isStreaming = useChatStore((s) => s.byId[sessionId]?.isStreaming ?? false)
  const sendPrompt = useChatStore((s) => s.sendPrompt)
  const interrupt = useChatStore((s) => s.interrupt)
  const runClientSlashCommand = useChatStore((s) => s.runClientSlashCommand)

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return
    const toProcess = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (toProcess.length === 0) return
    for (const file of toProcess) {
      const reader = new FileReader()
      reader.onload = () => {
        setImages((cur) => {
          if (cur.length >= MAX_IMAGES) {
            toast.error(`Maximum ${MAX_IMAGES} images`)
            return cur
          }
          return [
            ...cur,
            { id: randomId(), dataUrl: reader.result as string, mimeType: file.type },
          ]
        })
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }, [])

  const handleSend = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed && images.length === 0) return
    if (trimmed.startsWith('/')) {
      const name = trimmed.slice(1).split(/\s+/, 1)[0]
      const result = runClientSlashCommand(sessionId, name)
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
    const imagesCopy = [...images]
    setImages([])
    try {
      await sendPrompt(sessionId, trimmed, imagesCopy.length > 0 ? imagesCopy : undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Send failed')
    }
  }, [sessionId, value, onChange, images, sendPrompt, runClientSlashCommand])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    const imageFiles: File[] = []
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      const dt = new DataTransfer()
      imageFiles.forEach((f) => dt.items.add(f))
      addFiles(dt.files)
    }
  }

  const canSend = !disabled && (value.trim().length > 0 || images.length > 0)

  return (
    <div className="border-t border-border bg-background/95 backdrop-blur">
      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-3 pt-3">
          {images.map((img) => (
            <div key={img.id} className="group relative shrink-0">
              <img
                src={img.dataUrl}
                alt="Attachment"
                className="size-16 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                className="absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || images.length >= MAX_IMAGES}
          aria-label="Attach image"
        >
          <ImagePlus className="size-4" />
        </Button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={disabled ? 'Connecting…' : 'Message the agent…'}
          rows={1}
          disabled={disabled}
          className="min-h-9 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
        />
        {isStreaming ? (
          <Button
            size="icon"
            variant="destructive"
            onClick={() => interrupt(sessionId)}
            aria-label="Interrupt"
          >
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send"
          >
            <Send className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
