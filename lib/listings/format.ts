export function pesosToCentavos(pesos: string | number): number {
  const value = typeof pesos === 'string' ? Number.parseFloat(pesos) : pesos
  return Math.round(value * 100)
}

export function centavosToPesos(centavos: number): string {
  return (centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })
}

const MANILA_TZ = 'Asia/Manila'

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMs = Date.now() - then
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Intl.DateTimeFormat('en-PH', { timeZone: MANILA_TZ, dateStyle: 'medium' }).format(then)
}
