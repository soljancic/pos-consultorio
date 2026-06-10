import { Fragment, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronDown, MessageCircle, Pencil, Stethoscope } from 'lucide-react'
import { format, differenceInYears } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api-client'
import { formatMoneda, formatFecha, buildWhatsAppUrl } from '../../lib/utils'
import { COLORES_ESTADO } from '@pos/types'
import type { EstadoCita, Paciente, Cita } from '@pos/types'
import { CobroModal } from '../agenda/CobroModal'
import { PacienteModal } from './PacienteModal'

const LABEL_ESTADO: Record<EstadoCita, string> = {
  PENDIENTE: 'Pendiente', CONFIRMADA: 'Confirmada', LLEGO: 'Llego',
  EN_ATENCION: 'En atencion', ATENDIDA: 'Atendida', COBRADO: 'Cobrado',
  CON_DEUDA: 'Con deuda', CANCELADA: 'Cancelada', NO_ASISTIO: 'No asistio',
  REPROGRAMADA: 'Reprogramada',
} as Record<EstadoCita, string>

const LABEL_SEXO: Record<string, string> = { M: 'Masculino', F: 'Femenino', X: 'Otro' }

type Atencion = {
  motivo: string | null
  diagnostico: string | null
  tratamiento: string | null
  evolucion: string | null
  proximoControl: string | null
}

type PacienteDetalle = Paciente & {
  citas: Array<Cita & {
    doctor: { nombre: string }
    servicio: { nombre: string; precioBase: number }
    cobro: { id: number; total: number; saldoPendiente: number; estado: string } | null
    atencion: Atencion | null
  }>
}

export function PacienteDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [citaCobro, setCitaCobro] = useState<Cita | null>(null)
  const [citaExpandida, setCitaExpandida] = useState<number | null>(null)

  const { data: paciente, isLoading } = useQuery<PacienteDetalle>({
    queryKey: ['paciente', id],
    queryFn: () => api.get(`/pacientes/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando...</div>
  if (!paciente) return <div className="p-6 text-muted-foreground">Paciente no encontrado</div>

  const edad = paciente.fechaNacimiento
    ? differenceInYears(new Date(), new Date(paciente.fechaNacimiento))
    : null

  const citasOrdenadas = [...(paciente.citas ?? [])].sort(
    (a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime()
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/pacientes')} className="p-1 rounded hover:bg-muted">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {paciente.apellido}, {paciente.nombre}
            </h1>
            {Number(paciente.deudaTotal) > 0 && (
              <span className="text-xs text-destructive font-medium">
                {formatMoneda(Number(paciente.deudaTotal))} en deuda
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {paciente.whatsapp && (
            <a
              href={buildWhatsAppUrl(paciente.whatsapp, `Hola ${paciente.nombre}, le contactamos desde el consultorio.`)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 px-3 py-2 bg-accent text-white rounded-md text-sm hover:bg-accent/90"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          )}
          <button
            onClick={() => setEditando(true)}
            className="flex items-center gap-1 px-3 py-2 border rounded-md text-sm hover:bg-muted/60"
          >
            <Pencil className="h-4 w-4" />
            Editar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* Datos personales */}
        <div className="bg-card rounded-lg border p-5 grid grid-cols-2 gap-4 text-sm">
          {paciente.dni && <div><span className="text-muted-foreground">DNI:</span> <span className="font-medium">{paciente.dni}</span></div>}
          {paciente.telefono && <div><span className="text-muted-foreground">Telefono:</span> <span className="font-medium">{paciente.telefono}</span></div>}
          {paciente.whatsapp && <div><span className="text-muted-foreground">WhatsApp:</span> <span className="font-medium">{paciente.whatsapp}</span></div>}
          {paciente.email && <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{paciente.email}</span></div>}
          {paciente.fechaNacimiento && (
            <div>
              <span className="text-muted-foreground">Nacimiento:</span>{' '}
              <span className="font-medium">
                {formatFecha(paciente.fechaNacimiento)}{edad !== null ? ` (${edad} anos)` : ''}
              </span>
            </div>
          )}
          {paciente.sexo && (
            <div><span className="text-muted-foreground">Sexo:</span> <span className="font-medium">{LABEL_SEXO[paciente.sexo] ?? paciente.sexo}</span></div>
          )}
          {paciente.direccion && (
            <div><span className="text-muted-foreground">Direccion:</span> <span className="font-medium">{paciente.direccion}</span></div>
          )}
          {paciente.notas && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Notas:</span>{' '}
              <span className="font-medium">{paciente.notas}</span>
            </div>
          )}
        </div>

        {/* Historial de citas */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Historial de citas
          </h2>
          {citasOrdenadas.length === 0 ? (
            <div className="bg-card rounded-lg border p-8 text-center text-muted-foreground/70 text-sm">
              Sin citas registradas
            </div>
          ) : (
            <div className="bg-card rounded-lg border overflow-x-auto">
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
                              className="text-violet-500 hover:text-violet-700"
                              title="Ver atencion"
                            >
                              {citaExpandida === cita.id
                                ? <ChevronDown className="h-4 w-4" />
                                : <Stethoscope className="h-4 w-4" />}
                            </button>
                          )}
                          {format(new Date(cita.fechaHora), 'dd/MM/yyyy HH:mm', { locale: es })}
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
                      <td className="px-4 py-3 text-right text-foreground">
                        {cita.cobro ? formatMoneda(Number(cita.cobro.total)) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
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
                            className="text-xs text-primary hover:underline"
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
                          {cita.atencion.diagnostico && <p><span className="font-medium">Diagnostico:</span> {cita.atencion.diagnostico}</p>}
                          {cita.atencion.tratamiento && <p><span className="font-medium">Tratamiento:</span> {cita.atencion.tratamiento}</p>}
                          {cita.atencion.evolucion && <p><span className="font-medium">Evolucion:</span> {cita.atencion.evolucion}</p>}
                          {cita.atencion.proximoControl && <p><span className="font-medium">Proximo control:</span> {formatFecha(cita.atencion.proximoControl)}</p>}
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
    </div>
  )
}
