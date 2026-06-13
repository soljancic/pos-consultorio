import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, UserRound } from 'lucide-react'
import type { Servicio } from '@pos/types'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, errorUI } from '../../lib/ui'
import { ModalHeader } from '../../components/shared/ModalHeader'

const COLORES = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

interface Doctor {
  id?: number
  nombre: string
  especialidad?: string
  comisionPct?: number | string | null
  colorAgenda: string
  activo: boolean
  servicios?: Array<{ id: number }>
  // Precio override por servicio (vacio = precioBase del servicio)
  preciosServicio?: Array<{ servicioId: number; precio: string | number }>
}
interface Props { doctor?: Doctor | null; onClose: () => void }

export function DoctorModal({ doctor, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!doctor?.id
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nombre: doctor?.nombre ?? '',
    especialidad: doctor?.especialidad ?? '',
    comisionPct: doctor?.comisionPct != null ? String(doctor.comisionPct) : '',
    colorAgenda: doctor?.colorAgenda ?? '#3B82F6',
    activo: doctor?.activo ?? true,
  })
  // Calendario f2: sin seleccion = atiende todos los servicios
  const [serviciosSel, setServiciosSel] = useState<number[]>(
    doctor?.servicios?.map((s) => s.id) ?? [],
  )
  // Precio override por servicio (string para el input; vacio = precio del servicio)
  const [preciosSel, setPreciosSel] = useState<Record<number, string>>(
    () => Object.fromEntries((doctor?.preciosServicio ?? []).map((p) => [p.servicioId, String(Number(p.precio))])),
  )

  const { data: servicios = [] } = useQuery<Servicio[]>({
    queryKey: ['servicios', 'activos'],
    queryFn: () => api.get('/servicios').then((r) => r.data),
  })

  function toggleServicio(id: number) {
    setServiciosSel((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]))
  }

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        nombre: data.nombre,
        especialidad: data.especialidad || undefined,
        ...(data.comisionPct !== '' && { comisionPct: Number(data.comisionPct) }),
        colorAgenda: data.colorAgenda,
        ...(editando ? { activo: data.activo } : {}),
      }
      const res = editando
        ? await api.put(`/doctores/${doctor!.id}`, payload)
        : await api.post('/doctores', payload)
      const doctorId = editando ? doctor!.id : res.data.id
      // Solo enviar overrides de servicios marcados y con precio cargado
      const precios = serviciosSel
        .filter((id) => preciosSel[id] != null && preciosSel[id] !== '')
        .map((id) => ({ servicioId: id, precio: Number(preciosSel[id]) }))
      await api.put(`/doctores/${doctorId}/servicios`, { servicioIds: serviciosSel, precios })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['doctores'] }); onClose() },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader
          icon={UserRound}
          title={editando ? 'Editar doctor' : 'Nuevo doctor'}
          onClose={onClose}
        />
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nombre *</label>
            <input required value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className={inputUI} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Especialidad</label>
              <input value={form.especialidad}
                onChange={(e) => setForm((f) => ({ ...f, especialidad: e.target.value }))}
                className={inputUI} />
            </div>
            <div>
              <label htmlFor="doctor-comision" className="block text-sm font-medium text-foreground mb-1.5">
                Comisión (%)
              </label>
              <input id="doctor-comision" type="number" min={0} max={100} step="0.5"
                value={form.comisionPct}
                placeholder="Sin comisión"
                onChange={(e) => setForm((f) => ({ ...f, comisionPct: e.target.value }))}
                className={inputUI} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Color en agenda</label>
            <div className="flex gap-2">
              {COLORES.map((c) => (
                <button key={c} type="button"
                  onClick={() => setForm((f) => ({ ...f, colorAgenda: c }))}
                  aria-label={`Color ${c}`}
                  aria-pressed={form.colorAgenda === c}
                  className={cn(
                    'h-9 w-9 rounded-full border-2 cursor-pointer transition-transform duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                    form.colorAgenda === c ? 'border-foreground scale-110' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Servicios que atiende</label>
            {servicios.length === 0 ? (
              <p className="text-xs text-muted-foreground/70">Todavía no hay servicios en el catálogo</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto border rounded-md p-3">
                {servicios.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={serviciosSel.includes(s.id)}
                        onChange={() => toggleServicio(s.id)}
                        className="rounded shrink-0"
                      />
                      <span className="truncate">{s.nombre}</span>
                    </label>
                    {serviciosSel.includes(s.id) && (
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={preciosSel[s.id] ?? ''}
                        onChange={(e) => setPreciosSel((m) => ({ ...m, [s.id]: e.target.value }))}
                        placeholder={`$ ${Number(s.precioBase)}`}
                        title="Precio de este doctor para el servicio (vacío = precio del servicio)"
                        aria-label={`Precio de ${s.nombre} para este doctor`}
                        className="w-24 h-8 shrink-0 border border-input bg-card rounded-md px-2 text-sm text-foreground tabular-nums placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1.5">
              Sin selección, atiende todos los servicios (el portal público solo ofrece los marcados).
              El precio es opcional: vacío toma el precio del servicio; si lo cargás, la cita usa ese precio.
            </p>
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="rounded" />
              Doctor activo
            </label>
          )}
          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>Cancelar</button>
            <button type="submit" disabled={mutation.isPending} className={cn(btnPrimaryUI, 'flex-1')}>
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
