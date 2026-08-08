// Shared across all three /legal pages so the disclaimer and admin-contact
// placeholder can only ever be edited in one place. University crest usage
// clearance and the real named admin contact are the founder's own
// real-world follow-ups (see baylo-agustino-build-spec.md §6) — this
// component exists to make both impossible to miss, not to fill them in.
export function LegalFooterNote() {
  return (
    <div
      style={{
        marginTop: '2rem',
        paddingTop: '1rem',
        borderTop: 'var(--stroke)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--crimson-deep)',
          margin: 0,
        }}
      >
        Founder-drafted, pending real legal review
      </p>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.8125rem',
          color: 'var(--ink-70)',
          margin: 0,
        }}
      >
        This page is a working draft prepared by the team building Baylo Agustino. It is not a
        substitute for advice from a licensed attorney and has not yet been reviewed by University
        of San Agustin legal counsel.
      </p>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.8125rem',
          color: 'var(--ink-70)',
          margin: 0,
        }}
      >
        Questions about this policy:{' '}
        <strong style={{ color: 'var(--crimson)' }}>
          [ADMIN CONTACT — TODO: name + email before launch]
        </strong>
      </p>
      {/* TODO: crest usage clearance — no University of San Agustin crest,
          seal, or official mark may appear on this page (or anywhere in the
          app) until written clearance is obtained from the university. */}
    </div>
  )
}
