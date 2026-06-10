import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { api } from '../../lib/api-client'
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
    whatsapp: paciente?.whatsapp ?? '',
    email: paciente?.email ?? '',
    fechaNacimiento: paciente?.fechaNacimiento
      ? new Date(paciente.fechaNacimiento).toISOString().split('T')[0]
      : '',
    sexo: paciente?.sexo ?? '',
    direccion: paciente?.direccion ?? '',
    notas: paciente?.notas ?? '',
  })

  const mutation = useMutation({
    // Opcionales vacios viajan como undefined: @IsEmail/@IsISO8601/@IsIn
    // del backend rechazan el string vacio.
    mutationFn: (data: typeof form) => {
      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? undefined : v])
      )
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

  const inputClass =
    'w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card">
          <h2 className="text-lg font-semibold text-foreground">
            {editando ? 'Editar paciente' : 'Nuevo paciente'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Nombre *</label>
              <input required value={form.nombre} onChange={(e) => set('nombre', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Apellido *</label>
              <input required value={form.apellido} onChange={(e) => set('apellido', e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">DNI</label>
              <input value={form.dni} onChange={(e) => set('dni', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Fecha de nacimiento</label>
              <input type="date" value={form.fechaNacimiento} onChange={(e) => set('fechaNacimiento', e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Telefono</label>
              <input value={form.telefono} onChange={(e) => set('telefono', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">WhatsApp</label>
              <input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Sexo</label>
              <select value={form.sexo} onChange={(e) => set('sexo', e.target.value)} className={inputClass}>
                <option value="">-</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
                <option value="X">Otro</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Direccion</label>
            <input value={form.direccion} onChange={(e) => set('direccion', e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notas</label>
            <textarea value={form.notas} onChange={(e) => set('notas', e.target.value)} rows={2}
              className={`${inputClass} resize-none`} />
          </div>

          {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-md text-sm text-foreground hover:bg-muted/60">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary/90 disabled:opacity-60">
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear paciente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
