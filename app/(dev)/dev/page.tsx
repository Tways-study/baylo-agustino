'use client'

import { useState } from 'react'
import {
  Button,
  Chit,
  Chip,
  EmptyState,
  IntentTag,
  Panel,
  Ribbon,
  Sheet,
  Stamp,
} from '@/components/ui'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--ink-45)',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--paper-dim)',
          paddingBottom: '0.5rem',
        }}
      >
        {title}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>{children}</div>
    </section>
  )
}

export default function DevPage() {
  const [sheetOpen, setSheetOpen] = useState(false)

  if (process.env.NODE_ENV === 'production') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-45)' }}>
        Not available in production.
      </div>
    )
  }

  return (
    <div
      style={{
        maxWidth: '480px',
        margin: '0 auto',
        padding: '1.5rem 1rem 8rem',
        backgroundColor: 'var(--paper)',
        minHeight: '100dvh',
      }}
    >
      <div style={{ marginBottom: '2rem' }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.75rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'var(--ink)',
          }}
        >
          Baylo Design System
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--ink-70)',
            fontSize: '0.875rem',
            marginTop: '0.25rem',
          }}
        >
          Phase 0 component gallery — dev only
        </p>
      </div>

      {/* ─── Ribbon ─── */}
      <Section title="Ribbon">
        <Ribbon>Baylohan</Ribbon>
        <Ribbon>Hanap — Wanted Posts</Ribbon>
      </Section>

      {/* ─── IntentTag ─── */}
      <Section title="IntentTag">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <IntentTag intent="swap" />
          <IntentTag intent="sale" />
          <IntentTag intent="give" />
        </div>
      </Section>

      {/* ─── Chip ─── */}
      <Section title="Chip">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Chip>Books</Chip>
          <Chip variant="active">Electronics</Chip>
          <Chip>Uniform</Chip>
          <Chip onClick={() => {}}>Clickable</Chip>
        </div>
      </Section>

      {/* ─── Button ─── */}
      <Section title="Button">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="primary">Post something</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="ghost">Skip</Button>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="primary" disabled>
            Disabled primary
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </div>
        <Button variant="primary" fullWidth>
          Full-width button
        </Button>
      </Section>

      {/* ─── Stamp ─── */}
      <Section title="Stamp">
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <Stamp label="Like New" />
          <Stamp label="Fair" variant="crimson" rotate={-8} />
          <Stamp label="Swap" variant="gold" rotate={10} />
          <Stamp label="Verified" rotate={-5} />
        </div>
      </Section>

      {/* ─── Panel ─── */}
      <Section title="Panel">
        <Panel>
          <p
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--ink-70)' }}
          >
            A padded card surface. Used for elevated content blocks.
          </p>
        </Panel>
        <Panel padded={false} style={{ padding: '0.75rem' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.1em',
              color: 'var(--ink-45)',
              textTransform: 'uppercase',
            }}
          >
            Compact panel
          </p>
        </Panel>
      </Section>

      {/* ─── Chit ─── */}
      <Section title="Chit (Swap Chit card)">
        <Chit
          code="BA-0001"
          intent="swap"
          title="Casio FX-991ES Plus Scientific Calculator"
          condition="like_new"
        />
        <Chit
          code="BA-0002"
          intent="sale"
          title="Chem lab manual + safety goggles — both for ₱180"
          condition="good"
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.05em',
              color: 'var(--crimson)',
            }}
          >
            ₱180
          </span>
        </Chit>
        <Chit
          code="BA-0003"
          intent="give"
          title="Block 3A Rizal notes — free to whoever needs them"
          condition="fair"
        />
        <Chit
          code="BA-0004"
          intent="swap"
          title="Lab gown (medium) — want: engineering drawing set"
          condition="good"
          onClick={() => alert('Chit clicked!')}
        />
      </Section>

      {/* ─── EmptyState ─── */}
      <Section title="EmptyState">
        <div style={{ border: '1px dashed var(--ink-45)', borderRadius: 'var(--radius)' }}>
          <EmptyState
            headline="Nothing on the floor yet."
            body="Post the thing you're not using. Someone out there needs a Casio or a lab gown."
            ctaLabel="Post something"
            ctaHref="/post"
          />
        </div>
      </Section>

      {/* ─── Sheet ─── */}
      <Section title="Sheet (bottom sheet)">
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>
          Open Sheet
        </Button>
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Make an offer">
          <p
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--ink-70)',
              fontSize: '0.875rem',
              marginBottom: '1rem',
            }}
          >
            This is a bottom sheet. Drag down or tap the scrim to close.
          </p>
          <Button variant="primary" fullWidth onClick={() => setSheetOpen(false)}>
            Send offer
          </Button>
        </Sheet>
      </Section>

      {/* ─── Color tokens ─── */}
      <Section title="Color tokens">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {[
            { name: 'ink', value: 'var(--ink)' },
            { name: 'ink-70', value: 'var(--ink-70)' },
            { name: 'ink-45', value: 'var(--ink-45)' },
            { name: 'crimson', value: 'var(--crimson)' },
            { name: 'crimson-deep', value: 'var(--crimson-deep)' },
            { name: 'gold', value: 'var(--gold)' },
            { name: 'gold-deep', value: 'var(--gold-deep)' },
            { name: 'paper', value: 'var(--paper)' },
            { name: 'paper-dim', value: 'var(--paper-dim)' },
            { name: 'card', value: 'var(--card)' },
          ].map(({ name, value }) => (
            <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div
                style={{
                  height: '2.5rem',
                  backgroundColor: value,
                  border: 'var(--stroke)',
                  borderRadius: 'var(--radius)',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.08em',
                  color: 'var(--ink-45)',
                  textTransform: 'uppercase',
                }}
              >
                {name}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ─── Typography ─── */}
      <Section title="Typography">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--ink)',
            }}
          >
            Bricolage Grotesque — Display
          </span>
          <span
            style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--ink-70)' }}
          >
            Plus Jakarta Sans — Body text for all prose and controls
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--ink-45)',
            }}
          >
            IBM Plex Mono — BA-0431 · ₱180 · SWAP
          </span>
        </div>
      </Section>
    </div>
  )
}
