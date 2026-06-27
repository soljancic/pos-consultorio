import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { AlertCircle, CalendarClock, Calendar, Clock, UserRound, Stethoscope, MessageCircle, Copy, Check } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatHora, abrirWhatsApp, publicBaseUrl, cn } from '../../lib/utils'
import { usePlantillasWhatsApp } from '../../lib/whatsapp'
import { btnPrimaryUI, btnOutlineUI, errorUI } from '../../lib/ui'
import { toast } from '../../stores/toast.store'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'
import { FloatingSelect } from '../../components/shared/FloatingSelect'
import type { Cita, Doctor, Servicio } from '@pos/types'

interface Props {
  cita: Cita
  onClose: () => void
}

// Reprogramar = editar fecha/hora/doctor en el lugar (PUT /citas/:id).
// La cita vuelve a PENDIENTE: hay que re-confirmar con el paciente.
export function ReprogramarCitaModal({ cita, onClose }: Props) {
  const qc = useQueryClient()
  const fechaActual = new Date(cita.fechaHora)
  const [fecha, setFecha] = useState(format(fechaActual, 'yyyy-MM-dd'))
  const [hora, setHora] = useState(format(fechaActual, 'HH:mm'))
  const [doctorId, setDoctorId] = useState(String(cita.doctorId))
  const [servicioId, setServicioId] = useState(String(cita.servicioId))
  const [error, setError] = useState('')
  const { consultorioNombre } = usePlantillasWhatsApp()

  const [copiado, setCopiado] = useState(false)

  // Portal: el link de reprogramacion solo aplica con el portal activo
  const { data: consultorio } = useQuery<{ slug: string | null; portalActivo: boolean }>({
    queryKey: ['consultorio'],
    queryFn: () => api.get('/consultorio').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const portalListo = !!(consultorio?.slug && consultorio.portalActivo)

  // Token opaco de la cita (lo crea el backend si no existe): deja el click sincrono
  const { data: tokenReprog } = useQuery<{ token: string }>({
    queryKey: ['cita-token-reprogramacion', cita.id],
    queryFn: () => api.get(`/citas/${cita.id}/token-reprogramacion`).then((r) => r.data),
    enabled: portalListo,
    staleTime: 5 * 60 * 1000,
  })

  function buildLinkReprogramar() {
    return `${publicBaseUrl()}/reservar/${consultorio!.slug}?reprogramar=${tokenReprog!.token}`
  }

  const { data: doctores = [] } = useQuery<Doctor[]>({
    queryKey: ['doctores'],
    queryFn: () => api.get('/doctores').then((r) => r.data),
  })

  const { data: servicios = [] } = useQuery<Servicio[]>({
    queryKey: ['servicios'],
    queryFn: () => api.get('/servicios').then((r) => r.data),
  })

  const reprogramar = useMutation({
    mutationFn: () =>
      api.put(`/citas/${cita.id}`, {
        fechaHora: new Date(`${fecha}T${hora}:00`).toISOString(),
        doctorId: Number(doctorId),
        servicioId: Number(servicioId),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['citas'] })
      onClose()
    },
    onError: (err: any) => {
      toast.fromError(err, 'Error al reprogramar')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    reprogramar.mutate()
  }

  // Enviar al paciente el link para que reprograme el mismo su cita
  function handleWhatsApp() {
    const tel = cita.paciente?.telefono
    if (!tel || !tokenReprog?.token) return
    const msg = `Hola ${cita.paciente?.nombre ?? ''}, para reprogramar tu cita en ${consultorioNombre} elegi tu nueva fecha y horario desde este link: ${buildLinkReprogramar()}`
    abrirWhatsApp(tel, msg, cita.paciente?.pais)
    onClose()
  }

  async function copiarLink() {
    if (!tokenReprog?.token) return
    try {
      await navigator.clipboard.writeText(buildLinkReprogramar())
      setCopiado(true)
      // mostrar "Copiado" un instante y cerrar el modal
      setTimeout(onClose, 1000)
    } catch {
      setError('No se pudo copiar el link')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader
          icon={CalendarClock}
          title="Reprogramar cita"
          subtitle={<>{cita.paciente?.nombre} {cita.paciente?.apellido} &bull; hoy {formatHora(cita.fechaHora)}</>}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <FloatingInput
              id="reprog-fecha"
              label="Nueva fecha"
              type="date"
              Icon={Calendar}
              alwaysFloat
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
            <FloatingInput
              id="reprog-hora"
              label="Nueva hora"
              type="time"
              Icon={Clock}
              alwaysFloat
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              required
            />
          </div>

          <FloatingSelect
            id="reprog-doctor"
            label="Doctor"
            Icon={UserRound}
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            required
          >
            {doctores.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </FloatingSelect>

          <FloatingSelect
            id="reprog-servicio"
            label="Servicio"
            Icon={Stethoscope}
            value={servicioId}
            onChange={(e) => setServicioId(e.target.value)}
            required
            hint={
              String(cita.servicioId) !== servicioId
                ? 'Al cambiar el servicio, el cobro se recalcula al precio del nuevo servicio.'
                : undefined
            }
          >
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre} ({s.duracionMin}min)</option>
            ))}
          </FloatingSelect>

          <p className="text-xs text-muted-foreground">
            La cita vuelve a estado Pendiente: confirmar de nuevo con el paciente.
          </p>

          {portalListo && tokenReprog?.token && (
            <div>
              <div className="flex gap-2">
                {cita.paciente?.telefono && (
                  <button
                    type="button"
                    onClick={handleWhatsApp}
                    className={cn(btnOutlineUI, 'flex-1 text-accent hover:bg-accent/10')}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    Enviar link por WhatsApp
                  </button>
                )}
                <button
                  type="button"
                  onClick={copiarLink}
                  aria-label="Copiar link de reprogramacion"
                  className={cn(btnOutlineUI, 'px-3 shrink-0')}
                >
                  {copiado ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                El paciente abre el link y elige el mismo su nueva fecha y horario.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Cancelar
            </button>
            <button type="submit" disabled={reprogramar.isPending} className={cn(btnPrimaryUI, 'flex-1')}>
              {reprogramar.isPending ? 'Guardando...' : 'Reprogramar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
