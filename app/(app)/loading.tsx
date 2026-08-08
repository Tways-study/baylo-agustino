import { ChitSkeleton } from '@/components/ui'

// This is the fallback for every route under (app) that doesn't define its
// own loading.tsx (not just the feed at '/') — Next.js wraps {children} of
// app/(app)/layout.tsx in a single Suspense boundary using this file, and a
// more specific loading.tsx in a nested segment (hanap, l/[code]) only
// overrides it for that segment. Kept unlabeled/generic on purpose so it
// doesn't show a wrong route name (e.g. "Feed") while navigating to
// /profile or /post.
export default function AppSectionLoading() {
  return (
    <main className="flex flex-col gap-3 px-4 py-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <ChitSkeleton key={i} />
      ))}
    </main>
  )
}
