import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ErrorBlock, LoadingBlock } from '@/components/common'
import { Markdown } from '@/components/markdown'
import { guideQuery } from '@/lib/docs'

export const Route = createFileRoute('/_app/docs/$slug')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(guideQuery(params.slug)),
  component: GuidePage,
})

function GuidePage() {
  const { slug } = Route.useParams()
  const { data, error, isLoading } = useQuery(guideQuery(slug))
  if (isLoading) return <LoadingBlock rows={8} />
  if (error || !data) return <ErrorBlock error={error} />
  return <Markdown>{data.markdown}</Markdown>
}
