import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertCircle, Paperclip, Trash2, FileText, Image as ImageIcon } from 'lucide-react'
import { EstadoCita, type Cita } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatHora, cn } from '../../lib/utils'
import { abrirAdjunto, formatTamano, type AdjuntoMeta } from '../../lib/adjuntos'
import { inputUI, textareaUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'
import { useAuthStore } from '../../stores/auth.store'
import { ConfirmarModal } from '../../components/shared/ConfirmarModal'

interface Props {
  cita: Cita
  onClose: () => void
}

export function AtencionModal({ cita, onClose }: Props) {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [error, setError] = useState('')
  // Guard duro en backend (E2-M4): solo ADMIN o el doctor de la cita escriben;
  // el resto consulta en modo solo lectura
  const puedeEditar = user?.rol === 'ADMIN' || user?.rol === 'DOCTOR'
  const puedeMarcarAtendida = puedeEditar && cita.estado === EstadoCita.EN_ATENCION

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

  // Adjuntos (E2-M4 f2): solo cuando la atencion ya existe
  const adjuntos: AdjuntoMeta[] = atencion?.adjuntos ?? []
  const fileRef = useRef<HTMLInputElement>(null)
  const [adjuntoABorrar, setAdjuntoABorrar] = useState<number | null>(null)

  const subirAdjunto = useMutation({
    mutationFn: async (archivo: File) => {
      const fd = new FormData()
      fd.append('archivo', archivo)
      await api.post(`/atenciones/cita/${cita.id}/adjuntos`, fd)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['atencion', cita.id] }),
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al subir el adjunto')
    },
  })

  const borrarAdjunto = useMutation({
    mutationFn: (indice: number) => api.delete(`/atenciones/cita/${cita.id}/adjuntos/${indice}`),
    onSuccess: () => {
      setAdjuntoABorrar(null)
      qc.invalidateQueries({ queryKey: ['atencion', cita.id] })
    },
    onError: (err: any) => {
      setAdjuntoABorrar(null)
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al eliminar el adjunto')
    },
  })

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
              <input value={form.motivo} disabled={!puedeEditar} onChange={(e) => set('motivo', e.target.value)} className={inputUI} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Diagnóstico</label>
              <input value={form.diagnostico} disabled={!puedeEditar} onChange={(e) => set('diagnostico', e.target.value)} className={inputUI} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Tratamiento indicado</label>
              <input value={form.tratamiento} disabled={!puedeEditar} onChange={(e) => set('tratamiento', e.target.value)} className={inputUI} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Evolución / notas</label>
              <textarea rows={3} value={form.evolucion} disabled={!puedeEditar} onChange={(e) => set('evolucion', e.target.value)}
                className={textareaUI} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Próximo control</label>
              <input type="date" value={form.proximoControl} disabled={!puedeEditar} onChange={(e) => set('proximoControl', e.target.value)}
                className={inputUI} />
            </div>

            {/* Adjuntos: requieren atencion guardada */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="block text-sm font-medium text-foreground">Adjuntos</span>
                {puedeEditar && atencion && (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) { setError(''); subirAdjunto.mutate(f) }
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      disabled={subirAdjunto.isPending}
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded disabled:opacity-60 transition-colors duration-150"
                    >
                      <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                      {subirAdjunto.isPending ? 'Subiendo...' : 'Adjuntar archivo'}
                    </button>
                  </>
                )}
              </div>
              {adjuntos.length === 0 ? (
                <p className="text-xs text-muted-foreground/70">
                  {atencion ? 'Sin adjuntos' : 'Guarde la atención para poder adjuntar archivos'}
                </p>
              ) : (
                <ul className="space-y-1">
                  {adjuntos.map((a, i) => (
                    <li key={`${a.archivo}-${i}`} className="flex items-center gap-2 text-sm border rounded-md px-2.5 py-1.5">
                      {a.tipo === 'application/pdf'
                        ? <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                        : <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />}
                      <button
                        type="button"
                        onClick={() => abrirAdjunto(cita.id, i)}
                        className="flex-1 min-w-0 text-left truncate text-primary cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded"
                        title={a.nombre}
                      >
                        {a.nombre}
                      </button>
                      <span className="text-xs text-muted-foreground/70 tabular-nums shrink-0">{formatTamano(a.tamano)}</span>
                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={() => setAdjuntoABorrar(i)}
                          aria-label={`Eliminar adjunto ${a.nombre}`}
                          className="inline-flex items-center justify-center h-7 w-7 rounded text-destructive cursor-pointer hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150 shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <p role="alert" className={errorUI}>
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" onClick={onClose} className={btnOutlineUI}>
                {puedeEditar ? 'Cancelar' : 'Cerrar'}
              </button>
              {puedeEditar && (
                <button type="button" disabled={guardar.isPending}
                  onClick={() => { setError(''); guardar.mutate({ marcarAtendida: false }) }}
                  className="inline-flex items-center justify-center flex-1 h-10 px-4 border border-primary text-primary rounded-md text-sm font-medium cursor-pointer hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150">
                  Guardar
                </button>
              )}
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

      {adjuntoABorrar !== null && (
        <ConfirmarModal
          titulo="Eliminar adjunto"
          mensaje={`Se eliminará "${adjuntos[adjuntoABorrar]?.nombre}" de la historia clínica. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          pendiente={borrarAdjunto.isPending}
          onConfirm={() => borrarAdjunto.mutate(adjuntoABorrar)}
          onClose={() => setAdjuntoABorrar(null)}
        />
      )}
    </div>
  )
}
