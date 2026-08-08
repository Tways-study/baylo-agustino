export default function ListingDetailLoading() {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', paddingBottom: '6rem' }}
      aria-hidden="true"
    >
      <div
        className="animate-pulse"
        style={{ aspectRatio: '4/3', backgroundColor: 'var(--paper-dim)' }}
      />

      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div
          className="animate-pulse"
          style={{
            width: '5rem',
            height: '1.5rem',
            backgroundColor: 'var(--paper-dim)',
            borderRadius: 'var(--radius)',
          }}
        />
        <div
          className="animate-pulse"
          style={{
            width: '80%',
            height: '1.75rem',
            backgroundColor: 'var(--paper-dim)',
            borderRadius: 'var(--radius)',
          }}
        />
        <div
          className="animate-pulse"
          style={{
            width: '100%',
            height: '4rem',
            backgroundColor: 'var(--paper-dim)',
            borderRadius: 'var(--radius)',
          }}
        />
        <div
          className="animate-pulse"
          style={{
            width: '60%',
            height: '1rem',
            backgroundColor: 'var(--paper-dim)',
            borderRadius: 'var(--radius)',
          }}
        />
      </div>
    </div>
  )
}
