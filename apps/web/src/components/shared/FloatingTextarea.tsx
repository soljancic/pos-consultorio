import { useState, useId } from 'react'
import { cn } from '../../lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface FloatingTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'placeholder'> {
  label: string
  error?: string
  hint?: string
  /** Lucide icon en la esquina superior izquierda (alineado con la 1ra linea) */
  Icon?: LucideIcon
}

export function FloatingTextarea({
  label, error, hint, Icon,
  id: idProp, className, value, onChange, onFocus, onBlur, rows = 3,
  ...rest
}: FloatingTextareaProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const [focused, setFocused] = useState(false)
  const currentVal = value !== undefined ? String(value ?? '') : ''
  const floated = focused || currentVal.length > 0

  return (
    <div className="relative">
      {Icon && (
        <Icon
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute left-3.5 top-4 h-4 w-4 z-10 transition-colors duration-150',
            focused ? 'text-primary' : 'text-muted-foreground/45'
          )}
        />
      )}

      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder=""
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={cn(
          'w-full rounded-xl border bg-card px-4 pt-4 pb-2.5 resize-none',
          Icon && 'pl-10',
          'text-base sm:text-sm text-foreground',
          'focus:outline-hidden transition-colors duration-150',
          'disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-muted/30',
          focused
            ? 'border-primary ring-[3px] ring-primary/15'
            : error
              ? 'border-destructive/70 ring-2 ring-destructive/10'
              : 'border-input hover:border-muted-foreground/35',
          className
        )}
        onFocus={(e) => { setFocused(true); onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); onBlur?.(e) }}
        onChange={onChange}
        {...rest}
      />

      <label
        htmlFor={id}
        className={cn(
          'pointer-events-none select-none absolute bg-card px-1 transition-all duration-150',
          floated
            ? 'top-0 -translate-y-1/2 left-3 text-xs font-semibold'
            : [Icon ? 'left-10' : 'left-4', 'top-3.5 text-sm'],
          floated && focused && 'text-primary',
          floated && !focused && !!error && 'text-destructive/70',
          floated && !focused && !error && 'text-muted-foreground/75',
          !floated && 'text-muted-foreground/50'
        )}
      >
        {label}
      </label>

      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-xs text-destructive pl-1">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground pl-1">
          {hint}
        </p>
      )}
    </div>
  )
}
