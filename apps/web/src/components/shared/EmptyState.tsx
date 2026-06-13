import { type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

// Estado vacio compartido (pulido UI 2026-06-13): icono en circulo + mensaje +
// (opcional) descripcion y accion. Reemplaza el texto gris suelto de las
// listas/tablas vacias por algo mas claro y guiado (regla ux empty-states).

interface Props {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground/80 mb-3">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
