import { NotificacionesBell } from './NotificacionesBell'

// Campana para el header de las paginas en PC (lg+): boton de icono al estilo de
// los demas del header. En celular/tablet la campana vive en la topbar, asi que
// aca se oculta (<lg). Centraliza el estilo para que sea igual en todas las vistas.
export function CampanaHeader() {
  return (
    <NotificacionesBell className="hidden lg:inline-flex h-9 w-9 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground shrink-0" />
  )
}
