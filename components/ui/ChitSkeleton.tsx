export function ChitSkeleton() {
  return (
    <div
      className="flex min-h-[9rem] animate-pulse"
      style={{
        backgroundColor: 'var(--card)',
        border: 'var(--stroke)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-hard)',
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      <div
        className="shrink-0"
        style={{ width: '2rem', backgroundColor: 'var(--paper-dim)', borderRight: 'var(--stroke)' }}
      />
      <div className="flex flex-col justify-between p-3 flex-1 gap-2">
        <div
          style={{
            width: '3rem',
            height: '14px',
            backgroundColor: 'var(--paper-dim)',
            borderRadius: 'var(--radius)',
          }}
        />
        <div
          style={{
            width: '70%',
            height: '18px',
            backgroundColor: 'var(--paper-dim)',
            borderRadius: 'var(--radius)',
          }}
        />
        <div
          style={{
            width: '50%',
            height: '12px',
            backgroundColor: 'var(--paper-dim)',
            borderRadius: 'var(--radius)',
          }}
        />
      </div>
    </div>
  )
}
