import { Fragment, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronDown, MessageCircle, Pencil, Stethoscope, CalendarPlus, Archive, ArchiveRestore, AlertTriangle } from 'lucide-react'
import { format, differenceInYears } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api-client'
import { formatMoneda, formatDia, buildWhatsAppUrl, abrirWhatsApp, cn } from '../../lib/utils'
import { usePlantillasWhatsApp, renderPlantilla } from '../../lib/whatsapp'
import { telefonoIntl } from '../../lib/paises'
import { btnOutlineUI, btnPrimaryUI, btnIconUI, cardUI } from '../../lib/ui'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { COLORES_ESTADO } from '@pos/types'
import type { EstadoCita, Paciente, Cita } from '@pos/types'
import { CobroModal } from '../agenda/CobroModal'
import { EmptyState } from '../../components/shared/EmptyState'
import { ErrorState } from '../../components/shared/ErrorState'
import { Skeleton, TableSkeleton } from '../../components/shared/Skeleton'
import { NuevaCitaModal } from '../agenda/NuevaCitaModal'
import { PacienteModal } from './PacienteModal'
import { HistoriaClinicaTimeline } from './HistoriaClinicaTimeline'
import { CampanaHeader } from '../notificaciones/CampanaHeader'

const LABEL_ESTADO: Record<EstadoCita, string> = {
  SOLICITADA: 'Solicitada',
  PENDIENTE: 'Pendiente', CONFIRMADA: 'Confirmada', LLEGO: 'Llegó',
  EN_ATENCION: 'En atención', ATENDIDA: 'Atendida', COBRADO: 'Cobrado',
  CON_DEUDA: 'Con deuda', CANCELADA: 'Cancelada', NO_ASISTIO: 'No asistió',
  REPROGRAMADA: 'Reprogramada',
} as Record<EstadoCita, string>

type Atención = {
  motivo: string | null
  diagnostico: string | null
  tratamiento: string | null
  evolucion: string | null
  proximoControl: string | null
}

type PacienteDetalle = Paciente & {
  noShows: number
  citas: Array<Cita & {
    doctor: { nombre: string }
    servicio: { nombre: string; precioBase: number }
    cobro: { id: number; total: number; saldoPendiente: number; estado: string } | null
    atencion: Atención | null
  }>
}

export function PacienteDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [citaCobro, setCitaCobro] = useState<Cita | null>(null)
  const [citaExpandida, setCitaExpandida] = useState<number | null>(null)
  const [fechaControl, setFechaControl] = useState<string | null>(null)
  const [tab, setTab] = useState<'citas' | 'historia'>('citas')
  const [confirmArchivar, setConfirmArchivar] = useState(false)
  const { plantillas, consultorioNombre } = usePlantillasWhatsApp()

  const { data: paciente, isLoading, isError, refetch } = useQuery<PacienteDetalle>({
    queryKey: ['paciente', id],
    queryFn: () => api.get(`/pacientes/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  // Archivar (activo:false) / reactivar. No bloquea; el modal solo avisa si hay
  // deuda o citas futuras. La historia se conserva.
  const setActivo = useMutation({
    mutationFn: (activo: boolean) => api.put(`/pacientes/${id}/activo`, { activo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paciente', id] })
      qc.invalidateQueries({ queryKey: ['pacientes'] })
      setConfirmArchivar(false)
    },
  })

  if (isLoading)
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto w-full">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <TableSkeleton cols={6} />
      </div>
    )
  if (isError) return <ErrorState className="py-16" description="No se pudo cargar la ficha del paciente." onRetry={() => refetch()} />
  if (!paciente) return <div className="p-6 text-muted-foreground">Paciente no encontrado</div>

  const edad = paciente.fechaNacimiento
    ? differenceInYears(new Date(), new Date(paciente.fechaNacimiento))
    : null

  const citasOrdenadas = [...(paciente.citas ?? [])].sort(
    (a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime()
  )

  const archivado = paciente.activo === false
  const tieneDeuda = Number(paciente.deudaTotal) > 0
  const citasFuturas = citasOrdenadas.filter(
    (c) =>
      new Date(c.fechaHora) > new Date() &&
      (['SOLICITADA', 'PENDIENTE', 'CONFIRMADA'] as string[]).includes(c.estado),
  ).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/pacientes')}
            aria-label="Volver a pacientes"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {paciente.nombre} {paciente.apellido}
            </h1>
            <span className="flex flex-wrap items-center gap-2">
              {Number(paciente.deudaTotal) > 0 && (
                <span className="text-xs text-destructive font-medium tabular-nums">
                  {formatMoneda(Number(paciente.deudaTotal))} en deuda
                </span>
              )}
              {paciente.requierePrepago && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  Requiere prepago
                </span>
              )}
              {archivado && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                  Archivado
                </span>
              )}
              {paciente.noShows > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {paciente.noShows} {paciente.noShows === 1 ? 'inasistencia' : 'inasistencias'}
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {paciente.telefono && (
            <a
              href={buildWhatsAppUrl(
                paciente.telefono,
                renderPlantilla(plantillas.contacto, { nombre: paciente.nombre, consultorio: consultorioNombre }),
                paciente.pais,
              )}
              onClick={(e) => {
                e.preventDefault()
                abrirWhatsApp(
                  paciente.telefono!,
                  renderPlantilla(plantillas.contacto, { nombre: paciente.nombre, consultorio: consultorioNombre }),
                  paciente.pais,
                )
              }}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 h-10 px-4 bg-accent text-accent-foreground rounded-md text-sm font-semibold cursor-pointer hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 transition-colors duration-150"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              WhatsApp
            </a>
          )}
          <button onClick={() => setEditando(true)} className={btnOutlineUI}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Editar
          </button>
          {archivado ? (
            <button
              onClick={() => setActivo.mutate(true)}
              disabled={setActivo.isPending}
              className={btnPrimaryUI}
            >
              <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
              Reactivar
            </button>
          ) : (
            <button onClick={() => setConfirmArchivar(true)} className={btnOutlineUI}>
              <Archive className="h-4 w-4" aria-hidden="true" />
              Archivar
            </button>
          )}
          <CampanaHeader />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* Datos personales */}
        <div className={cn(cardUI, 'p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm')}>
          {paciente.dni && <div><span className="text-muted-foreground">CI:</span> <span className="font-medium tabular-nums">{paciente.dni}</span></div>}
          {paciente.telefono && (
            <div><span className="text-muted-foreground">Teléfono:</span> <span className="font-medium tabular-nums">{telefonoIntl(paciente.telefono, paciente.pais)}</span></div>
          )}
          {paciente.email && <div><span className="text-muted-foreground">Correo:</span> <span className="font-medium">{paciente.email}</span></div>}
          {paciente.fechaNacimiento && (
            <div>
              <span className="text-muted-foreground">Nacimiento:</span>{' '}
              <span className="font-medium">
                {formatDia(String(paciente.fechaNacimiento))}{edad !== null ? ` (${edad} años)` : ''}
              </span>
            </div>
          )}
          {paciente.direccion && (
            <div><span className="text-muted-foreground">Dirección:</span> <span className="font-medium">{paciente.direccion}</span></div>
          )}
          {paciente.notas && (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">Notas:</span>{' '}
              <span className="font-medium">{paciente.notas}</span>
            </div>
          )}
        </div>

        {/* Historial de citas / historia clinica */}
        <div>
          <div className="flex gap-1 mb-3" role="tablist">
            {([
              ['citas', 'Historial de citas'],
              ['historia', 'Historia clínica'],
            ] as const).map(([valor, label]) => (
              <button key={valor} onClick={() => setTab(valor)}
                role="tab"
                aria-selected={tab === valor}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                  tab === valor ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'historia' ? (
            <HistoriaClinicaTimeline pacienteId={paciente.id} onAgendarControl={setFechaControl} />
          ) : citasOrdenadas.length === 0 ? (
            <div className={cardUI}>
              <EmptyState icon={CalendarPlus} title="Sin citas registradas" description="Cuando el paciente tenga citas van a listarse acá." />
            </div>
          ) : (
            <div className={cn(cardUI, 'overflow-x-auto')}>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Doctor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Servicio</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {citasOrdenadas.map((cita) => (
                    <Fragment key={cita.id}>
                    <tr className="border-b last:border-0">
                      <td className="px-4 py-3 text-foreground">
                        <span className="inline-flex items-center gap-1">
                          {cita.atencion && (
                            <button
                              onClick={() => setCitaExpandida(citaExpandida === cita.id ? null : cita.id)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded text-violet-500 hover:text-violet-700 hover:bg-violet-500/10 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                              title="Ver atención"
                              aria-label="Ver atención"
                              aria-expanded={citaExpandida === cita.id}
                            >
                              {citaExpandida === cita.id
                                ? <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                : <Stethoscope className="h-4 w-4" aria-hidden="true" />}
                            </button>
                          )}
                          <span className="tabular-nums">
                            {format(new Date(cita.fechaHora), 'dd/MM/yyyy HH:mm', { locale: es })}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{cita.doctor.nombre}</td>
                      <td className="px-4 py-3 text-muted-foreground">{cita.servicio.nombre}</td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: COLORES_ESTADO[cita.estado as EstadoCita] + '20',
                            color: COLORES_ESTADO[cita.estado as EstadoCita],
                          }}
                        >
                          {LABEL_ESTADO[cita.estado as EstadoCita] ?? cita.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-foreground tabular-nums">
                        {cita.cobro ? formatMoneda(Number(cita.cobro.total)) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {cita.cobro && Number(cita.cobro.saldoPendiente) > 0 ? (
                          <span className="text-destructive font-medium">
                            {formatMoneda(Number(cita.cobro.saldoPendiente))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/70">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cita.cobro && Number(cita.cobro.saldoPendiente) > 0 && (
                          <button
                            onClick={() => setCitaCobro(cita as unknown as Cita)}
                            className="text-xs font-medium text-primary cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150"
                          >
                            Cobrar
                          </button>
                        )}
                      </td>
                    </tr>
                    {citaExpandida === cita.id && cita.atencion && (
                      <tr className="bg-violet-500/5 border-b last:border-0">
                        <td colSpan={7} className="px-6 py-3 text-sm text-muted-foreground space-y-1">
                          {cita.atencion.motivo && <p><span className="font-medium">Motivo:</span> {cita.atencion.motivo}</p>}
                          {cita.atencion.diagnostico && <p><span className="font-medium">Diagnóstico:</span> {cita.atencion.diagnostico}</p>}
                          {cita.atencion.tratamiento && <p><span className="font-medium">Tratamiento:</span> {cita.atencion.tratamiento}</p>}
                          {cita.atencion.evolucion && <p><span className="font-medium">Evolución:</span> {cita.atencion.evolucion}</p>}
                          {cita.atencion.proximoControl && (
                            <p className="flex flex-wrap items-center gap-2">
                              <span><span className="font-medium">Próximo control:</span> {formatDia(cita.atencion.proximoControl)}</span>
                              <button
                                onClick={() => setFechaControl(cita.atencion!.proximoControl!.slice(0, 10))}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150"
                              >
                                <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                                Agendar control
                              </button>
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editando && (
        <PacienteModal
          paciente={paciente}
          onClose={() => {
            setEditando(false)
            qc.invalidateQueries({ queryKey: ['paciente', id] })
          }}
        />
      )}

      {citaCobro && (
        <CobroModal
          cita={citaCobro}
          onClose={() => {
            setCitaCobro(null)
            qc.invalidateQueries({ queryKey: ['paciente', id] })
          }}
        />
      )}

      {fechaControl && (
        <NuevaCitaModal
          fechaInicial={new Date(`${fechaControl}T09:00:00`)}
          pacienteInicial={{ id: paciente.id, nombre: paciente.nombre, apellido: paciente.apellido }}
          onClose={() => {
            setFechaControl(null)
            qc.invalidateQueries({ queryKey: ['paciente', id] })
          }}
        />
      )}

      {confirmArchivar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
          <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
            <ModalHeader icon={Archive} title="Archivar paciente" onClose={() => setConfirmArchivar(false)} />
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Vas a archivar a{' '}
                <span className="font-medium text-foreground">{paciente.nombre} {paciente.apellido}</span>.
                Sale del listado de pacientes pero su historia se conserva y podés reactivarlo cuando quieras.
              </p>
              {(tieneDeuda || citasFuturas > 0) && (
                <p
                  role="alert"
                  className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    {tieneDeuda && <>Tiene una deuda de {formatMoneda(Number(paciente.deudaTotal))}. </>}
                    {citasFuturas > 0 && (
                      <>Tiene {citasFuturas} {citasFuturas === 1 ? 'cita futura' : 'citas futuras'}. </>
                    )}
                    Igual podés archivarlo.
                  </span>
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setConfirmArchivar(false)} className={cn(btnOutlineUI, 'flex-1')}>
                  Cancelar
                </button>
                <button
                  onClick={() => setActivo.mutate(false)}
                  disabled={setActivo.isPending}
                  className={cn(btnPrimaryUI, 'flex-1')}
                >
                  {setActivo.isPending ? 'Archivando...' : 'Archivar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
