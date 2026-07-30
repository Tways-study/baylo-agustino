import { BottomNav } from '@/components/ui'
import { EmptyState } from '@/components/ui'
import { Ribbon } from '@/components/ui'

function FloorIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      style={{ opacity: 0.35 }}
    >
      <rect x="4" y="10" width="40" height="28" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 20h24M12 27h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="10" width="8" height="28" fill="currentColor" fillOpacity="0.1" />
      <path d="M12 10v28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  )
}

export default function BaylohanPage() {
  return (
    <>
      <header>
        <Ribbon>Baylohan</Ribbon>
      </header>
      <main>
        <EmptyState
          headline="Nothing on the floor yet."
          body="Post the thing you're not using. Someone out there needs a Casio or a lab gown."
          ctaLabel="Post something"
          ctaHref="/post"
          icon={<FloorIcon />}
        />
      </main>
      <BottomNav />
    </>
  )
}
