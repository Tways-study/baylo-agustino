import { HOUSE_RULES_V1 } from '@/lib/auth/house-rules'
import { LegalFooterNote } from '../LegalFooterNote'

const h1Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.75rem',
  fontWeight: 800,
  letterSpacing: '-0.03em',
  color: 'var(--ink)',
  margin: '0 0 0.5rem',
}

const pStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.9375rem',
  lineHeight: 1.6,
  color: 'var(--ink-70)',
  margin: '0 0 1rem',
}

export default function HouseRulesPage() {
  return (
    <article>
      <h1 style={h1Style}>House rules</h1>
      <p style={pStyle}>
        Every user accepts these during onboarding. They&rsquo;re the same rules shown there — this
        page is just a permanent place to find them again.
      </p>

      <ol
        style={{
          margin: 0,
          padding: '0 0 0 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        {HOUSE_RULES_V1.map((rule, i) => (
          <li
            key={i}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.9375rem',
              lineHeight: 1.6,
              color: 'var(--ink)',
            }}
          >
            {rule}
          </li>
        ))}
      </ol>

      <LegalFooterNote />
    </article>
  )
}
