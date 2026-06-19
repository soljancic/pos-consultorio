import { useEffect, useRef, useState } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { btnPrimaryUI } from '../../lib/ui'

export type SplitMenuItem = { label: string; icon?: LucideIcon; onClick: () => void }

export function SplitButton({
  label,
  icon: Icon,
  onPrimary,
  items,
}: {
  label: string
  icon?: LucideIcon
  onPrimary: () => void
  items: SplitMenuItem[]
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const caretRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        caretRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative inline-flex">
      {/* Primary action button */}
      <button
        type="button"
        onClick={onPrimary}
        className={cn(btnPrimaryUI, 'rounded-r-none')}
      >
        {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
        {label}
      </button>

      {/* Caret / menu toggle — Tweak 1: guaranteed 44×44px touch target */}
      <button
        ref={caretRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Más acciones"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          btnPrimaryUI,
          'rounded-l-none border-l border-white/25 min-w-[44px] min-h-[44px] px-0 justify-center',
        )}
      >
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-44 overflow-hidden rounded-lg border bg-card shadow-lg"
        >
          {items.map((it, idx) => (
            <button
              key={`${it.label}-${idx}`}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground',
                'hover:bg-muted transition-colors duration-150',
                // Tweak 2: visible keyboard focus ring inside the menu
                'focus-visible:outline-none focus-visible:bg-muted',
                'focus-visible:ring-[2px] focus-visible:ring-inset focus-visible:ring-ring/60',
              )}
            >
              {it.icon && (
                <it.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
