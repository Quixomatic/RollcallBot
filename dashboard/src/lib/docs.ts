import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface CommandOption {
  name: string
  type: string
  description: string
  required: boolean
  autocomplete: boolean
  choices: string[] | null
  min: number | null
  max: number | null
  channelTypes: string | null
  options?: CommandOption[]
}

export interface CommandDoc {
  name: string
  description: string
  permission: string
  subcommands: CommandOption[]
  options: CommandOption[]
  guide: string | null
}

export interface SiteOperation {
  name: string
  kind: 'query' | 'mutation' | 'subscription' | 'fragment'
  usedBy: string | null
  observed: boolean
  hash: string | null
  variables: string | null
}

const forever = { staleTime: Infinity }

export const docsIndexQuery = queryOptions({ queryKey: ['docs'], queryFn: () => api<{ guide: { slug: string; title: string }[] }>('/docs'), ...forever })
export const guideQuery = (slug: string) => queryOptions({ queryKey: ['docs', 'guide', slug], queryFn: () => api<{ title: string; markdown: string }>(`/docs/guide/${slug}`), ...forever })
export const commandsQuery = queryOptions({ queryKey: ['docs', 'commands'], queryFn: () => api<CommandDoc[]>('/docs/commands'), ...forever })
export const apiGuideQuery = queryOptions({ queryKey: ['docs', 'api'], queryFn: () => api<{ markdown: string }>('/docs/api'), ...forever })
export const rollcallQueriesQuery = queryOptions({
  queryKey: ['docs', 'api', 'queries'],
  queryFn: () => api<{ constant: string; operation: string; kind: string; text: string }[]>('/docs/api/queries'),
  ...forever,
})
export const siteOpsQuery = queryOptions({ queryKey: ['docs', 'api', 'site'], queryFn: () => api<{ intro: string; operations: SiteOperation[] }>('/docs/api/site'), ...forever })
export const siteOpQuery = (name: string) => queryOptions({ queryKey: ['docs', 'api', 'site', name], queryFn: () => api<{ name: string; text: string }>(`/docs/api/site/${name}`), ...forever })
