import type { PulseStatsRow } from '@/types/database'

interface PulseStripProps {
  stats: PulseStatsRow
}

export function PulseStrip({ stats }: PulseStripProps) {
  const parts: string[] = []
  if (stats.swaps_this_week > 0) {
    parts.push(`${stats.swaps_this_week} swap${stats.swaps_this_week !== 1 ? 's' : ''} this week`)
  }
  if (stats.top_wanted) {
    parts.push(`Most wanted: ${stats.top_wanted}`)
  }
  if (stats.most_active_program) {
    parts.push(`Most active: ${stats.most_active_program}`)
  }

  if (parts.length === 0) return null

  return (
    <p
      className="font-mono-utility text-[10px] truncate"
      style={{ color: 'var(--ink-45)', letterSpacing: '0.06em' }}
      aria-label="Campus pulse"
    >
      {parts.join(' · ')}
    </p>
  )
}
