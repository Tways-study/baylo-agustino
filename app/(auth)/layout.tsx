export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem 1.25rem',
        backgroundColor: 'var(--paper)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '360px' }}>{children}</div>
    </div>
  )
}
