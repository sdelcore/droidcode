import { memo, useCallback, useState, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'

interface MarkdownProps {
  content: string
}

export const Markdown = memo(function Markdown({ content }: MarkdownProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: Pre,
          code: Code,
          a: Anchor,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

function Anchor(props: ComponentPropsWithoutRef<'a'>) {
  return (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  )
}

function Pre({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const el = (props as { ref?: { current?: HTMLPreElement } }).ref
    const text =
      (el && typeof el === 'object' && 'current' in el
        ? el.current?.textContent
        : undefined) ?? (typeof children === 'string' ? children : '')

    // Walk the children to find the code text
    let codeText = ''
    if (children && typeof children === 'object' && 'props' in (children as React.ReactElement)) {
      const codeProps = (children as React.ReactElement).props as { children?: string }
      codeText = codeProps.children ?? ''
    }

    navigator.clipboard.writeText(codeText || text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [children, props])

  return (
    <div className="group/code relative">
      <pre {...props}>{children}</pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded-md bg-muted/80 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/code:opacity-100"
        aria-label="Copy code"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}

function Code({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
  const isBlock = className?.startsWith('language-')
  const language = className?.replace('language-', '') ?? ''

  if (!isBlock) {
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]" {...props}>
        {children}
      </code>
    )
  }

  return (
    <>
      {language && (
        <div className="flex items-center bg-muted/50 px-3 py-1 font-mono text-[11px] text-muted-foreground">
          {language}
        </div>
      )}
      <code className={className} {...props}>
        {children}
      </code>
    </>
  )
}
