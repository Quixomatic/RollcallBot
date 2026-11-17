import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ErrorBlock, LoadingBlock } from '@/components/common'
import { Markdown } from '@/components/markdown'
import { apiGuideQuery } from '@/lib/docs'

export const Route = createFileRoute('/_app/docs/api/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(apiGuideQuery),
  component: ApiGuidePage,
})

function ApiGuidePage() {
  const { data, error, isLoading } = useQuery(apiGuideQuery)
  if (isLoading) return <LoadingBlock rows={10} />
  if (error || !data?.markdown) return <ErrorBlock error={error || new Error('API guide not found')} />
  return <Markdown base="api">{data.markdown}</Markdown>
}
