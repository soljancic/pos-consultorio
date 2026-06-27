import { useState, useId, forwardRef } from 'react'
import { cn } from '../../lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface FloatingInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'placeholder'> {
  label: string
  error?: string
  hint?: string
  /** Lucide icon — renderizado con color que sigue el foco */
  Icon?: LucideIcon
  /** Nodo arbitrario para el slot izquierdo (ej: badge "Bs"). Omite el tintado de color. */
  leftSlot?: React.ReactNode
  /** Fuerza el label flotado (útil para date/time que siempre tienen contenido del browser) */
  alwaysFloat?: boolean
}

export const FloatingInput = forwardRef<HTMLInputElement, FloatingInputProps>(
  function FloatingInput(
    {
      label, error, hint, Icon, leftSlot, alwaysFloat,
      id: idProp, className, type,
      value, defaultValue, onChange, onFocus, onBlur,
      ...rest
    },
    ref
  ) {
    const autoId = useId()
    const id = idProp ?? autoId
    const [focused, setFocused] = useState(false)
    const [localVal, setLocalVal] = useState(
      defaultValue !== undefined ? String(defaultValue) : ''
    )

    const currentVal = value !== undefined ? String(value ?? '') : localVal
    const hasLeft = !!(Icon || leftSlot)
    const floated = alwaysFloat || focused || currentVal.length > 0

    return (
      <div className="relative">
        {hasLeft && (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 z-10 flex items-center',
              'transition-colors duration-150',
              Icon && (focused ? 'text-primary' : 'text-muted-foreground/45')
            )}
          >
            {Icon ? <Icon className="h-4 w-4" /> : leftSlot}
          </span>
        )}

        <input
          ref={ref}
          id={id}
          type={type}
          value={value}
          defaultValue={value === undefined ? defaultValue : undefined}
          placeholder=""
          aria-invalid={!!error}
          aria-describedby={
            error ? `${id}-err` : hint ? `${id}-hint` : undefined
          }
          className={cn(
            'w-full h-14 rounded-xl border bg-card px-4',
            'text-base sm:text-sm text-foreground',
            hasLeft && 'pl-10',
            'focus:outline-hidden transition-colors duration-150',
            'disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-muted/30',
            type === 'number' && [
              '[appearance:textfield]',
              '[&::-webkit-outer-spin-button]:appearance-none',
              '[&::-webkit-inner-spin-button]:appearance-none',
            ],
            focused
              ? 'border-primary ring-[3px] ring-primary/15'
              : error
                ? 'border-destructive/70 ring-2 ring-destructive/10'
                : 'border-input hover:border-muted-foreground/35',
            className
          )}
          onFocus={(e) => { setFocused(true); onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); onBlur?.(e) }}
          onChange={(e) => {
            if (value === undefined) setLocalVal(e.target.value)
            onChange?.(e)
          }}
          {...rest}
        />

        <label
          htmlFor={id}
          className={cn(
            'pointer-events-none select-none absolute bg-card px-1 transition-all duration-150',
            floated
              ? 'top-0 -translate-y-1/2 left-3 text-xs font-semibold'
              : [hasLeft ? 'left-10' : 'left-4', 'top-1/2 -translate-y-1/2 text-sm'],
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
)
