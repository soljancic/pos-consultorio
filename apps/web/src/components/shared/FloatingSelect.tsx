import { useState, useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface FloatingSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'placeholder'> {
  label: string
  error?: string
  hint?: string
  Icon?: LucideIcon
  children: React.ReactNode
}

export function FloatingSelect({
  label, error, hint, Icon,
  id: idProp, className, value, onChange, onFocus, onBlur,
  children,
  ...rest
}: FloatingSelectProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const [focused, setFocused] = useState(false)

  // Un <select> SIEMPRE muestra el texto de la opción elegida, así que el label
  // nunca puede actuar de placeholder centrado (se superpondría). Flota siempre.
  return (
    <div className="relative">
      {Icon && (
        <Icon
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 z-10',
            'transition-colors duration-150',
            focused ? 'text-primary' : 'text-muted-foreground/45'
          )}
        />
      )}

      <select
        id={id}
        value={value}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={cn(
          'w-full h-14 rounded-xl border bg-card appearance-none cursor-pointer',
          'px-4 pr-10',
          Icon ? 'pl-10' : 'pl-4',
          'text-base sm:text-sm text-foreground',
          'focus:outline-none transition-colors duration-150',
          'disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-muted/30',
          focused
            ? 'border-primary ring-[3px] ring-primary/15'
            : error
              ? 'border-destructive/70 ring-[2px] ring-destructive/10'
              : 'border-input hover:border-muted-foreground/35',
          className
        )}
        onFocus={(e) => { setFocused(true); onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); onBlur?.(e) }}
        onChange={onChange}
        {...rest}
      >
        {children}
      </select>

      <label
        htmlFor={id}
        className={cn(
          'pointer-events-none select-none absolute top-0 -translate-y-1/2 left-3 bg-card px-1',
          'text-xs font-semibold transition-colors duration-150',
          focused ? 'text-primary' : error ? 'text-destructive/70' : 'text-muted-foreground/75'
        )}
      >
        {label}
      </label>

      <ChevronDown
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4',
          'transition-colors duration-150',
          focused ? 'text-primary' : 'text-muted-foreground/45'
        )}
      />

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
