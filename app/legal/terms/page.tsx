import { LegalFooterNote } from '../LegalFooterNote'

const h1Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.75rem',
  fontWeight: 800,
  letterSpacing: '-0.03em',
  color: 'var(--ink)',
  margin: '0 0 0.5rem',
}

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--crimson-deep)',
  margin: '1.5rem 0 0.5rem',
}

const pStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.9375rem',
  lineHeight: 1.6,
  color: 'var(--ink-70)',
  margin: '0 0 0.5rem',
}

const PROHIBITED: { category: string; rationale: string }[] = [
  {
    category: 'Exam papers, answer keys, completed assignments, or theses',
    rationale: 'Academic integrity — the single risk that gets the app banned by the university.',
  },
  {
    category: 'Prescription and OTC medicines, supplements, medical devices',
    rationale: 'Unlicensed dispensing (RA 9711 / FDA exposure).',
  },
  { category: 'Alcohol, tobacco, vapes', rationale: '' },
  { category: 'Weapons, including replicas and utility knives', rationale: '' },
  { category: 'Live animals', rationale: '' },
  {
    category: "School IDs, other people's uniforms with name tags, or official documents",
    rationale: 'Identity fraud.',
  },
  {
    category: 'Cash lending, sangla/pawn arrangements, or crypto',
    rationale: 'Financial harm — out of scope for this app.',
  },
  { category: 'Event ticket resale above face value', rationale: '' },
]

export default function TermsPage() {
  return (
    <article>
      <h1 style={h1Style}>Terms of use</h1>
      <p style={pStyle}>
        By using Baylo Agustino you agree to trade honestly, show up when you commit, and follow the
        rules below. See also{' '}
        <a href="/legal/house-rules" style={{ color: 'var(--crimson)' }}>
          House rules
        </a>
        , which every user accepts during onboarding.
      </p>

      <h2 style={h2Style}>Eligibility</h2>
      <p style={pStyle}>
        Access is limited to holders of a valid University of San Agustin email address, verified at
        signup.
      </p>

      <h2 style={h2Style}>Prohibited listings</h2>
      <p style={pStyle}>The following can never be posted, swapped, sold, or given away here:</p>
      <ul style={{ ...pStyle, paddingLeft: '1.25rem', margin: '0 0 0.5rem' }}>
        {PROHIBITED.map((item) => (
          <li key={item.category} style={{ marginBottom: '0.375rem' }}>
            <strong style={{ color: 'var(--ink)' }}>{item.category}.</strong> {item.rationale}
          </li>
        ))}
      </ul>

      <h2 style={h2Style}>Account suspension</h2>
      <p style={pStyle}>
        An admin can take down a listing or suspend an account for violating these terms or the
        house rules, based on a filed report or direct review. Suspended accounts lose access to
        posting, offering, and messaging until reinstated.
      </p>

      <h2 style={h2Style}>Disputes</h2>
      <p style={pStyle}>
        If a deal goes wrong — a no-show, a misrepresented item, harassment — report it from the
        listing, offer, or profile in question. Reports are reviewed by an admin, who can dismiss
        the report or take action (listing takedown, account suspension). Show-up rate and review
        history are public and factor into who you choose to trade with.
      </p>

      <LegalFooterNote />
    </article>
  )
}
