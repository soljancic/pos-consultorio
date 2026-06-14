import type { ReportKpi } from '@pos/types'
import { cardUI } from '../../../lib/ui'
import { formatMoneda, cn } from '../../../lib/utils'

const TONE: Record<string, string> = {
  default: 'text-foreground', success: 'text-accent',
  warning: 'text-amber-700 dark:text-amber-400', danger: 'text-destructive',
}

function fmt(k: ReportKpi) {
  if (k.format === 'money') return formatMoneda(k.value)
  if (k.format === 'percent') return `${k.value}%`
  return k.value.toLocaleString('es-AR')
}

export function KpiCards({ kpis }: { kpis: ReportKpi[] }) {
  if (kpis.length === 0) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {kpis.map((k) => (
        <div key={k.key} className={cn(cardUI, 'p-4')}>
          <p className="text-xs font-medium text-muted-foreground truncate">{k.label}</p>
          <p className={cn('text-xl font-bold tabular-nums mt-1', TONE[k.tone ?? 'default'])}>{fmt(k)}</p>
        </div>
      ))}
    </div>
  )
}
