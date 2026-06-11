import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertCircle } from 'lucide-react'
import { EstadoCita, type Cita } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatHora, cn } from '../../lib/utils'
import { inputUI, textareaUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Atención</h2>
            <p className="text-sm text-muted-foreground">
              {cita.paciente?.apellido}, {cita.paciente?.nombre} &bull; {cita.servicio?.nombre} &bull;{' '}
              {formatHora(cita.fechaHora)}
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

        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground">Cargando...</div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Motivo de consulta</label>
              <input value={form.motivo} onChange={(e) => set('motivo', e.target.value)} className={inputUI} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Diagnostico</label>
              <input value={form.diagnostico} onChange={(e) => set('diagnostico', e.target.value)} className={inputUI} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Tratamiento indicado</label>
              <input value={form.tratamiento} onChange={(e) => set('tratamiento', e.target.value)} className={inputUI} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Evolucion / notas</label>
              <textarea rows={3} value={form.evolucion} onChange={(e) => set('evolucion', e.target.value)}
                className={textareaUI} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Próximo control</label>
              <input type="date" value={form.proximoControl} onChange={(e) => set('proximoControl', e.target.value)}
                className={inputUI} />
            </div>

            {error && (
              <p role="alert" className={errorUI}>
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" onClick={onClose} className={btnOutlineUI}>
                Cancelar
              </button>
              <button type="button" disabled={guardar.isPending}
                onClick={() => { setError(''); guardar.mutate({ marcarAtendida: false }) }}
                className="inline-flex items-center justify-center flex-1 h-10 px-4 border border-primary text-primary rounded-md text-sm font-medium cursor-pointer hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150">
                Guardar
              </button>
              {puedeMarcarAtendida && (
                <button type="button" disabled={guardar.isPending}
                  onClick={() => { setError(''); guardar.mutate({ marcarAtendida: true }) }}
                  className={cn(btnPrimaryUI, 'flex-1')}>
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
