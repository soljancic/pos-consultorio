import { useEffect, useRef, useState } from 'react'
import { MessageCircle, DollarSign, ChevronRight, Stethoscope, MoreVertical, CalendarClock, Ban, UserX, Globe } from 'lucide-react'
import { EstadoCita, OrigenCita, COLORES_ESTADO, TRANSICIONES_VALIDAS, transicionValida, type Cita } from '@pos/types'
import { formatHora, formatMoneda, buildWhatsAppUrl, cn } from '../../lib/utils'
import { usePlantillasWhatsApp, renderPlantilla } from '../../lib/whatsapp'
import { btnIconUI, cardUI } from '../../lib/ui'
import { useAuthStore } from '../../stores/auth.store'

const ESTADOS_CON_ATENCION = [
  EstadoCita.EN_ATENCION,
  EstadoCita.ATENDIDA,
  EstadoCita.COBRADO,
  EstadoCita.CON_DEUDA,
]

const LABEL_ESTADO: Record<EstadoCita, string> = {
  [EstadoCita.SOLICITADA]: 'Solicitada',
  [EstadoCita.PENDIENTE]: 'Pendiente',
  [EstadoCita.CONFIRMADA]: 'Confirmada',
  [EstadoCita.LLEGO]: 'Llegó',
  [EstadoCita.EN_ATENCION]: 'En atención',
  [EstadoCita.ATENDIDA]: 'Atendida',
  [EstadoCita.COBRADO]: 'Cobrado',
  [EstadoCita.CON_DEUDA]: 'Con deuda',
  [EstadoCita.CANCELADA]: 'Cancelada',
  [EstadoCita.NO_ASISTIO]: 'No asistió',
  [EstadoCita.REPROGRAMADA]: 'Reprogramada',
}

// Una cita en curso o cerrada no se mueve de horario (espejo del backend)
const ESTADOS_REPROGRAMABLES = [EstadoCita.PENDIENTE, EstadoCita.CONFIRMADA, EstadoCita.LLEGO]

interface CitaCardProps {
  cita: Cita
  onCambiarEstado: (estado: EstadoCita) => void
  onCobrar: () => void
  onAtencion: () => void
  onReprogramar: () => void
  onCancelar: () => void
  onNoAsistio: () => void
}

export function CitaCard({ cita, onCambiarEstado, onCobrar, onAtencion, onReprogramar, onCancelar, onNoAsistio }: CitaCardProps) {
  const user = useAuthStore((s) => s.user)
  const color = COLORES_ESTADO[cita.estado]
  const transicionesDisponibles = TRANSICIONES_VALIDAS[cita.estado]
  const tieneSaldo = cita.cobro && Number(cita.cobro.saldoPendiente) > 0
  const [menuAbierto, setMenuAbierto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuAbierto) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuAbierto(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuAbierto(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuAbierto])

  const puedeReprogramar = ESTADOS_REPROGRAMABLES.includes(cita.estado)
  const puedeCancelar = transicionValida(cita.estado, EstadoCita.CANCELADA)
  const puedeNoAsistio = transicionValida(cita.estado, EstadoCita.NO_ASISTIO)
  const tieneMenu = puedeReprogramar || puedeCancelar || puedeNoAsistio

  function handleNoAsistio() {
    setMenuAbierto(false)
    onNoAsistio()
  }

  // Registrar (EN_ATENCION) es del doctor/admin; consultar (estados posteriores) es de todos
  const muestraAtencion =
    ESTADOS_CON_ATENCION.includes(cita.estado) &&
    (cita.estado !== EstadoCita.EN_ATENCION || user?.rol === 'DOCTOR' || user?.rol === 'ADMIN')

  // COBRADO no se ofrece como boton de estado: se llega cobrando (boton $).
  // Desde ATENDIDA el boton ofrece "Con deuda" (se fue sin pagar).
  const proximaTransicion = transicionesDisponibles.find(
    (t) =>
      t !== EstadoCita.CANCELADA &&
      t !== EstadoCita.NO_ASISTIO &&
      t !== EstadoCita.COBRADO,
  )

  // El telefono del paciente sirve tambien para WhatsApp (decision owner)
  const telefonoWhatsApp = cita.paciente?.telefono

  const { plantillas, consultorioNombre } = usePlantillasWhatsApp()

  function handleWhatsApp() {
    if (!telefonoWhatsApp) return
    const msg = renderPlantilla(plantillas.recordatorio, {
      nombre: cita.paciente?.nombre ?? '',
      hora: formatHora(cita.fechaHora),
      fecha: new Date(cita.fechaHora).toLocaleDateString('es-BO'),
      consultorio: consultorioNombre,
    })
    window.open(buildWhatsAppUrl(telefonoWhatsApp, msg, cita.paciente?.pais), '_blank')
  }

  return (
    <div className={cn(cardUI, 'relative p-4 flex items-start gap-3')}>
      {/* Acento de color por estado en el borde izquierdo (pedido del owner): barra
          de alto completo con esquinas que siguen el radio de la tarjeta, en vez de
          un border-left plano. El codigo de color refuerza el badge de un vistazo. */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl"
        style={{ backgroundColor: color }}
      />
      {/* Hora */}
      <div className="text-center min-w-[48px]">
        <div className="text-lg font-bold text-foreground tabular-nums">{formatHora(cita.fechaHora)}</div>
        <div className="text-xs text-muted-foreground/70">{cita.duracionMin}min</div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground truncate">
            {cita.paciente?.apellido}, {cita.paciente?.nombre}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium text-white shrink-0"
            style={{ backgroundColor: color }}
          >
            {LABEL_ESTADO[cita.estado]}
          </span>
          {cita.origen === OrigenCita.PORTAL && (
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-sky-500/15 text-sky-700 dark:text-sky-300 shrink-0"
              title="Reservada desde el portal público"
            >
              <Globe className="h-3 w-3" aria-hidden="true" />
              Portal
            </span>
          )}
        </div>
        <div className="text-sm text-muted-foreground mt-0.5">
          {cita.servicio?.nombre} &bull; {cita.doctor?.nombre}
        </div>
        {tieneSaldo && (
          <div className="text-xs text-destructive font-medium mt-1 tabular-nums">
            Deuda: {formatMoneda(Number(cita.cobro?.saldoPendiente))}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1 shrink-0">
        {telefonoWhatsApp && (
          <button
            onClick={handleWhatsApp}
            className={cn(btnIconUI, 'text-accent hover:bg-accent/10')}
            title="Enviar WhatsApp"
            aria-label="Enviar recordatorio por WhatsApp"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {muestraAtencion && (
          <button
            onClick={onAtencion}
            className={cn(btnIconUI, 'text-violet-600 hover:bg-violet-500/10')}
            title="Atención"
            aria-label="Registrar o ver atención"
          >
            <Stethoscope className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {(cita.estado === EstadoCita.ATENDIDA || cita.estado === EstadoCita.CON_DEUDA) && (
          <button
            onClick={onCobrar}
            className={cn(btnIconUI, 'text-primary hover:bg-primary/10')}
            title="Cobrar"
            aria-label="Cobrar cita"
          >
            <DollarSign className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {proximaTransicion && (
          <button
            onClick={() => onCambiarEstado(proximaTransicion)}
            className="flex items-center gap-1 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/70 px-2.5 py-2 rounded-md cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
          >
            {LABEL_ESTADO[proximaTransicion]}
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </button>
        )}

        {tieneMenu && (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuAbierto((v) => !v)}
              aria-label="Más acciones"
              aria-haspopup="menu"
              aria-expanded={menuAbierto}
              className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </button>
            {menuAbierto && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-20 w-44 bg-card border rounded-md shadow-lg py-1"
              >
                {puedeReprogramar && (
                  <button
                    role="menuitem"
                    onClick={() => { setMenuAbierto(false); onReprogramar() }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-foreground cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted/60 transition-colors duration-150"
                  >
                    <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Reprogramar
                  </button>
                )}
                {puedeNoAsistio && (
                  <button
                    role="menuitem"
                    onClick={handleNoAsistio}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-foreground cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted/60 transition-colors duration-150"
                  >
                    <UserX className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    No asistió
                  </button>
                )}
                {puedeCancelar && (
                  <button
                    role="menuitem"
                    onClick={() => { setMenuAbierto(false); onCancelar() }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-destructive cursor-pointer hover:bg-destructive/10 focus-visible:outline-none focus-visible:bg-destructive/10 transition-colors duration-150"
                  >
                    <Ban className="h-4 w-4" aria-hidden="true" />
                    Cancelar cita
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
