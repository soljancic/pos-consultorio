import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Lock, Pencil, Save, ShieldCheck, ShoppingCart, Stethoscope } from 'lucide-react'
import { EstadoCita, type Cita, type Servicio } from '@pos/types'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI } from '../../lib/ui'
import { toast } from '../../stores/toast.store'
import { useAuthStore } from '../../stores/auth.store'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingSelect } from '../../components/shared/FloatingSelect'
import { FloatingInput } from '../../components/shared/FloatingInput'
import { LineasProductoEditor, type LineaUI } from '../inventario/LineasProductoEditor'

interface Props {
  cita: Cita
  onClose: () => void
}

export function EditarCitaModal({ cita, onClose }: Props) {
  const qc = useQueryClient()
  const trabajaConAseguradoras = useAuthStore((s) => s.user?.trabajaConAseguradoras)
  const vendeProductos = useAuthStore((s) => s.user?.vendeProductos) ?? false

  // --- Estado local para las 3 secciones ---
  const [servicioId, setServicioId] = useState(String(cita.servicioId))
  const [usaSeguro, setUsaSeguro] = useState(cita.usaSeguro ?? false)
  const [codigoSeguro, setCodigoSeguro] = useState(cita.codigoSeguro ?? '')
  const [lineas, setLineas] = useState<LineaUI[]>([])

  // --- Queries ---
  const { data: servicios = [] } = useQuery<Servicio[]>({
    queryKey: ['servicios'],
    queryFn: () => api.get('/servicios').then((r) => r.data),
  })

  // Detalle de seguro del paciente (para saber si mostrar la sección de cobertura)
  const pacienteId = cita.paciente?.id
  const { data: pacienteSeguro } = useQuery<{
    tieneSeguro: boolean
    codigoSeguro: string | null
    aseguradora: { id: number; nombre: string } | null
    categoriaSeguro: { id: number; nombre: string; aseguradoraId: number } | null
  }>({
    queryKey: ['paciente-seguro', pacienteId],
    queryFn: () => api.get(`/pacientes/${pacienteId}`).then((r) => r.data),
    enabled: !!pacienteId && !!trabajaConAseguradoras,
    staleTime: 2 * 60 * 1000,
  })

  // Cobro de la cita (para la sección de productos)
  const { data: cobro } = useQuery({
    queryKey: ['cobro-cita', cita.id],
    queryFn: () => api.get(`/cobros/cita/${cita.id}`).then((r) => r.data),
    enabled: vendeProductos && cita.estado === EstadoCita.ATENDIDA,
    refetchOnWindowFocus: false,
  })

  // Inicializar líneas desde el cobro cuando llega
  useEffect(() => {
    if (!cobro?.detalles) return
    setLineas(
      cobro.detalles
        .filter((d: any) => d.productoId != null)
        .map((d: any) => ({
          productoId: d.productoId,
          nombre: d.descripcion,
          precioVenta: Number(d.precioVenta),
          cantidad: d.cantidad,
          stockActual: 0,
          controlaStock: false,
        })),
    )
  }, [cobro])

  // --- Visibilidad de la sección de cobertura ---
  // Solo cuando el consultorio trabaja con aseguradoras Y el paciente tiene seguro
  const mostrarSeguro = !!(trabajaConAseguradoras && pacienteSeguro?.tieneSeguro)

  // --- Detección de cambios para el botón Guardar y para splitear endpoints ---
  const servicioIdNum = Number(servicioId)
  const cambioServicio = servicioIdNum !== cita.servicioId
  const cambioUsaSeguro = usaSeguro !== (cita.usaSeguro ?? false)
  const cambioCodigoSeguro =
    usaSeguro && codigoSeguro !== (cita.codigoSeguro ?? '')

  // Líneas de productos: comparar con lo guardado en el cobro
  const subtotalProductosGuardado = cobro?.detalles
    ? cobro.detalles
        .filter((d: any) => d.productoId != null)
        .reduce((s: number, d: any) => s + Number(d.subtotal), 0)
    : 0
  const cantGuardadas = cobro?.detalles?.filter((d: any) => d.productoId != null).length ?? 0
  const subtotalLineasLocal = lineas.reduce((s, l) => s + l.precioVenta * l.cantidad, 0)
  const hayCambiosLineas =
    vendeProductos &&
    cita.estado === EstadoCita.ATENDIDA &&
    (Math.abs(subtotalLineasLocal - subtotalProductosGuardado) > 0.001 ||
      lineas.length !== cantGuardadas)

  const hayCambios =
    cambioServicio || cambioUsaSeguro || cambioCodigoSeguro || hayCambiosLineas

  // --- Mutación de guardado ---
  const guardar = useMutation({
    mutationFn: async () => {
      // Endpoint 1: PUT /citas/:id/editar — solo si cambió algo de cita/seguro
      const cambioCitaBody: {
        servicioId?: number
        usaSeguro?: boolean
        codigoSeguro?: string
      } = {}
      if (cambioServicio) cambioCitaBody.servicioId = servicioIdNum
      if (cambioUsaSeguro) cambioCitaBody.usaSeguro = usaSeguro
      if (cambioCodigoSeguro) cambioCitaBody.codigoSeguro = codigoSeguro

      if (Object.keys(cambioCitaBody).length > 0) {
        await api.put(`/citas/${cita.id}/editar`, cambioCitaBody)
      }

      // Endpoint 2: PUT /cobros/:id/lineas — solo si ATENDIDA y cambios de productos
      if (cita.estado === EstadoCita.ATENDIDA && hayCambiosLineas && cobro?.id) {
        await api.put(`/cobros/${cobro.id}/lineas`, {
          lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
        })
      }
    },
    onSuccess: () => {
      for (const key of [
        'citas',
        'cobro-cita',
        'deudores',
        'deudores-resumen',
        'liquidaciones',
        'caja-hoy',
        'pacientes',
        'paciente',
      ]) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      onClose()
    },
    onError: (err) => toast.fromError(err, 'No se pudo guardar la edición de la cita'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hayCambios) return
    guardar.mutate()
  }

  const esAtendida = cita.estado === EstadoCita.ATENDIDA

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <ModalHeader
          icon={Pencil}
          title="Editar cita"
          subtitle={
            <>
              {cita.paciente?.nombre} {cita.paciente?.apellido}
              {cita.servicio?.nombre ? <> &bull; {cita.servicio.nombre}</> : null}
            </>
          }
          onClose={onClose}
        />

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Cuerpo scrolleable */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-7 space-y-0">

            {/* Sección 1: Servicio */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Servicio
                </h3>
              </div>

              <FloatingSelect
                id="editar-servicio"
                label="Servicio"
                Icon={Stethoscope}
                value={servicioId}
                onChange={(e) => setServicioId(e.target.value)}
                required
              >
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} ({s.duracionMin}min)
                  </option>
                ))}
              </FloatingSelect>

              {cambioServicio && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Cambiar el servicio recalcula el cobro al precio del nuevo servicio.
                </p>
              )}
            </div>

            {/* Sección 2: Cobertura de seguro (condicional) */}
            {mostrarSeguro && (
              <>
                <div className="border-t border-border/50 my-5" />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Cobertura de seguro
                    </h3>
                  </div>

                  {/* Toggle "Usar seguro" — mismo diseño que NuevaCitaModal */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={usaSeguro}
                    onClick={() => setUsaSeguro((v) => !v)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                      usaSeguro
                        ? 'border-input bg-card hover:bg-muted/40'
                        : 'border-input bg-muted/40 hover:bg-muted/60',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <ShieldCheck
                          className={cn(
                            'h-4 w-4 shrink-0',
                            usaSeguro ? 'text-primary' : 'text-muted-foreground/50',
                          )}
                          aria-hidden="true"
                        />
                        Usar seguro
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {usaSeguro
                          ? 'La cita se facturará con cobertura de la aseguradora.'
                          : 'La cita se atenderá como particular.'}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
                        usaSeguro ? 'bg-primary' : 'bg-muted-foreground/30',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
                          usaSeguro ? 'translate-x-[22px]' : 'translate-x-0.5',
                        )}
                      />
                    </span>
                  </button>

                  {/* Código de asegurado: visible solo cuando el toggle está ON */}
                  {usaSeguro && (
                    <FloatingInput
                      id="editar-codigo-seguro"
                      label="Código de asegurado"
                      Icon={ShieldCheck}
                      value={codigoSeguro}
                      onChange={(e) => setCodigoSeguro(e.target.value)}
                      className="tabular-nums"
                    />
                  )}
                </div>
              </>
            )}

            {/* Sección 3: Productos (solo si el consultorio vende productos) */}
            {vendeProductos && (
              <>
                <div className="border-t border-border/50 my-5" />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Productos
                    </h3>
                  </div>

                  {esAtendida ? (
                    <>
                      <LineasProductoEditor
                        lineas={lineas}
                        onChange={setLineas}
                        disabled={false}
                      />

                      {/* Botón "Guardar productos" inline — solo visible con cambios pendientes.
                          Permite confirmar los productos antes de guardar el resto de la cita,
                          o como acción independiente (mismo patrón que CobroModal). */}
                      {hayCambiosLineas && cobro?.id && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!cobro?.id) return
                            api
                              .put(`/cobros/${cobro.id}/lineas`, {
                                lineas: lineas.map((l) => ({
                                  productoId: l.productoId,
                                  cantidad: l.cantidad,
                                })),
                              })
                              .then(() => {
                                qc.invalidateQueries({ queryKey: ['cobro-cita', cita.id] })
                                qc.invalidateQueries({ queryKey: ['citas'] })
                                toast.success('Productos guardados')
                              })
                              .catch((err) =>
                                toast.fromError(err, 'No se pudieron guardar los productos'),
                              )
                          }}
                          className={cn(btnOutlineUI, 'w-full')}
                        >
                          <Save className="h-4 w-4" aria-hidden="true" />
                          Guardar productos
                        </button>
                      )}
                    </>
                  ) : (
                    /* Estado bloqueado: cita no está ATENDIDA */
                    <div className="flex min-h-[44px] items-center gap-2.5 rounded-lg border border-dashed bg-muted/30 px-3 py-2.5">
                      <Lock className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                      <p className="text-xs text-muted-foreground">
                        Los productos solo se pueden editar en citas atendidas.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer fijo: siempre visible aunque el cuerpo scrollee */}
          <div className="flex gap-3 shrink-0 border-t bg-card p-4 sm:p-5">
            <button
              type="button"
              onClick={onClose}
              className={cn(btnOutlineUI, 'flex-1')}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardar.isPending || !hayCambios}
              className={cn(btnPrimaryUI, 'flex-1')}
            >
              {guardar.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
