import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Settings, Check } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn, publicBaseUrl, setMonedaActual } from '../../lib/utils'
import { inputUI, textareaUI, btnPrimaryUI, btnIconUI, cardUI, chipIconUI } from '../../lib/ui'
import { PAIS_DEFAULT } from '../../lib/paises'
import { SelectorPais } from '../../components/shared/SelectorPais'
import { UsuarioModal } from './UsuarioModal'
import { CampanaHeader } from '../notificaciones/CampanaHeader'
import { useAuthStore } from '../../stores/auth.store'

const MONEDAS = ['ARS', 'USD', 'UYU', 'CLP', 'PEN', 'COP', 'MXN', 'BOB', 'BRL']
const TIMEZONES = [
  'America/Argentina/Buenos_Aires',
  'America/La_Paz',
  'America/Sao_Paulo',
  'America/Montevideo',
  'America/Santiago',
  'America/Lima',
  'America/Bogota',
  'America/Mexico_City',
  'America/New_York',
]
const ROL_LABEL: Record<string, string> = {
  ADMIN: 'Admin', SECRETARIA: 'Secretaria', DOCTOR: 'Doctor', CAJA: 'Caja',
}

type Consultorio = {
  id: number; nombre: string; logoUrl: string | null
  telefono: string | null; direccion: string | null
  ubicacionUrl: string | null; pais: string | null
  moneda: string; timezone: string
  slug: string | null; portalActivo: boolean
  msjRecordatorio: string | null; msjDeuda: string | null; msjContacto: string | null
  qrUrl: string | null
  emailCierreCaja: string | null
  trabajaConAseguradoras: boolean
  vendeProductos: boolean
}
type Usuario = { id: number; nombre: string; email: string; rol: string; activo: boolean }

export function ConfiguracionPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const [tab, setTab] = useState<'usuarios' | 'info' | 'config'>('usuarios')
  const [usuarioEdit, setUsuarioEdit] = useState<Usuario | null>(null)
  const [usuarioModal, setUsuarioModal] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [consForm, setConsForm] = useState({
    nombre: '', logoUrl: '', telefono: '', direccion: '',
    ubicacionUrl: '', pais: PAIS_DEFAULT,
    moneda: 'ARS', timezone: 'America/Argentina/Buenos_Aires',
    slug: '', portalActivo: false,
    msjRecordatorio: '', msjDeuda: '', msjContacto: '',
    emailCierreCaja: '',
    trabajaConAseguradoras: false,
    vendeProductos: false,
  })
  const [linkCopiado, setLinkCopiado] = useState(false)

  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/usuarios').then((r) => r.data),
  })

  const { data: consultorio } = useQuery<Consultorio>({
    queryKey: ['consultorio'],
    queryFn: () => api.get('/consultorio').then((r) => r.data),
  })

  useEffect(() => {
    if (consultorio) {
      setConsForm({
        nombre: consultorio.nombre,
        logoUrl: consultorio.logoUrl ?? '',
        telefono: consultorio.telefono ?? '',
        direccion: consultorio.direccion ?? '',
        ubicacionUrl: consultorio.ubicacionUrl ?? '',
        pais: consultorio.pais ?? PAIS_DEFAULT,
        moneda: consultorio.moneda,
        timezone: consultorio.timezone,
        slug: consultorio.slug ?? '',
        portalActivo: consultorio.portalActivo ?? false,
        msjRecordatorio: consultorio.msjRecordatorio ?? '',
        msjDeuda: consultorio.msjDeuda ?? '',
        msjContacto: consultorio.msjContacto ?? '',
        emailCierreCaja: consultorio.emailCierreCaja ?? '',
        trabajaConAseguradoras: consultorio.trabajaConAseguradoras ?? false,
        vendeProductos: consultorio.vendeProductos ?? false,
      })
    }
  }, [consultorio])

  // QR de pagos y logo: la imagen sube a Cloudinary via el backend (las
  // claves no viven en el navegador) y la URL queda guardada en el consultorio
  const qrFileRef = useRef<HTMLInputElement>(null)
  const logoFileRef = useRef<HTMLInputElement>(null)
  const subirQr = useMutation({
    mutationFn: async (archivo: File) => {
      const fd = new FormData()
      fd.append('archivo', archivo)
      await api.post('/consultorio/qr', fd)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consultorio'] }),
  })
  const subirLogo = useMutation({
    mutationFn: async (archivo: File) => {
      const fd = new FormData()
      fd.append('archivo', archivo)
      await api.post('/consultorio/logo', fd)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consultorio'] }),
  })

  const updateConsultorio = useMutation({
    mutationFn: (data: typeof consForm) =>
      api.put('/consultorio', {
        ...data,
        logoUrl: data.logoUrl || undefined,
        telefono: data.telefono || undefined,
        direccion: data.direccion || undefined,
        // '' viaja tal cual para poder limpiar la ubicacion
        ubicacionUrl: data.ubicacionUrl,
        pais: data.pais || undefined,
        slug: data.slug || undefined,
        // El string vacio viaja tal cual: significa "volver al default"
        msjRecordatorio: data.msjRecordatorio,
        msjDeuda: data.msjDeuda,
        msjContacto: data.msjContacto,
        // El backend acepta '' para limpiar el campo (ValidateIf); con email
        // valido envia el resumen, vacio lo desactiva
        emailCierreCaja: data.emailCierreCaja,
        trabajaConAseguradoras: data.trabajaConAseguradoras,
        vendeProductos: data.vendeProductos,
      }).then((r) => r.data),
    onSuccess: (cons) => {
      qc.invalidateQueries({ queryKey: ['consultorio'] })
      // Aplicar la moneda al instante (sin esperar el refetch) para que los
      // simbolos del front se actualicen apenas se guarda.
      setMonedaActual(consForm.moneda)
      // Propagar el flag al auth store (no hay /auth/me): el admin lo ve sin re-login
      if (user) setUser({ ...user, trabajaConAseguradoras: cons.trabajaConAseguradoras, vendeProductos: cons.vendeProductos })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    },
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <span className={chipIconUI}>
              <Settings className="h-4 w-4" aria-hidden="true" />
            </span>
            Configuración
          </h1>
          <div className="flex flex-wrap gap-1" role="tablist">
            {([['usuarios', 'Usuarios'], ['info', 'Consultorio Info'], ['config', 'Config']] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                role="tab"
                aria-selected={tab === t}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                  tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <CampanaHeader />
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 max-w-3xl mx-auto w-full">
        {tab === 'usuarios' && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setUsuarioEdit(null); setUsuarioModal(true) }}
                className={cn(btnPrimaryUI, 'h-9 px-3')}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nuevo usuario
              </button>
            </div>
            <div className={cn(cardUI, 'overflow-x-auto')}>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rol</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
                      <td className="px-4 py-3 font-medium">{u.nombre}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-muted text-foreground px-2 py-0.5 rounded-full font-medium">
                          {ROL_LABEL[u.rol] ?? u.rol}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.activo ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setUsuarioEdit(u); setUsuarioModal(true) }}
                          aria-label={`Editar usuario ${u.nombre}`}
                          className={cn(btnIconUI, 'text-muted-foreground/70 hover:text-foreground hover:bg-muted')}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'info' && (
          <div className={cn(cardUI, 'p-6 space-y-4')}>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nombre del consultorio</label>
              <input value={consForm.nombre} onChange={(e) => setConsForm((f) => ({ ...f, nombre: e.target.value }))}
                className={inputUI} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-foreground">Logo</span>
              {consultorio?.logoUrl && (
                <img src={consultorio.logoUrl} alt="Logo actual"
                  className="h-16 w-16 rounded-md border object-contain bg-white" />
              )}
              <div>
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) subirLogo.mutate(f)
                    e.target.value = ''
                  }}
                />
                <button type="button" disabled={subirLogo.isPending}
                  onClick={() => logoFileRef.current?.click()}
                  className={btnPrimaryUI}>
                  {subirLogo.isPending ? 'Subiendo...' : consultorio?.logoUrl ? 'Reemplazar logo' : 'Subir logo'}
                </button>
              </div>
              {subirLogo.isError && (
                <p role="alert" className="w-full text-xs text-destructive">
                  {(subirLogo.error as any)?.response?.data?.message ?? 'No se pudo subir la imagen'}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Teléfono</label>
              <div className="flex items-stretch">
                <SelectorPais
                  value={consForm.pais}
                  onChange={(codigo) => setConsForm((f) => ({ ...f, pais: codigo }))}
                  buttonClassName="h-11 rounded-l-lg rounded-r-none border-r-0"
                />
                <input type="tel" value={consForm.telefono} onChange={(e) => setConsForm((f) => ({ ...f, telefono: e.target.value }))}
                  className={cn(inputUI, 'rounded-l-none')} />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">El país define el prefijo internacional del WhatsApp del consultorio.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Dirección</label>
              <input value={consForm.direccion} onChange={(e) => setConsForm((f) => ({ ...f, direccion: e.target.value }))}
                className={inputUI} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Ubicación en Google Maps</label>
              <input type="url" inputMode="url" placeholder="https://maps.app.goo.gl/..."
                value={consForm.ubicacionUrl} onChange={(e) => setConsForm((f) => ({ ...f, ubicacionUrl: e.target.value }))}
                className={inputUI} />
              <p className="text-xs text-muted-foreground mt-1.5">
                Pegá el enlace de tu consultorio en Google Maps. Aparece como “Ver en Maps” en el correo de confirmación y en el WhatsApp de la cita.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Moneda</label>
                <select value={consForm.moneda} onChange={(e) => setConsForm((f) => ({ ...f, moneda: e.target.value }))}
                  className={inputUI}>
                  {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Timezone</label>
                <select value={consForm.timezone} onChange={(e) => setConsForm((f) => ({ ...f, timezone: e.target.value }))}
                  className={inputUI}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="cons-email-cierre" className="block text-sm font-medium text-foreground mb-1.5">
                Email para cierres de caja <span className="text-muted-foreground/70 font-normal">(opcional)</span>
              </label>
              <input id="cons-email-cierre" type="email" value={consForm.emailCierreCaja}
                placeholder="administracion@consultorio.com"
                onChange={(e) => setConsForm((f) => ({ ...f, emailCierreCaja: e.target.value }))}
                className={inputUI} />
              <p className="text-xs text-muted-foreground mt-1">
                Cada cierre de caja envía a esta dirección un resumen del turno (ingresos, gastos y arqueo).
              </p>
            </div>
          </div>
        )}

        {tab === 'config' && (
          <div className={cn(cardUI, 'p-6 space-y-4')}>
            {/* Portal publico de reservas (E2.5b) */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Portal de reservas en línea</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cons-slug" className="block text-sm font-medium text-foreground mb-1.5">
                    Enlace (slug)
                  </label>
                  <input id="cons-slug" value={consForm.slug}
                    placeholder="mi-consultorio"
                    onChange={(e) => setConsForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
                    className={inputUI} />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Minúsculas, números y guiones (3-40).
                  </p>
                </div>
                <div className="flex items-start pt-7">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
                    <input type="checkbox" checked={consForm.portalActivo}
                      onChange={(e) => setConsForm((f) => ({ ...f, portalActivo: e.target.checked }))}
                      className="rounded" />
                    Portal activo
                  </label>
                </div>
              </div>
              {consultorio?.slug && consultorio?.portalActivo && (
                <div className="flex flex-wrap items-center gap-2 text-sm bg-muted/50 rounded-md px-3 py-2">
                  <span className="text-muted-foreground truncate">
                    {`${publicBaseUrl()}/reservar/${consultorio.slug}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${publicBaseUrl()}/reservar/${consultorio.slug}`)
                      setLinkCopiado(true)
                      setTimeout(() => setLinkCopiado(false), 2000)
                    }}
                    className="text-xs font-medium text-primary cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150"
                  >
                    {linkCopiado ? 'Copiado ✓' : 'Copiar enlace'}
                  </button>
                </div>
              )}
            </div>

            {/* QR de pagos (Cloudinary) */}
            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">QR de pagos</h3>
              <p className="text-xs text-muted-foreground">
                La imagen del QR de tu banco/billetera. Los pacientes la ven y descargan en la página
                pública de pago, y el recordatorio de deuda incluye el link automáticamente.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {consultorio?.qrUrl && (
                  <img src={consultorio.qrUrl} alt="QR de pagos actual"
                    className="h-16 w-16 rounded-md border object-contain bg-white" />
                )}
                <div>
                  <input
                    ref={qrFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) subirQr.mutate(f)
                      e.target.value = ''
                    }}
                  />
                  <button type="button" disabled={subirQr.isPending}
                    onClick={() => qrFileRef.current?.click()}
                    className={btnPrimaryUI}>
                    {subirQr.isPending ? 'Subiendo...' : consultorio?.qrUrl ? 'Reemplazar QR' : 'Subir QR'}
                  </button>
                </div>
              </div>
              {subirQr.isError && (
                <p role="alert" className="text-xs text-destructive">
                  {(subirQr.error as any)?.response?.data?.message ?? 'No se pudo subir la imagen'}
                </p>
              )}
            </div>

            {/* Mensajes de WhatsApp (E3 item 26) */}
            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Mensajes de WhatsApp</h3>
              <p className="text-xs text-muted-foreground">
                Variables disponibles: {'{nombre} {hora} {fecha} {monto} {consultorio} {direccion} {linkGoogleMaps}'}
                {' '}y {'{linkQR}'} en el recordatorio de deuda (link a la página de pago con QR; vacío si no hay QR
                cargado). Si dejás un mensaje vacío se usa el texto por defecto del sistema.
              </p>
              {([
                ['msjRecordatorio', 'Recordatorio de cita', 'Hola {nombre}, le recordamos su cita {fecha} a las {hora} en {consultorio}. Te esperamos en {direccion} {linkGoogleMaps}'],
                ['msjDeuda', 'Recordatorio de deuda', 'Hola {nombre}, le recordamos que tiene un saldo pendiente de {monto} en {consultorio}. ¡Gracias!'],
                ['msjContacto', 'Contacto general', 'Hola {nombre}, le contactamos desde {consultorio}.'],
              ] as const).map(([campo, label, placeholder]) => (
                <div key={campo}>
                  <label htmlFor={`cons-${campo}`} className="block text-sm font-medium text-foreground mb-1.5">
                    {label}
                  </label>
                  <textarea
                    id={`cons-${campo}`}
                    rows={2}
                    maxLength={400}
                    value={consForm[campo]}
                    placeholder={placeholder}
                    onChange={(e) => setConsForm((f) => ({ ...f, [campo]: e.target.value }))}
                    className={textareaUI}
                  />
                </div>
              ))}
            </div>

            {/* Módulo de aseguradoras (F1) */}
            <div className="border-t pt-4">
              <button
                type="button"
                role="switch"
                aria-checked={consForm.trabajaConAseguradoras}
                onClick={() => setConsForm((f) => ({ ...f, trabajaConAseguradoras: !f.trabajaConAseguradoras }))}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                  consForm.trabajaConAseguradoras ? 'border-input bg-card hover:bg-muted/40' : 'border-input bg-muted/40 hover:bg-muted/60',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">Trabaja con aseguradoras</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Habilita el catálogo de aseguradoras, la cobertura por cita y las liquidaciones. Si lo apagás, el módulo queda oculto.
                  </span>
                </span>
                <span aria-hidden="true" className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200', consForm.trabajaConAseguradoras ? 'bg-primary' : 'bg-muted-foreground/30')}>
                  <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200', consForm.trabajaConAseguradoras ? 'translate-x-[22px]' : 'translate-x-0.5')} />
                </span>
              </button>
              <p className="text-xs text-muted-foreground mt-1.5">Se aplica al guardar.</p>
            </div>

            {/* Módulo de productos (P1) */}
            <div className="border-t pt-4">
              <button
                type="button"
                role="switch"
                aria-checked={consForm.vendeProductos}
                onClick={() => setConsForm((f) => ({ ...f, vendeProductos: !f.vendeProductos }))}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                  consForm.vendeProductos ? 'border-input bg-card hover:bg-muted/40' : 'border-input bg-muted/40 hover:bg-muted/60',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">Vende productos</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Habilita el catálogo de productos, la venta de productos en el cobro y la venta directa. Si lo apagás, el módulo queda oculto.
                  </span>
                </span>
                <span aria-hidden="true" className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200', consForm.vendeProductos ? 'bg-primary' : 'bg-muted-foreground/30')}>
                  <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200', consForm.vendeProductos ? 'translate-x-[22px]' : 'translate-x-0.5')} />
                </span>
              </button>
              <p className="text-xs text-muted-foreground mt-1.5">Se aplica al guardar.</p>
            </div>
          </div>
        )}

        {(tab === 'info' || tab === 'config') && (
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button onClick={() => updateConsultorio.mutate(consForm)} disabled={updateConsultorio.isPending}
              className={btnPrimaryUI}>
              {updateConsultorio.isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
            {guardado && (
              <span role="status" className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                <Check className="h-4 w-4" aria-hidden="true" />
                Guardado
              </span>
            )}
          </div>
        )}
      </div>

      {usuarioModal && (
        <UsuarioModal usuario={usuarioEdit} onClose={() => setUsuarioModal(false)} />
      )}
    </div>
  )
}
