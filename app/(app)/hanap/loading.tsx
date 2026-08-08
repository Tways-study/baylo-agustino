import { Ribbon, ChitSkeleton } from '@/components/ui'

export default function HanapLoading() {
  return (
    <>
      <header>
        <Ribbon>Hanap</Ribbon>
      </header>
      <main className="px-4 py-4 flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <ChitSkeleton key={i} />
        ))}
      </main>
    </>
  )
}
