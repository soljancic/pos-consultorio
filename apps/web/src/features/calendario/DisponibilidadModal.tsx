import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertCircle, Trash2, BookmarkPlus } from 'lucide-react'
import { TipoDisponibilidad } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatFecha, cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'
import { ConfirmarModal } from '../../components/shared/ConfirmarModal'

export const LABEL_TIPO: Record<TipoDisponibilidad, string> = {
  [TipoDisponibilidad.DISPONIBLE]: 'Disponible',
  [TipoDisponibilidad.VACACIONES]: 'Vacaciones',
  [TipoDisponibilidad.AUSENCIA]: 'Ausencia',
  [TipoDisponibilidad.CAPACITACION]: 'Capacitación',
  [TipoDisponibilidad.REUNION]: 'Reunión',
  [TipoDisponibilidad.BLOQUEADO]: 'Bloqueado',
}

const PRESETS = [
  { label: '09:00 - 17:00', inicio: '09:00', fin: '17:00' },
  { label: '09:00 - 20:00', inicio: '09:00', fin: '20:00' },
  { label: '08:00 - 18:00', inicio: '08:00', fin: '18:00' },
]

const DIAS = [
  { valor: 1, label: 'L' }, { valor: 2, label: 'M' }, { valor: 3, label: 'X' },
  { valor: 4, label: 'J' }, { valor: 5, label: 'V' }, { valor: 6, label: 'S' },
  { valor: 0, label: 'D' },
]

export interface BloqueEditable {
  id: number
  fecha: string
  horaInicio: string
  horaFin: string
  tipo: TipoDisponibilidad
  nota: string | null
  serieId: number | null
}

interface Props {
  doctorId: number
  doctorNombre: string
  fecha: string // yyyy-MM-dd
  bloque?: BloqueEditable | null
  onClose: () => void
}

type Alcance = 'uno' | 'serie' | 'desde'

export function DisponibilidadModal({ doctorId, doctorNombre, fecha, bloque, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!bloque
  const [error, setError] = useState('')
  const [horaInicio, setHoraInicio] = useState(bloque?.horaInicio ?? '09:00')
  const [horaFin, setHoraFin] = useState(bloque?.horaFin ?? '17:00')
  const [tipo, setTipo] = useState<TipoDisponibilidad>(bloque?.tipo ?? TipoDisponibilidad.DISPONIBLE)
  const [nota, setNota] = useState(bloque?.nota ?? '')
  const [repetir, setRepetir] = useState(false)
  const [diasSemana, setDiasSemana] = useState<number[]>([1, 2, 3, 4, 5])
  const [hasta, setHasta] = useState('')
  const [alcance, setAlcance] = useState<Alcance>('uno')
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false)
  // Calendario f2b: plantillas nombradas del consultorio
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false)
  const [nombrePlantilla, setNombrePlantilla] = useState('')

  const { data: plantillas = [] } = useQuery<Array<{ id: number; nombre: string; horaInicio: string; horaFin: string }>>({
    queryKey: ['plantillas-horario'],
    queryFn: () => api.get('/plantillas-horario').then((r) => r.data),
    enabled: !editando,
  })

  const crearPlantilla = useMutation({
    mutationFn: () =>
      api.post('/plantillas-horario', { nombre: nombrePlantilla.trim(), horaInicio, horaFin }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plantillas-horario'] })
      setGuardandoPlantilla(false)
      setNombrePlantilla('')
    },
    onError,
  })

  function invalidar() {
    qc.invalidateQueries({ queryKey: ['disponibilidades'] })
    onClose()
  }

  function onError(err: any) {
    const msg = err.response?.data?.message
    setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar')
  }

  const crear = useMutation({
    mutationFn: () =>
      api.post('/disponibilidades', {
        doctorId,
        fecha,
        horaInicio,
        horaFin,
        tipo,
        nota: nota || undefined,
        ...(repetir && { repetirDiasSemana: diasSemana, repetirHasta: hasta }),
      }),
    onSuccess: invalidar,
    onError,
  })

  const editar = useMutation({
    mutationFn: () =>
      api.put(`/disponibilidades/${bloque!.id}?alcance=${alcance}`, {
        horaInicio,
        horaFin,
        tipo,
        nota: nota || undefined,
      }),
    onSuccess: invalidar,
    onError,
  })

  const eliminar = useMutation({
    mutationFn: () => api.delete(`/disponibilidades/${bloque!.id}?alcance=${alcance}`),
    onSuccess: invalidar,
    onError,
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (editando) editar.mutate()
    else crear.mutate()
  }

  const avisoEliminar =
    alcance === 'uno' ? 'este bloque' : alcance === 'serie' ? 'TODA la serie' : 'la serie desde esta fecha en adelante'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {editando ? 'Editar horario' : 'Nuevo horario'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {doctorNombre} &bull; {formatFecha(`${fecha}T00:00:00`)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!editando && (
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setHoraInicio(p.inicio); setHoraFin(p.fin) }}
                  className={cn(
                    'text-xs font-medium px-2.5 py-1.5 rounded-md border cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                    horaInicio === p.inicio && horaFin === p.fin
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-foreground border-input hover:border-primary/60',
                  )}
                >
                  {p.label}
                </button>
              ))}
              {plantillas.map((p) => (
                <button
                  key={`pl-${p.id}`}
                  type="button"
                  title={`${p.horaInicio} - ${p.horaFin}`}
                  onClick={() => { setHoraInicio(p.horaInicio); setHoraFin(p.horaFin) }}
                  className={cn(
                    'text-xs font-medium px-2.5 py-1.5 rounded-md border cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                    horaInicio === p.horaInicio && horaFin === p.horaFin
                      ? 'bg-accent text-accent-foreground border-accent'
                      : 'bg-card text-accent border-accent/40 hover:border-accent',
                  )}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="disp-inicio" className="block text-sm font-medium text-foreground mb-1.5">Desde *</label>
              <input id="disp-inicio" type="time" required value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)} className={inputUI} />
            </div>
            <div>
              <label htmlFor="disp-fin" className="block text-sm font-medium text-foreground mb-1.5">Hasta *</label>
              <input id="disp-fin" type="time" required value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)} className={inputUI} />
            </div>
          </div>

          {!editando && (
            guardandoPlantilla ? (
              <div className="flex gap-2">
                <input
                  value={nombrePlantilla}
                  onChange={(e) => setNombrePlantilla(e.target.value)}
                  placeholder="Nombre de la plantilla (ej: Mañana corta)"
                  maxLength={40}
                  aria-label="Nombre de la plantilla"
                  className={cn(inputUI, 'flex-1 h-9 text-xs')}
                />
                <button
                  type="button"
                  disabled={!nombrePlantilla.trim() || crearPlantilla.isPending}
                  onClick={() => crearPlantilla.mutate()}
                  className="text-xs font-medium px-3 h-9 rounded-md bg-accent text-accent-foreground cursor-pointer hover:bg-accent/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                >
                  {crearPlantilla.isPending ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => { setGuardandoPlantilla(false); setNombrePlantilla('') }}
                  className="text-xs font-medium px-2 h-9 rounded-md text-muted-foreground cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setGuardandoPlantilla(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150"
              >
                <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
                Guardar estas horas como plantilla
              </button>
            )
          )}

          <div>
            <label htmlFor="disp-tipo" className="block text-sm font-medium text-foreground mb-1.5">Tipo *</label>
            <select id="disp-tipo" value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoDisponibilidad)} className={inputUI}>
              {Object.values(TipoDisponibilidad).map((t) => (
                <option key={t} value={t}>{LABEL_TIPO[t]}</option>
              ))}
            </select>
            {tipo !== TipoDisponibilidad.DISPONIBLE && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Los bloqueos no aceptan citas en ese horario.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="disp-nota" className="block text-sm font-medium text-foreground mb-1.5">
              Nota interna <span className="text-muted-foreground/70 font-normal">(opcional)</span>
            </label>
            <input id="disp-nota" value={nota} onChange={(e) => setNota(e.target.value)} className={inputUI} />
          </div>

          {!editando && (
            <div className="space-y-3 border-t pt-4">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
                <input type="checkbox" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} className="rounded" />
                Repetir semanalmente
              </label>
              {repetir && (
                <>
                  <div className="flex gap-1.5" role="group" aria-label="Dias de la semana">
                    {DIAS.map((d) => (
                      <button
                        key={d.valor}
                        type="button"
                        aria-pressed={diasSemana.includes(d.valor)}
                        aria-label={`Día ${d.label}`}
                        onClick={() =>
                          setDiasSemana((prev) =>
                            prev.includes(d.valor) ? prev.filter((v) => v !== d.valor) : [...prev, d.valor],
                          )
                        }
                        className={cn(
                          'h-9 w-9 rounded-full text-sm font-semibold cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                          diasSemana.includes(d.valor)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/70',
                        )}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label htmlFor="disp-hasta" className="block text-sm font-medium text-foreground mb-1.5">
                      Repetir hasta *
                    </label>
                    <input id="disp-hasta" type="date" required={repetir} value={hasta}
                      onChange={(e) => setHasta(e.target.value)} className={inputUI} />
                  </div>
                </>
              )}
            </div>
          )}

          {editando && bloque?.serieId && (
            <fieldset className="border-t pt-4">
              <legend className="text-sm font-medium text-foreground pb-2">Aplicar a</legend>
              <div className="space-y-1.5 text-sm">
                {([['uno', 'Solo esta fecha'], ['desde', 'Desde esta fecha en adelante'], ['serie', 'Toda la serie']] as const).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer text-foreground">
                    <input type="radio" name="alcance" value={v} checked={alcance === v}
                      onChange={() => setAlcance(v)} />
                    {l}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            {editando && (
              <button
                type="button"
                onClick={() => setConfirmandoEliminar(true)}
                disabled={eliminar.isPending}
                aria-label="Eliminar horario"
                className={cn(btnIconUI, 'h-10 w-10 border border-input text-destructive hover:bg-destructive/10')}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Cancelar
            </button>
            <button type="submit" disabled={crear.isPending || editar.isPending} className={cn(btnPrimaryUI, 'flex-1')}>
              {crear.isPending || editar.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>

      {confirmandoEliminar && (
        <ConfirmarModal
          titulo="Eliminar horario"
          mensaje={`Se elimina ${avisoEliminar} de ${doctorNombre}.`}
          confirmLabel="Eliminar"
          pendiente={eliminar.isPending}
          onConfirm={() => { setError(''); eliminar.mutate() }}
          onClose={() => setConfirmandoEliminar(false)}
        />
      )}
    </div>
  )
}
