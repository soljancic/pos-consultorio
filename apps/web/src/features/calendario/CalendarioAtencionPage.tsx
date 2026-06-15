import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addDays, startOfWeek, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CalendarClock, Plus, UserRound } from 'lucide-react'
import { TipoDisponibilidad } from '@pos/types'
import type { Doctor } from '@pos/types'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { btnIconUI, btnPrimaryUI, cardUI, chipIconUI } from '../../lib/ui'
import { useAuthStore } from '../../stores/auth.store'
import { EmptyState } from '../../components/shared/EmptyState'
import { ErrorState } from '../../components/shared/ErrorState'
import { DoctorAvatar } from '../../components/shared/DoctorAvatar'
import { DisponibilidadModal, LABEL_TIPO, type BloqueEditable } from './DisponibilidadModal'

// Scheduler semanal: filas = doctores, columnas = dias, bloques = horarios.
// Mobile (<sm): strip de dias + tarjetas de doctor para el dia seleccionado.
// Desktop (>=sm): grid semanal con scroll horizontal.

type Bloque = BloqueEditable & { doctorId: number }

const ESTILO_TIPO: Record<TipoDisponibilidad, string> = {
  [TipoDisponibilidad.DISPONIBLE]: 'bg-accent/10 text-accent border-accent/30',
  [TipoDisponibilidad.VACACIONES]: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  [TipoDisponibilidad.AUSENCIA]: 'bg-destructive/10 text-destructive border-destructive/30',
  [TipoDisponibilidad.CAPACITACION]: 'bg-primary/10 text-primary border-primary/30',
  [TipoDisponibilidad.REUNION]: 'bg-primary/10 text-primary border-primary/30',
  [TipoDisponibilidad.BLOQUEADO]: 'bg-muted text-muted-foreground border-border',
}

export function CalendarioAtencionPage() {
  const user = useAuthStore((s) => s.user)
  const esAdmin = user?.rol === 'ADMIN'
  const esDoctor = user?.rol === 'DOCTOR'
  const [fecha, setFecha] = useState(new Date())
  const [modal, setModal] = useState<{
    doctorId: number
    doctorNombre: string
    fecha: string
    bloque?: BloqueEditable | null
  } | null>(null)

  const inicioSemana = startOfWeek(fecha, { weekStartsOn: 1 })
  const dias = Array.from({ length: 7 }, (_, i) => addDays(inicioSemana, i))
  const desde = format(inicioSemana, 'yyyy-MM-dd')
  const hasta = format(addDays(inicioSemana, 6), 'yyyy-MM-dd')
  const hoy = new Date()

  const { data: doctores = [], isError: errDoctores, refetch: refDoctores } = useQuery<Doctor[]>({
    queryKey: ['doctores'],
    queryFn: () => api.get('/doctores').then((r) => r.data),
  })

  const { data: bloques = [], isError: errBloques, refetch: refBloques } = useQuery<Bloque[]>({
    queryKey: ['disponibilidades', desde, hasta],
    queryFn: () => api.get(`/disponibilidades?desde=${desde}&hasta=${hasta}`).then((r) => r.data),
  })

  const doctorPropio = esDoctor ? doctores.find((d) => d.usuarioId === user?.id) : undefined
  const puedeEditar = (doctorId: number) => esAdmin || doctorPropio?.id === doctorId

  function bloquesDe(doctorId: number, dia: Date) {
    const diaStr = format(dia, 'yyyy-MM-dd')
    return bloques.filter(
      (b) => b.doctorId === doctorId && b.fecha.slice(0, 10) === diaStr,
    )
  }

  function navegar(delta: number) {
    setFecha((f) => addDays(f, delta))
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className={chipIconUI}>
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
          </span>
          Calendario de Atención
        </h1>
        {/* Nav semana — igual en mobile y desktop */}
        <div className="flex items-center gap-2">
          <button onClick={() => navegar(-7)} aria-label="Semana anterior"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-sm font-medium text-foreground capitalize tabular-nums">
            {format(inicioSemana, 'd MMM', { locale: es })} – {format(addDays(inicioSemana, 6), 'd MMM', { locale: es })}
          </span>
          <button onClick={() => navegar(7)} aria-label="Semana siguiente"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <button onClick={() => setFecha(new Date())}
            className="text-xs font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded px-1 py-1 transition-colors duration-150">
            Hoy
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {errDoctores || errBloques ? (
          <ErrorState onRetry={() => { refDoctores(); refBloques() }} />
        ) : doctores.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No hay doctores activos"
            description="Creá un profesional en el Catálogo para configurar sus horarios."
            action={<Link to="/catalogo" className={cn(btnPrimaryUI, 'h-9')}>Ir al Catálogo</Link>}
          />
        ) : (
          <>
            {/* ── Mobile: strip de dias + tarjetas ── */}
            <div className="sm:hidden space-y-4">
              {/* Strip de 7 dias — tap para seleccionar */}
              <div className="flex gap-1">
                {dias.map((dia) => {
                  const seleccionado = isSameDay(dia, fecha)
                  const esHoy = isSameDay(dia, hoy)
                  return (
                    <button
                      key={dia.toISOString()}
                      onClick={() => setFecha(dia)}
                      className={cn(
                        'flex-1 flex flex-col items-center py-2 rounded-xl text-xs font-medium transition-colors duration-150 min-w-0',
                        seleccionado
                          ? 'bg-primary text-primary-foreground'
                          : esHoy
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <span className="uppercase text-[10px]">
                        {format(dia, 'EEEEE', { locale: es })}
                      </span>
                      <span className="font-semibold tabular-nums mt-0.5">{format(dia, 'd')}</span>
                    </button>
                  )
                })}
              </div>

              {/* Tarjetas de doctor para el dia seleccionado */}
              <div className="space-y-3">
                {doctores.map((doc) => {
                  const delDia = bloquesDe(doc.id, fecha)
                  const fechaStr = format(fecha, 'yyyy-MM-dd')
                  return (
                    <div key={doc.id} className={cn(cardUI)}>
                      <div className="flex items-center justify-between px-4 py-3 border-b">
                        <div className="flex items-center gap-2">
                          <DoctorAvatar nombre={doc.nombre} colorAgenda={doc.colorAgenda} fotoUrl={doc.fotoUrl} size={28} />
                          <span className="text-sm font-medium text-foreground">{doc.nombre}</span>
                        </div>
                        {puedeEditar(doc.id) && (
                          <button
                            onClick={() => setModal({ doctorId: doc.id, doctorNombre: doc.nombre, fecha: fechaStr })}
                            aria-label={`Agregar horario a ${doc.nombre}`}
                            className={cn(btnIconUI, 'h-8 w-8 text-primary hover:bg-primary/10')}
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <div className="px-4 py-3 space-y-1.5 min-h-[52px]">
                        {delDia.length === 0 ? (
                          <p className="text-sm text-muted-foreground/55 py-0.5">Sin horarios</p>
                        ) : (
                          delDia.map((b) => (
                            <button
                              key={b.id}
                              onClick={() => puedeEditar(doc.id) && setModal({ doctorId: doc.id, doctorNombre: doc.nombre, fecha: fechaStr, bloque: b })}
                              disabled={!puedeEditar(doc.id)}
                              className={cn(
                                'flex items-center justify-between w-full text-left text-xs font-medium px-2.5 py-2 rounded-lg border tabular-nums transition-colors duration-150',
                                ESTILO_TIPO[b.tipo],
                                puedeEditar(doc.id) && 'cursor-pointer hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              )}
                            >
                              <span>{b.horaInicio}–{b.horaFin}</span>
                              {b.tipo !== TipoDisponibilidad.DISPONIBLE && (
                                <span className="font-normal ml-2 text-right">{LABEL_TIPO[b.tipo]}</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Desktop: grid semanal ── */}
            <div className={cn(cardUI, 'hidden sm:block overflow-x-auto')}>
              <div className="min-w-[900px]">
                {/* Header de dias */}
                <div className="grid border-b bg-muted/50" style={{ gridTemplateColumns: '160px repeat(7, 1fr)' }}>
                  <div className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Doctor</div>
                  {dias.map((dia) => (
                    <div key={dia.toISOString()}
                      className={cn('px-2 py-2.5 text-center border-l', isSameDay(dia, hoy) && 'bg-primary/10')}>
                      <span className="block text-xs uppercase text-muted-foreground">
                        {format(dia, 'EEE', { locale: es })}
                      </span>
                      <span className="text-sm font-semibold text-foreground tabular-nums">{format(dia, 'd')}</span>
                    </div>
                  ))}
                </div>

                {/* Una fila por doctor */}
                {doctores.map((doc) => (
                  <div key={doc.id} className="grid border-b last:border-0"
                    style={{ gridTemplateColumns: '160px repeat(7, 1fr)' }}>
                    <div className="flex items-center gap-2 px-3 py-3">
                      <DoctorAvatar nombre={doc.nombre} colorAgenda={doc.colorAgenda} fotoUrl={doc.fotoUrl} size={28} />
                      <span className="text-sm font-medium text-foreground truncate">{doc.nombre}</span>
                    </div>
                    {dias.map((dia) => {
                      const delDia = bloquesDe(doc.id, dia)
                      const fechaStr = format(dia, 'yyyy-MM-dd')
                      return (
                        <div key={dia.toISOString()}
                          className={cn('group border-l p-1.5 min-h-[72px] space-y-1', isSameDay(dia, hoy) && 'bg-primary/5')}>
                          {delDia.map((b) => (
                            <button
                              key={b.id}
                              onClick={() => puedeEditar(doc.id) && setModal({ doctorId: doc.id, doctorNombre: doc.nombre, fecha: fechaStr, bloque: b })}
                              disabled={!puedeEditar(doc.id)}
                              title={`${LABEL_TIPO[b.tipo]}${b.nota ? ` — ${b.nota}` : ''}`}
                              className={cn(
                                'block w-full text-left text-xs font-medium px-1.5 py-1 rounded border tabular-nums transition-colors duration-150',
                                ESTILO_TIPO[b.tipo],
                                puedeEditar(doc.id) && 'cursor-pointer hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              )}
                            >
                              {b.horaInicio}–{b.horaFin}
                              {b.tipo !== TipoDisponibilidad.DISPONIBLE && (
                                <span className="block truncate font-normal">{LABEL_TIPO[b.tipo]}</span>
                              )}
                            </button>
                          ))}
                          {puedeEditar(doc.id) && (
                            <button
                              onClick={() => setModal({ doctorId: doc.id, doctorNombre: doc.nombre, fecha: fechaStr })}
                              aria-label={`Agregar horario a ${doc.nombre} el ${fechaStr}`}
                              className="w-full flex items-center justify-center py-1 rounded text-muted-foreground/0 group-hover:text-muted-foreground/70 hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:text-muted-foreground transition-colors duration-150"
                            >
                              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground mt-3">
          Las citas solo se pueden agendar dentro de los rangos "Disponible" (si tiene
          horarios configurados); No se podrá agendar citas fuera de estos rangos, ni en rango Bloqueado.
        </p>
      </div>

      {modal && (
        <DisponibilidadModal
          doctorId={modal.doctorId}
          doctorNombre={modal.doctorNombre}
          fecha={modal.fecha}
          bloque={modal.bloque}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
