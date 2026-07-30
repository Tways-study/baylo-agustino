import { Stamp } from '@/components/ui'

export default function SuspendedPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        textAlign: 'center',
      }}
    >
      <Stamp label="Suspended" variant="crimson" rotate={-8} />

      <div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.75rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'var(--ink)',
            margin: '0 0 0.5rem',
          }}
        >
          Your account has been suspended.
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9375rem',
            color: 'var(--ink-70)',
            maxWidth: '28ch',
            margin: '0 auto',
            lineHeight: 1.5,
          }}
        >
          Contact the Baylo admin to find out what happened and how to resolve it.
        </p>
      </div>

      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--ink-45)',
          margin: 0,
        }}
      >
        baylo.agustino@usa.edu.ph
      </p>
    </div>
  )
}
