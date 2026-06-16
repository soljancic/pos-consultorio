import { NotificacionesBell } from './NotificacionesBell'

// Campana flotante arriba-derecha en PC (lg+), para paginas sin header de accion
// (Inicio, Ayuda). En celular/tablet la campana vive en la topbar, asi que aca se
// oculta (<lg).
export function CampanaFlotante() {
  return (
    <NotificacionesBell className="hidden lg:flex fixed top-3 right-4 z-30 h-10 w-10 rounded-lg border bg-card text-foreground hover:bg-muted shadow-sm" />
  )
}
