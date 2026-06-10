// Clases compartidas del design system (ui-ux-pro-max, estilo "Accessible &
// Ethical"): mismas que LoginPage/DashboardPage. Focus ring de 3px, targets
// de toque comodos, transiciones 150ms, dark mode via tokens semanticos.
// text-base en mobile evita el auto-zoom de iOS (<16px).

export const inputUI =
  'w-full h-10 border border-input bg-card rounded-md px-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:border-ring transition-colors duration-150'

export const textareaUI =
  'w-full border border-input bg-card rounded-md px-3 py-2 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:border-ring transition-colors duration-150 resize-none'

export const btnPrimaryUI =
  'inline-flex items-center justify-center gap-1.5 h-10 px-4 bg-primary text-primary-foreground rounded-md text-sm font-semibold cursor-pointer hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150'

export const btnOutlineUI =
  'inline-flex items-center justify-center gap-1.5 h-10 px-4 border border-input bg-card text-foreground rounded-md text-sm font-medium cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150'

// Boton de icono (acciones de fila, cerrar modal): color via call site
export const btnIconUI =
  'inline-flex items-center justify-center h-9 w-9 rounded-md cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150'

export const cardUI = 'bg-card rounded-xl border shadow-sm'

// Mensaje de error de formularios (acompanar con <AlertCircle/> y role="alert")
export const errorUI =
  'flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2'

// Chip de icono para titulos de pagina/panel (mismo patron del Dashboard)
export const chipIconUI = 'bg-primary/10 text-primary rounded-md p-1.5'
