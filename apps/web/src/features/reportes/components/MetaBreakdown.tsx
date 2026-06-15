import { cardUI } from '../../../lib/ui'
import { formatMoneda, cn } from '../../../lib/utils'

interface Props {
  title: string
  items: Array<{ nombre: string; total: number }>
}

export function MetaBreakdown({ title, items }: Props) {
  if (items.length === 0) return null
  return (
    <div className={cn(cardUI, 'p-4')}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.nombre} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-foreground">{item.nombre}</span>
            <span className="tabular-nums shrink-0 text-foreground font-medium">{formatMoneda(item.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
