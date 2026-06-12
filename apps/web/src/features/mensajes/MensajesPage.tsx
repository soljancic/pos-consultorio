import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, RefreshCw, Check, X, CalendarClock, CircleDollarSign } from 'lucide-react'
import { format } from 'date-fns'
import { api } from '../../lib/api-client'
import { formatMoneda, formatHora, buildWhatsAppUrl, cn } from '../../lib/utils'
import { usePlantillasWhatsApp, renderPlantilla } from '../../lib/whatsapp'
import { cardUI, chipIconUI, btnOutlineUI } from '../../lib/ui'

type Mensaje = {
  id: number
  tipo: 'RECORDATORIO' | 'DEUDA'
  estado: 'PENDIENTE' | 'ENVIADO' | 'OMITIDO'
  detalle: string | null
  creadoAt: string
  resueltoAt: string | null
  paciente: {
    id: number
    nombre: string
    apellido: string
    telefono: string | null
    deudaTotal: number
  }
  cita: { id: number; fechaHora: string; estado: string; doctor: { nombre: string } } | null
  resueltoPor: { nombre: string } | null
}

const LABEL_ESTADO: Record<Mensaje['estado'], string> = {
  PENDIENTE: 'Pendiente', ENVIADO: 'Enviado', OMITIDO: 'Omitido',
}

// E3 item 41a: cola de mensajes con envio manual asistido (wa.me).
// La automatizacion via Business API queda pausada por decision del owner.
export function MensajesPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'pendientes' | 'resueltos'>('pendientes')
  const { plantillas, consultorioNombre } = usePlantillasWhatsApp()

  const { data: mensajes = [], isLoading } = useQuery<Mensaje[]>({
    queryKey: ['mensajes', tab],
    queryFn: () =>
      api
        .get('/mensajes', { params: tab === 'pendientes' ? { estado: 'PENDIENTE' } : undefined })
        .then((r) => r.data),
  })
  const visibles = tab === 'pendientes' ? mensajes : mensajes.filter((m) => m.estado !== 'PENDIENTE')

  function invalidar() {
    qc.invalidateQueries({ queryKey: ['mensajes'] })
    qc.invalidateQueries({ queryKey: ['mensajes-pendientes-count'] }) // badge del nav
  }

  const generar = useMutation({
    mutationFn: () => api.post('/mensajes/generar').then((r) => r.data),
    onSuccess: invalidar,
  })

  const resolver = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: 'ENVIADO' | 'OMITIDO' }) =>
      api.put(`/mensajes/${id}/resolver`, { estado }),
    onSuccess: invalidar,
  })

  function mensajeDe(m: Mensaje) {
    if (m.tipo === 'RECORDATORIO' && m.cita) {
      return renderPlantilla(plantillas.recordatorio, {
        nombre: m.paciente.nombre,
        hora: formatHora(m.cita.fechaHora),
        fecha: new Date(m.cita.fechaHora).toLocaleDateString('es-BO'),
        consultorio: consultorioNombre,
      })
    }
    return renderPlantilla(plantillas.deuda, {
      nombre: m.paciente.nombre,
      monto: formatMoneda(Number(m.paciente.deudaTotal)),
      consultorio: consultorioNombre,
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <span className={chipIconUI}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
            </span>
            Mensajes
          </h1>
          <div className="flex gap-1 mt-3" role="tablist">
            {(['pendientes', 'resueltos'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                role="tab"
                aria-selected={tab === t}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium capitalize cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                  tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => generar.mutate()}
          disabled={generar.isPending}
          className={btnOutlineUI}
        >
          <RefreshCw className={cn('h-4 w-4', generar.isPending && 'animate-spin')} aria-hidden="true" />
          {generar.isPending ? 'Generando...' : 'Generar cola'}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 max-w-4xl mx-auto w-full space-y-3">
        {generar.data && (
          <p role="status" className="text-xs text-muted-foreground">
            Se encolaron {generar.data.recordatorios} recordatorios y {generar.data.avisosDeuda} avisos de deuda.
          </p>
        )}
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Cargando...</div>
        ) : visibles.length === 0 ? (
          <div className={cn(cardUI, 'p-8 text-center text-muted-foreground/70 text-sm')}>
            {tab === 'pendientes'
              ? 'No hay mensajes pendientes. La cola se genera sola cada mañana, o con el botón "Generar cola".'
              : 'Todavía no se resolvió ningún mensaje.'}
          </div>
        ) : (
          visibles.map((m) => {
            const telefono = m.paciente.telefono
            return (
              <div key={m.id} className={cn(cardUI, 'p-4 flex items-start gap-3')}>
                <span
                  className={cn(
                    'rounded-md p-2 shrink-0',
                    m.tipo === 'RECORDATORIO' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive',
                  )}
                  title={m.tipo === 'RECORDATORIO' ? 'Recordatorio de cita' : 'Aviso de deuda'}
                >
                  {m.tipo === 'RECORDATORIO'
                    ? <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    : <CircleDollarSign className="h-4 w-4" aria-hidden="true" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {m.paciente.apellido}, {m.paciente.nombre}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.tipo === 'RECORDATORIO' && m.cita
                      ? `${format(new Date(m.cita.fechaHora), 'dd/MM HH:mm')} hs con ${m.cita.doctor.nombre}`
                      : `Deuda: ${formatMoneda(Number(m.paciente.deudaTotal))}`}
                  </p>
                  {m.estado !== 'PENDIENTE' && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {LABEL_ESTADO[m.estado]}{m.resueltoPor ? ` por ${m.resueltoPor.nombre}` : ''}
                      {m.resueltoAt ? ` · ${format(new Date(m.resueltoAt), 'dd/MM HH:mm')}` : ''}
                    </p>
                  )}
                </div>
                {m.estado === 'PENDIENTE' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {telefono && (
                      <a
                        href={buildWhatsAppUrl(telefono, mensajeDe(m))}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir WhatsApp"
                        aria-label={`Enviar WhatsApp a ${m.paciente.nombre}`}
                        className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-accent/10 text-accent hover:bg-accent/20 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}
                    <button
                      onClick={() => resolver.mutate({ id: m.id, estado: 'ENVIADO' })}
                      disabled={resolver.isPending}
                      title="Marcar enviado"
                      aria-label="Marcar como enviado"
                      className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:opacity-60 transition-colors duration-150"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => resolver.mutate({ id: m.id, estado: 'OMITIDO' })}
                      disabled={resolver.isPending}
                      title="Omitir"
                      aria-label="Omitir mensaje"
                      className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:opacity-60 transition-colors duration-150"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
