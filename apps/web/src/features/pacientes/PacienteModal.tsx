import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, UserPlus, User, IdCard, Cake, PersonStanding, Mail, MapPin, FileText, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI } from '../../lib/ui'
import { toast } from '../../stores/toast.store'
import { PAIS_DEFAULT } from '../../lib/paises'
import { SelectorPais } from '../../components/shared/SelectorPais'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'
import { FloatingSelect } from '../../components/shared/FloatingSelect'
import { FloatingTextarea } from '../../components/shared/FloatingTextarea'
import { useAuthStore } from '../../stores/auth.store'
import type { Paciente } from '@pos/types'

interface Props {
  paciente?: Partial<Paciente>
  onClose: () => void
  // Si se pasa, al CREAR un paciente se llama con el nuevo en vez de navegar a
  // su ficha (sirve para crear rapido desde otro modal, ej. Nueva cita).
  onCreated?: (paciente: Paciente) => void
}

export function PacienteModal({ paciente, onClose, onCreated }: Props) {
  const qc = useQueryClient()
  const editando = !!paciente?.id
  const trabajaConAseguradoras = useAuthStore((s) => s.user?.trabajaConAseguradoras)

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
    // F2: seguro
    tieneSeguro: paciente?.tieneSeguro ?? false,
    aseguradoraId: String(paciente?.aseguradora?.id ?? paciente?.aseguradoraId ?? ''),
    categoriaSeguroId: String(paciente?.categoriaSeguro?.id ?? paciente?.categoriaSeguroId ?? ''),
    codigoSeguro: paciente?.codigoSeguro ?? '',
  })

  const mutation = useMutation({
    // Opcionales vacios viajan como undefined: @IsEmail/@IsISO8601/@IsIn
    // del backend rechazan el string vacio.
    mutationFn: (data: typeof form) => {
      // Paso 1: mapeo generico '' → undefined para los campos de texto
      const { tieneSeguro, aseguradoraId, categoriaSeguroId, codigoSeguro, ...rest } = data
      const payload: Record<string, unknown> = Object.fromEntries(
        Object.entries(rest).map(([k, v]) => [k, v === '' ? undefined : v])
      )
      // El DTO de alta no acepta requierePrepago (solo se edita)
      if (!editando) delete payload.requierePrepago
      // Paso 2: campos de seguro — manejo explicito para evitar que Number('')
      // produzca 0 y para null-out cuando tieneSeguro es false.
      if (trabajaConAseguradoras) {
        if (tieneSeguro) {
          payload.tieneSeguro = true
          payload.aseguradoraId = aseguradoraId !== '' ? Number(aseguradoraId) : undefined
          payload.categoriaSeguroId = categoriaSeguroId !== '' ? Number(categoriaSeguroId) : undefined
          payload.codigoSeguro = codigoSeguro !== '' ? codigoSeguro : undefined
        } else {
          payload.tieneSeguro = false
          payload.aseguradoraId = undefined
          payload.categoriaSeguroId = undefined
          payload.codigoSeguro = undefined
        }
      }
      return editando
        ? api.put(`/pacientes/${paciente!.id}`, payload)
        : api.post('/pacientes', payload)
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pacientes'] })
      // Al crear no abrimos el Kardex: la grilla ya se refresca por el invalidate.
      // Si hay onCreated (alta rapida desde otro modal), el llamador se queda
      // con el paciente nuevo.
      if (!editando && onCreated) onCreated(res.data)
      onClose()
    },
    onError: (err: any) => {
      toast.fromError(err, 'Error al guardar')
    },
  })

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  // F2: datos para los selects de seguro (solo se consultan cuando el consultorio trabaja con aseguradoras)
  const { data: aseguradoras = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ['aseguradoras', 'activas'],
    queryFn: () => api.get('/aseguradoras/activas').then((r) => r.data),
    enabled: !!trabajaConAseguradoras,
  })

  const { data: categoriasSeguro = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ['categorias-seguro', form.aseguradoraId, 'activas'],
    queryFn: () =>
      api
        .get(`/categorias-seguro?aseguradoraId=${form.aseguradoraId}&soloActivas=true`)
        .then((r) => r.data),
    enabled: !!trabajaConAseguradoras && form.aseguradoraId !== '',
  })

  // Avisos (no bloqueantes) de CI/telefono/correo ya usados por otro paciente.
  // Solo al crear. Se consulta con un pequeno debounce para no pegarle al backend
  // en cada tecla. El nombre duplicado lo bloquea el backend (no es un aviso).
  const [coincQuery, setCoincQuery] = useState({ dni: '', telefono: '', email: '' })
  useEffect(() => {
    const t = setTimeout(
      () => setCoincQuery({ dni: form.dni, telefono: form.telefono, email: form.email }),
      350,
    )
    return () => clearTimeout(t)
  }, [form.dni, form.telefono, form.email])

  const { data: coincidencias } = useQuery<{ dni: boolean; telefono: boolean; email: boolean }>({
    queryKey: ['pacientes-coincidencias', coincQuery, paciente?.id],
    queryFn: () => {
      const p = new URLSearchParams()
      if (coincQuery.dni) p.set('dni', coincQuery.dni)
      if (coincQuery.telefono) p.set('telefono', coincQuery.telefono)
      if (coincQuery.email) p.set('email', coincQuery.email)
      // Al editar, no avisar de coincidencia con uno mismo.
      if (editando && paciente?.id) p.set('excluirId', String(paciente.id))
      return api.get(`/pacientes/coincidencias?${p.toString()}`).then((r) => r.data)
    },
    enabled: !!(coincQuery.dni || coincQuery.telefono || coincQuery.email),
  })

  const avisos: string[] = []
  if (coincidencias?.dni) avisos.push('ese CI')
  if (coincidencias?.telefono) avisos.push('ese teléfono')
  if (coincidencias?.email) avisos.push('ese correo')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <ModalHeader
          icon={UserPlus}
          title={editando ? 'Editar paciente' : 'Nuevo paciente'}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
          {/* Aviso no bloqueante: el CI/telefono/correo ya existe en otro paciente
              (puede ser un familiar). El nombre+apellido duplicado SI bloquea (backend). */}
          {avisos.length > 0 && (
            <p
              role="status"
              className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Ya hay otro paciente con {avisos.join(' y ')}. Puede ser un familiar (ej. comparten teléfono).</span>
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FloatingInput
              label="Nombre"
              Icon={User}
              required
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
            />
            <FloatingInput
              label="Apellido"
              Icon={User}
              required
              value={form.apellido}
              onChange={(e) => set('apellido', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FloatingInput
              label="CI"
              Icon={IdCard}
              inputMode="numeric"
              value={form.dni}
              onChange={(e) => set('dni', e.target.value)}
            />
            <FloatingInput
              label="Fecha de nacimiento"
              Icon={Cake}
              type="date"
              alwaysFloat
              value={form.fechaNacimiento}
              onChange={(e) => set('fechaNacimiento', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Teléfono: selector de país + input unidos como un control segmentado.
                El país define el prefijo internacional de los WhatsApp. */}
            <div className="flex items-stretch">
              <SelectorPais
                value={form.pais}
                onChange={(codigo) => set('pais', codigo)}
                buttonClassName="h-14 rounded-l-xl rounded-r-none border-r-0"
              />
              <div className="relative flex-1">
                <FloatingInput
                  label="Teléfono"
                  type="tel"
                  value={form.telefono}
                  onChange={(e) => set('telefono', e.target.value)}
                  className="rounded-l-none"
                />
              </div>
            </div>
            <FloatingSelect
              label="Sexo"
              Icon={PersonStanding}
              value={form.sexo}
              onChange={(e) => set('sexo', e.target.value)}
            >
              <option value="">Sin especificar</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
              <option value="X">Otro</option>
            </FloatingSelect>
          </div>

          <FloatingInput
            label="Email"
            Icon={Mail}
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />

          <FloatingInput
            label="Dirección"
            Icon={MapPin}
            value={form.direccion}
            onChange={(e) => set('direccion', e.target.value)}
          />

          <FloatingTextarea
            label="Notas"
            Icon={FileText}
            value={form.notas}
            onChange={(e) => set('notas', e.target.value)}
            rows={2}
          />

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

          {/* Sección de seguro: solo visible si el consultorio trabaja con aseguradoras */}
          {trabajaConAseguradoras && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pt-1">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium text-foreground">Seguro médico</span>
              </div>

              {/* Toggle tieneSeguro */}
              <button
                type="button"
                role="switch"
                aria-checked={form.tieneSeguro}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    tieneSeguro: !f.tieneSeguro,
                    // Al apagar, limpiar los campos dependientes
                    ...(!f.tieneSeguro ? {} : { aseguradoraId: '', categoriaSeguroId: '', codigoSeguro: '' }),
                  }))
                }
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60',
                  form.tieneSeguro
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
                        form.tieneSeguro ? 'bg-emerald-500' : 'bg-muted-foreground/50',
                      )}
                    />
                    {form.tieneSeguro ? 'Tiene seguro médico' : 'Sin seguro médico'}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {form.tieneSeguro
                      ? 'Completá aseguradora y plan para asociar las coberturas.'
                      : 'El paciente no tiene seguro registrado.'}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
                    form.tieneSeguro ? 'bg-primary' : 'bg-muted-foreground/30',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-200',
                      form.tieneSeguro ? 'translate-x-[22px]' : 'translate-x-0.5',
                    )}
                  />
                </span>
              </button>

              {/* Campos visibles solo cuando tieneSeguro es true */}
              {form.tieneSeguro && (
                <div className="space-y-4">
                  <FloatingSelect
                    label="Aseguradora"
                    required
                    value={form.aseguradoraId}
                    onChange={(e) => {
                      const val = e.target.value
                      setForm((f) => ({ ...f, aseguradoraId: val, categoriaSeguroId: '' }))
                    }}
                  >
                    <option value="">Seleccioná una aseguradora</option>
                    {aseguradoras.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.nombre}
                      </option>
                    ))}
                  </FloatingSelect>

                  <FloatingSelect
                    label="Categoría / Plan"
                    required
                    value={form.categoriaSeguroId}
                    onChange={(e) => set('categoriaSeguroId', e.target.value)}
                    disabled={form.aseguradoraId === ''}
                  >
                    <option value="">
                      {form.aseguradoraId === ''
                        ? 'Primero elegí una aseguradora'
                        : 'Seleccioná un plan'}
                    </option>
                    {categoriasSeguro.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.nombre}
                      </option>
                    ))}
                  </FloatingSelect>

                  <FloatingInput
                    label="Código de asegurado"
                    Icon={IdCard}
                    value={form.codigoSeguro}
                    onChange={(e) => set('codigoSeguro', e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
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
