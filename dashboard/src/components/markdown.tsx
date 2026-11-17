import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

const REPO = 'https://github.com/Quixomatic/RollcallBot/blob/main'

/**
 * Where a link inside the docs should go. The same Markdown files are read on
 * GitHub, so relative links are rewritten to dashboard routes here:
 *   guide pages      setup, notifications.md      → /docs/setup
 *   site operations  site-queries/X.graphql        → /docs/api/site/X
 *   source files     ../../src/...                 → GitHub
 */
function resolve(href: string, base: 'guide' | 'api'): { internal: true; to: string; hash?: string } | { internal: false; href: string } {
  if (/^(https?:|mailto:)/.test(href)) return { internal: false, href }
  if (href.startsWith('#')) return { internal: false, href }
  const [path, hash] = href.split('#')
  if (path.startsWith('/docs')) return { internal: true, to: path, hash }
  const site = path.match(/(?:^|\/)site-queries\/(\w+)\.graphql$/)
  if (site) return { internal: true, to: `/docs/api/site/${site[1]}`, hash }
  if (/(?:^|\/)site-queries\/INDEX\.md$/.test(path)) return { internal: true, to: '/docs/api/site', hash }
  if (/meetup-api\/README\.md$/.test(path)) return { internal: true, to: '/docs/api', hash }
  if (path.startsWith('../') || path.startsWith('src/')) {
    return { internal: false, href: `${REPO}/${path.replace(/^(\.\.\/)+/, '')}${hash ? `#${hash}` : ''}` }
  }
  if (base === 'guide' && /^[\w-]+(\.md)?$/.test(path)) return { internal: true, to: `/docs/${path.replace(/\.md$/, '')}`, hash }
  return { internal: false, href }
}

export function Markdown({ children, base = 'guide', className }: { children: string; base?: 'guide' | 'api'; className?: string }) {
  return (
    <div className={cn(
      'prose prose-zinc max-w-none dark:prose-invert',
      'prose-headings:scroll-mt-20 prose-headings:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
      'prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none',
      'prose-pre:border prose-pre:bg-muted prose-pre:text-foreground [&_pre_code]:bg-transparent [&_pre_code]:p-0',
      'prose-table:text-sm prose-th:text-left prose-td:align-top',
      className,
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          a: ({ href = '', children: text }) => {
            const r = resolve(href, base)
            if (r.internal) return <Link to={r.to} hash={r.hash}>{text}</Link>
            const external = /^https?:/.test(r.href)
            return <a href={r.href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{text}</a>
          },
          table: ({ children: rows }) => <div className="overflow-x-auto"><table>{rows}</table></div>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
