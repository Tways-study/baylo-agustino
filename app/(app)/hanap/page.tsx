import { Ribbon, EmptyState } from '@/components/ui'
import { getOpenWants } from '@/lib/wants/queries'
import { centavosToPesos, formatRelativeTime } from '@/lib/listings/format'
import { HanapClientShell } from './HanapClientShell'

export default async function HanapPage() {
  const wants = await getOpenWants()

  return (
    <>
      <header>
        <Ribbon>Hanap</Ribbon>
      </header>
      <main className="px-4 py-4 flex flex-col gap-3">
        <HanapClientShell />

        {wants.length === 0 ? (
          <EmptyState
            headline="No open Hanap yet."
            body="Post what you're looking for. Someone out there has it."
          />
        ) : (
          wants.map((want) => (
            <article
              key={want.id}
              style={{
                backgroundColor: 'var(--card)',
                border: 'var(--stroke)',
                boxShadow: 'var(--shadow-hard)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
              }}
            >
              <p className="font-body font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>
                {want.title}
              </p>

              {want.offering && (
                <p className="text-xs font-body mb-1" style={{ color: 'var(--ink-70)' }}>
                  Offering: {want.offering}
                </p>
              )}

              <div className="flex items-center gap-2 mt-2">
                {want.budget_centavos && (
                  <span
                    className="font-mono-utility text-[10px] px-2 py-0.5"
                    style={{
                      backgroundColor: 'var(--paper)',
                      border: 'var(--stroke)',
                      color: 'var(--ink)',
                      letterSpacing: '0.08em',
                    }}
                  >
                    MAX ₱{centavosToPesos(want.budget_centavos)}
                  </span>
                )}
                <span
                  className="font-mono-utility text-[10px] ml-auto"
                  style={{ color: 'var(--ink-45)' }}
                >
                  {want.profiles?.display_name ?? 'Unknown'} · {formatRelativeTime(want.created_at)}
                </span>
              </div>
            </article>
          ))
        )}
      </main>
    </>
  )
}
