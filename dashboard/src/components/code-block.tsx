import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Monospace block with a copy button. */
export function CodeBlock({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className={cn('group relative', className)}>
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 font-mono text-xs leading-relaxed">{code}</pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute right-2 top-2 size-7 opacity-0 transition-opacity group-hover:opacity-100"
        title="Copy"
        onClick={() => navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  )
}
