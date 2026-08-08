import Link from 'next/link'
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

export default function PrivacyPage() {
  return (
    <article>
      <h1 style={h1Style}>Privacy notice</h1>
      <p style={pStyle}>
        Baylo Agustino is a campus-only trading floor for University of San Agustin students. This
        notice explains what we collect, why, and how you can have it deleted, in line with the
        Philippine Data Privacy Act of 2012 (RA 10173).
      </p>

      <h2 style={h2Style}>What we collect</h2>
      <p style={pStyle}>
        Your university email address, display name, program and year level, and an optional avatar
        photo. The content you create — listings, offers, messages, reviews, reports, and which
        meetup spot you choose for a handover. We do not collect your precise location; you pick
        from a curated list of on-campus meetup spots, never a GPS coordinate.
      </p>

      <h2 style={h2Style}>Why we collect it</h2>
      <p style={pStyle}>
        To verify you&rsquo;re a real Agustinian (the university email gate), to run the trading
        floor itself (listings, offers, deal rooms), and to keep it safe (show-up rate, reviews,
        reports, and admin moderation).
      </p>

      <h2 style={h2Style}>Who can see it</h2>
      <p style={pStyle}>
        Other verified students can see your display name, program, year level, listings, and review
        history. Your email address is never shown to other students. Admins can see reports filed
        against you and moderation history.
      </p>

      <h2 style={h2Style}>Retention</h2>
      <p style={pStyle}>
        Your data is kept for as long as your account is active. Listings and deal history are kept
        to support dispute resolution and trust scoring even after a deal completes.
      </p>

      <h2 style={h2Style}>Deletion</h2>
      <p style={pStyle}>
        You can delete your account and personal data at any time from{' '}
        <Link href="/profile" style={{ color: 'var(--crimson)' }}>
          your profile
        </Link>
        . Deleting your account removes your profile and cascades to your listings, offers,
        messages, and other personal data.
      </p>

      <LegalFooterNote />
    </article>
  )
}
