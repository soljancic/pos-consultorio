import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, UserPlus } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, textareaUI, btnPrimaryUI, btnOutlineUI, errorUI } from '../../lib/ui'
import { PAIS_DEFAULT } from '../../lib/paises'
import { SelectorPais } from '../../components/shared/SelectorPais'
import { ModalHeader } from '../../components/shared/ModalHeader'
import type { Paciente } from '@pos/types'

interface Props {
  paciente?: Partial<Paciente>
  onClose: () => void
}

export function PacienteModal({ paciente, onClose }: Props) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const editando = !!paciente?.id
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    nombre: paciente?.nombre ?? '',
    apellido: paciente?.apellido ?? '',
    dni: paciente?.dni ?? '',
    telefono: paciente?.telefono ?? '',
    pais: paciente?.pais ?? PAIS_DEFAULT,
    email: paciente?.email ?? '',
    fechaNacimiento: paciente?.fechaNacimiento
      ? new Date(paciente.fechaNacimiento).toISOString().split('T')[0]
      : '',
    sexo: paciente?.sexo ?? '',
    direccion: paciente?.direccion ?? '',
    notas: paciente?.notas ?? '',
    // E3 item 11: alerta de prepago (auto al 3er no-show, editable a mano)
    requierePrepago: paciente?.requierePrepago ?? false,
  })

  const mutation = useMutation({
    // Opcionales vacios viajan como undefined: @IsEmail/@IsISO8601/@IsIn
    // del backend rechazan el string vacio.
    mutationFn: (data: typeof form) => {
      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? undefined : v])
      )
      // El DTO de alta no acepta requierePrepago (solo se edita)
      if (!editando) delete payload.requierePrepago
      return editando
        ? api.put(`/pacientes/${paciente!.id}`, payload)
        : api.post('/pacientes', payload)
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pacientes'] })
      if (!editando) navigate(`/pacientes/${res.data.id}`)
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    mutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <ModalHeader
          icon={UserPlus}
          title={editando ? 'Editar paciente' : 'Nuevo paciente'}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nombre *</label>
              <input required value={form.nombre} onChange={(e) => set('nombre', e.target.value)} className={inputUI} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Apellido *</label>
              <input required value={form.apellido} onChange={(e) => set('apellido', e.target.value)} className={inputUI} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">CI</label>
              <input inputMode="numeric" value={form.dni} onChange={(e) => set('dni', e.target.value)} className={inputUI} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Fecha de nacimiento</label>
              <input type="date" value={form.fechaNacimiento} onChange={(e) => set('fechaNacimiento', e.target.value)} className={inputUI} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Teléfono</label>
              {/* El pais define el prefijo internacional de los WhatsApp */}
              <div className="flex gap-2">
                <SelectorPais value={form.pais} onChange={(codigo) => set('pais', codigo)} />
                <input type="tel" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} className={inputUI} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Sexo</label>
              <select value={form.sexo} onChange={(e) => set('sexo', e.target.value)} className={inputUI}>
                <option value="">-</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
                <option value="X">Otro</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputUI} />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Dirección</label>
            <input value={form.direccion} onChange={(e) => set('direccion', e.target.value)} className={inputUI} />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Notas</label>
            <textarea value={form.notas} onChange={(e) => set('notas', e.target.value)} rows={2}
              className={textareaUI} />
          </div>

          {editando && (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={form.requierePrepago}
                onChange={(e) => setForm((f) => ({ ...f, requierePrepago: e.target.checked }))}
                className="rounded"
              />
              Requiere prepago al agendar
              <span className="text-xs text-muted-foreground">(se marca solo al tercer no-show)</span>
            </label>
          )}

          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending} className={cn(btnPrimaryUI, 'flex-1')}>
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear paciente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
