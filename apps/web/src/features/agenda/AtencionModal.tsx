import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { EstadoCita, type Cita } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatHora } from '../../lib/utils'

interface Props {
  cita: Cita
  onClose: () => void
}

export function AtencionModal({ cita, onClose }: Props) {
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const puedeMarcarAtendida = cita.estado === EstadoCita.EN_ATENCION

  const { data: atencion, isLoading } = useQuery({
    queryKey: ['atencion', cita.id],
    queryFn: () =>
      api.get(`/atenciones/cita/${cita.id}`).then((r) => r.data).catch((e) => {
        if (e.response?.status === 404) return null
        throw e
      }),
  })

  const [form, setForm] = useState({
    motivo: '', diagnostico: '', tratamiento: '', evolucion: '', proximoControl: '',
  })

  useEffect(() => {
    if (atencion) {
      setForm({
        motivo: atencion.motivo ?? '',
        diagnostico: atencion.diagnostico ?? '',
        tratamiento: atencion.tratamiento ?? '',
        evolucion: atencion.evolucion ?? '',
        proximoControl: atencion.proximoControl ? atencion.proximoControl.split('T')[0] : '',
      })
    }
  }, [atencion])

  const guardar = useMutation({
    mutationFn: async ({ marcarAtendida }: { marcarAtendida: boolean }) => {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v === '' ? undefined : v])
      )
      await api.put(`/atenciones/cita/${cita.id}`, payload)
      if (marcarAtendida) {
        await api.put(`/citas/${cita.id}/estado`, { estado: EstadoCita.ATENDIDA })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['atencion', cita.id] })
      qc.invalidateQueries({ queryKey: ['citas'] })
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar')
    },
  })

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const inputClass =
    'w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Atencion</h2>
            <p className="text-sm text-muted-foreground">
              {cita.paciente?.apellido}, {cita.paciente?.nombre} &bull; {cita.servicio?.nombre} &bull;{' '}
              {formatHora(cita.fechaHora)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground">Cargando...</div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Motivo de consulta</label>
              <input value={form.motivo} onChange={(e) => set('motivo', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Diagnostico</label>
              <input value={form.diagnostico} onChange={(e) => set('diagnostico', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Tratamiento indicado</label>
              <input value={form.tratamiento} onChange={(e) => set('tratamiento', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Evolucion / notas</label>
              <textarea rows={3} value={form.evolucion} onChange={(e) => set('evolucion', e.target.value)}
                className={`${inputClass} resize-none`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Proximo control</label>
              <input type="date" value={form.proximoControl} onChange={(e) => set('proximoControl', e.target.value)}
                className={inputClass} />
            </div>

            {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 border rounded-md text-sm text-foreground hover:bg-muted/60">
                Cancelar
              </button>
              <button type="button" disabled={guardar.isPending}
                onClick={() => { setError(''); guardar.mutate({ marcarAtendida: false }) }}
                className="flex-1 px-4 py-2 border border-primary text-primary rounded-md text-sm hover:bg-primary/10 disabled:opacity-60">
                Guardar
              </button>
              {puedeMarcarAtendida && (
                <button type="button" disabled={guardar.isPending}
                  onClick={() => { setError(''); guardar.mutate({ marcarAtendida: true }) }}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary/90 disabled:opacity-60">
                  {guardar.isPending ? 'Guardando...' : 'Guardar y marcar Atendida'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
