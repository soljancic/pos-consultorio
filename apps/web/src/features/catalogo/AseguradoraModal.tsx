import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI } from '../../lib/ui'
import { toast } from '../../stores/toast.store'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'
import { FloatingTextarea } from '../../components/shared/FloatingTextarea'

interface Aseguradora {
  id?: number
  nombre: string
  contacto?: string | null
  telefono?: string | null
  email?: string | null
  observaciones?: string | null
  activa: boolean
}

interface Props {
  aseguradora?: Aseguradora | null
  onClose: () => void
}

export function AseguradoraModal({ aseguradora, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!aseguradora?.id
  const [form, setForm] = useState({
    nombre: aseguradora?.nombre ?? '',
    contacto: aseguradora?.contacto ?? '',
    telefono: aseguradora?.telefono ?? '',
    email: aseguradora?.email ?? '',
    observaciones: aseguradora?.observaciones ?? '',
    activa: aseguradora?.activa ?? true,
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = {
        nombre: data.nombre,
        contacto: data.contacto || undefined,
        telefono: data.telefono || undefined,
        email: data.email || undefined,
        observaciones: data.observaciones || undefined,
        ...(editando ? { activa: data.activa } : {}),
      }
      return editando
        ? api.put(`/aseguradoras/${aseguradora!.id}`, payload)
        : api.post('/aseguradoras', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aseguradoras'] })
      onClose()
    },
    onError: (err: any) => toast.fromError(err, 'Error al guardar'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader
          icon={ShieldCheck}
          title={editando ? 'Editar aseguradora' : 'Nueva aseguradora'}
          onClose={onClose}
        />
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(form) }}
          className="p-6 sm:p-7 space-y-5"
        >
          {/* Toggle activo — solo en edición, arriba para visibilidad inmediata */}
          {editando && (
            <button
              type="button"
              role="switch"
              aria-checked={form.activa}
              onClick={() => setForm((f) => ({ ...f, activa: !f.activa }))}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60',
                form.activa
                  ? 'border-input bg-card hover:bg-muted/40'
                  : 'border-input bg-muted/40 hover:bg-muted/60',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      form.activa ? 'bg-emerald-500' : 'bg-muted-foreground/50',
                    )}
                  />
                  Aseguradora {form.activa ? 'activa' : 'inactiva'}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {form.activa
                    ? 'Disponible para asignar a pacientes y cobros.'
                    : 'Inactiva: no aparece en nuevos registros; los datos se conservan.'}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
                  form.activa ? 'bg-primary' : 'bg-muted-foreground/30',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-200',
                    form.activa ? 'translate-x-[22px]' : 'translate-x-0.5',
                  )}
                />
              </span>
            </button>
          )}

          <FloatingInput
            id="aseg-nombre"
            label="Nombre"
            required
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          />

          <div className="grid grid-cols-2 gap-4">
            <FloatingInput
              id="aseg-contacto"
              label="Contacto"
              value={form.contacto}
              onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))}
            />
            <FloatingInput
              id="aseg-telefono"
              label="Teléfono"
              type="tel"
              value={form.telefono}
              onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
            />
          </div>

          <FloatingInput
            id="aseg-email"
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />

          <FloatingTextarea
            id="aseg-observaciones"
            label="Observaciones"
            rows={3}
            value={form.observaciones}
            onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
          />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending} className={cn(btnPrimaryUI, 'flex-1')}>
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
