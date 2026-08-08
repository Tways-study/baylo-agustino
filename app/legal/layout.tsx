import Link from 'next/link'
import { Ribbon } from '@/components/ui'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', backgroundColor: 'var(--paper)' }}>
      <header>
        <Ribbon
          end={
            <Link
              href="/"
              style={{
                color: 'var(--card)',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              Close
            </Link>
          }
        >
          Legal
        </Ribbon>
      </header>
      <main
        className="px-4 py-6"
        style={{ maxWidth: '640px', margin: '0 auto', paddingBottom: '4rem' }}
      >
        {children}
      </main>
    </div>
  )
}
