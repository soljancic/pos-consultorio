// Design system tokens — impeccable + ui-ux-pro-max.
// h-11 = 44px (WCAG touch target minimo). rounded-lg uniforme con paneles y
// modales. Hover borde sutil + foco teal via tokens semanticos (dark mode safe).
// text-base en mobile evita auto-zoom iOS (<16px).

export const inputUI =
  'w-full h-11 rounded-lg border border-input bg-card px-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/55 hover:border-muted-foreground/30 focus:outline-hidden focus-visible:ring-[3px] focus-visible:border-ring focus-visible:ring-ring/45 transition-colors duration-150'

export const textareaUI =
  'w-full rounded-lg border border-input bg-card px-3 py-2 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/55 hover:border-muted-foreground/30 focus:outline-hidden focus-visible:ring-[3px] focus-visible:border-ring focus-visible:ring-ring/45 transition-colors duration-150 resize-none'

export const btnPrimaryUI =
  'inline-flex items-center justify-center gap-1.5 h-11 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-semibold cursor-pointer hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150'

export const btnOutlineUI =
  'inline-flex items-center justify-center gap-1.5 h-11 px-4 border border-input bg-card text-foreground rounded-lg text-sm font-medium cursor-pointer hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150'

// Boton de icono (acciones de fila, cerrar modal): color via call site
export const btnIconUI =
  'inline-flex items-center justify-center h-9 w-9 rounded-md cursor-pointer focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150'

// Boton destructivo para acciones criticas (cancelar cita, anular pago, eliminar)
export const btnDestructiveUI =
  'inline-flex items-center justify-center gap-1.5 h-11 px-4 bg-destructive text-destructive-foreground rounded-lg text-sm font-semibold cursor-pointer hover:bg-destructive/90 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150'

export const cardUI = 'bg-card rounded-xl border shadow-xs'

// Mensaje de error de formularios (acompanar con <AlertCircle/> y role="alert")
export const errorUI =
  'flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2'

// Chip de icono para titulos de pagina/panel (mismo patron del Dashboard)
export const chipIconUI = 'bg-primary/10 text-primary rounded-md p-1.5'

// Label estandar para campos de formulario en modal
export const labelUI = 'block text-sm font-medium text-foreground mb-1.5'

// Icono prefijo absoluto dentro de un campo (Calendar, Tag, Wallet, User, etc.)
export const iconPrefixUI =
  'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70'

// Borde de error: cn(inputUI, fieldBordeError) para campos invalidos tras submit
export const fieldBordeError =
  'border-destructive/70 hover:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25'

// Helper: retorna fieldBordeError o '' segun el campo tenga error (para cn())
export function fieldBorde(invalido?: boolean): string {
  return invalido ? fieldBordeError : ''
}
