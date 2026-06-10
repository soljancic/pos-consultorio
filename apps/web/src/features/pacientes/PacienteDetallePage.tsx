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
    cobro: { id: string; total: number; saldoPendiente: number; estado: string } | null
    atencion: Atencion | null
  }>
}

export function PacienteDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [citaCobro, setCitaCobro] = useState<Cita | null>(null)
  const [citaExpandida, setCitaExpandida] = useState<string | null>(null)

  const { data: paciente, isLoading } = useQuery<PacienteDetalle>({
    queryKey: ['paciente', id],
    queryFn: () => api.get(`/pacientes/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6 text-slate-500">Cargando...</div>
  if (!paciente) return <div className="p-6 text-slate-500">Paciente no encontrado</div>

  const edad = paciente.fechaNacimiento
    ? differenceInYears(new Date(), new Date(paciente.fechaNacimiento))
    : null

  const citasOrdenadas = [...(paciente.citas ?? [])].sort(
    (a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime()
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/pacientes')} className="p-1 rounded hover:bg-slate-100">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              {paciente.apellido}, {paciente.nombre}
            </h1>
            {Number(paciente.deudaTotal) > 0 && (
              <span className="text-xs text-red-600 font-medium">
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
              className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          )}
          <button
            onClick={() => setEditando(true)}
            className="flex items-center gap-1 px-3 py-2 border rounded-md text-sm hover:bg-slate-50"
          >
            <Pencil className="h-4 w-4" />
            Editar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* Datos personales */}
        <div className="bg-white rounded-lg border p-5 grid grid-cols-2 gap-4 text-sm">
          {paciente.dni && <div><span className="text-slate-500">DNI:</span> <span className="font-medium">{paciente.dni}</span></div>}
          {paciente.telefono && <div><span className="text-slate-500">Telefono:</span> <span className="font-medium">{paciente.telefono}</span></div>}
          {paciente.whatsapp && <div><span className="text-slate-500">WhatsApp:</span> <span className="font-medium">{paciente.whatsapp}</span></div>}
          {paciente.email && <div><span className="text-slate-500">Email:</span> <span className="font-medium">{paciente.email}</span></div>}
          {paciente.fechaNacimiento && (
            <div>
              <span className="text-slate-500">Nacimiento:</span>{' '}
              <span className="font-medium">
                {formatFecha(paciente.fechaNacimiento)}{edad !== null ? ` (${edad} anos)` : ''}
              </span>
            </div>
          )}
          {paciente.sexo && (
            <div><span className="text-slate-500">Sexo:</span> <span className="font-medium">{LABEL_SEXO[paciente.sexo] ?? paciente.sexo}</span></div>
          )}
          {paciente.direccion && (
            <div><span className="text-slate-500">Direccion:</span> <span className="font-medium">{paciente.direccion}</span></div>
          )}
          {paciente.notas && (
            <div className="col-span-2">
              <span className="text-slate-500">Notas:</span>{' '}
              <span className="font-medium">{paciente.notas}</span>
            </div>
          )}
        </div>

        {/* Historial de citas */}
        <div>
          <h2 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-3">
            Historial de citas
          </h2>
          {citasOrdenadas.length === 0 ? (
            <div className="bg-white rounded-lg border p-8 text-center text-slate-400 text-sm">
              Sin citas registradas
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Fecha</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Doctor</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Servicio</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Estado</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Saldo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {citasOrdenadas.map((cita) => (
                    <Fragment key={cita.id}>
                    <tr className="border-b last:border-0">
                      <td className="px-4 py-3 text-slate-700">
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
                      <td className="px-4 py-3 text-slate-600">{cita.doctor.nombre}</td>
                      <td className="px-4 py-3 text-slate-600">{cita.servicio.nombre}</td>
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
                      <td className="px-4 py-3 text-right text-slate-700">
                        {cita.cobro ? formatMoneda(Number(cita.cobro.total)) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cita.cobro && Number(cita.cobro.saldoPendiente) > 0 ? (
                          <span className="text-red-600 font-medium">
                            {formatMoneda(Number(cita.cobro.saldoPendiente))}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cita.cobro && Number(cita.cobro.saldoPendiente) > 0 && (
                          <button
                            onClick={() => setCitaCobro(cita as unknown as Cita)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Cobrar
                          </button>
                        )}
                      </td>
                    </tr>
                    {citaExpandida === cita.id && cita.atencion && (
                      <tr className="bg-violet-50/50 border-b last:border-0">
                        <td colSpan={7} className="px-6 py-3 text-sm text-slate-600 space-y-1">
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
