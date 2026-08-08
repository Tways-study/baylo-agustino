import { EmptyState } from '@/components/ui'

export default function NotFound() {
  return (
    <EmptyState
      headline="Nothing on the floor here."
      body="That page doesn't exist, or it's been moved."
      ctaLabel="Back to the feed"
      ctaHref="/"
    />
  )
}
