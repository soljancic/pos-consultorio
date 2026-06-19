import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Info, Save } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { btnPrimaryUI, cardUI, errorUI } from '../../lib/ui'

interface Servicio {
  id: number
  nombre: string
  precioBase: string | number
  activo: boolean
}

interface TarifaExistente {
  servicioId: number
  montoPaciente: string | number
  montoAseguradora: string | number
}

interface MontosPair {
  montoPaciente: string
  montoAseguradora: string
}

interface Props {
  categoriaSeguroId: number | null
  categoriaNombre?: string
}

export function TarifarioPanel({ categoriaSeguroId, categoriaNombre }: Props) {
  const qc = useQueryClient()
  const [montos, setMontos] = useState<Record<number, MontosPair>>({})
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState(false)

  const { data: servicios = [], isLoading: cargandoServicios } = useQuery<Servicio[]>({
    queryKey: ['servicios', 'todos'],
    queryFn: () => api.get('/servicios?todos=true').then((r) => r.data),
  })

  const { data: tarifas = [], isLoading: cargandoTarifas } = useQuery<TarifaExistente[]>({
    queryKey: ['tarifas-cobertura', categoriaSeguroId],
    queryFn: () =>
      api.get(`/tarifas-cobertura?categoriaSeguroId=${categoriaSeguroId}`).then((r) => r.data),
    enabled: categoriaSeguroId !== null,
  })

  // Cuando lleguen las tarifas existentes, prellenar el estado local
  useEffect(() => {
    if (tarifas.length === 0) return
    setMontos((prev) => {
      const next = { ...prev }
      for (const t of tarifas) {
        if (!next[t.servicioId]) {
          next[t.servicioId] = {
            montoPaciente: String(Number(t.montoPaciente)),
            montoAseguradora: String(Number(t.montoAseguradora)),
          }
        }
      }
      return next
    })
  }, [tarifas])

  // Resetear montos al cambiar de categoria
  useEffect(() => {
    setMontos({})
    setError('')
    setGuardado(false)
  }, [categoriaSeguroId])

  const mutation = useMutation({
    mutationFn: () => {
      const serviciosActivos = servicios.filter((s) => s.activo)
      const tarifasPayload = serviciosActivos
        .filter((s) => {
          const par = montos[s.id]
          return par && par.montoPaciente.trim() !== '' && par.montoAseguradora.trim() !== ''
        })
        .map((s) => ({
          servicioId: s.id,
          montoPaciente: Number(montos[s.id].montoPaciente),
          montoAseguradora: Number(montos[s.id].montoAseguradora),
        }))
      return api.put('/tarifas-cobertura', {
        categoriaSeguroId,
        tarifas: tarifasPayload,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tarifas-cobertura', categoriaSeguroId] })
      setError('')
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar el tarifario')
    },
  })

  function setMonto(servicioId: number, campo: keyof MontosPair, valor: string) {
    setGuardado(false)
    setMontos((prev) => ({
      ...prev,
      [servicioId]: {
        montoPaciente: prev[servicioId]?.montoPaciente ?? '',
        montoAseguradora: prev[servicioId]?.montoAseguradora ?? '',
        [campo]: valor,
      },
    }))
  }

  // Estado: sin categoria seleccionada
  if (categoriaSeguroId === null) {
    return (
      <div className={cn(cardUI, 'flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground')}>
        <Info className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
        <span>Seleccioná una categoría arriba para editar su tarifario.</span>
      </div>
    )
  }

  const cargando = cargandoServicios || cargandoTarifas
  const serviciosActivos = servicios.filter((s) => s.activo)

  return (
    <div className="space-y-3">
      {categoriaNombre && (
        <p className="text-xs text-muted-foreground">
          Tarifario de{' '}
          <span className="font-medium text-foreground">{categoriaNombre}</span>
          {' '}— ingresá los montos que paga el paciente y la aseguradora por cada servicio.
          Filas sin montos no se guardan.
        </p>
      )}

      <div className={cn(cardUI, 'overflow-hidden')}>
        {/* Encabezado de la grilla */}
        <div className="bg-muted/50 border-b grid grid-cols-[1fr_auto_auto] items-center gap-x-3 px-4 py-3">
          <span className="text-xs font-medium text-muted-foreground">Servicio</span>
          <span className="w-24 text-center text-xs font-medium text-muted-foreground">Paciente&nbsp;$</span>
          <span className="w-24 text-center text-xs font-medium text-muted-foreground">Aseguradora&nbsp;$</span>
        </div>

        {/* Filas de servicios — contenedor scrollable */}
        <div className="max-h-72 overflow-y-auto divide-y">
          {cargando && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Cargando...</div>
          )}
          {!cargando && serviciosActivos.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No hay servicios activos en el catálogo.
            </div>
          )}
          {!cargando && serviciosActivos.map((s) => {
            const par = montos[s.id]
            return (
              <div
                key={s.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 px-4 py-2.5 hover:bg-muted/30 transition-colors duration-150"
              >
                <span className="text-sm text-foreground truncate">{s.nombre}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={par?.montoPaciente ?? ''}
                  onChange={(e) => setMonto(s.id, 'montoPaciente', e.target.value)}
                  placeholder="0.00"
                  aria-label={`Monto paciente para ${s.nombre}`}
                  className="w-24 h-8 shrink-0 border border-input bg-card rounded-md px-2 text-sm text-foreground tabular-nums placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={par?.montoAseguradora ?? ''}
                  onChange={(e) => setMonto(s.id, 'montoAseguradora', e.target.value)}
                  placeholder="0.00"
                  aria-label={`Monto aseguradora para ${s.nombre}`}
                  className="w-24 h-8 shrink-0 border border-input bg-card rounded-md px-2 text-sm text-foreground tabular-nums placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                />
              </div>
            )
          })}
        </div>
      </div>

      {error && (
        <p role="alert" className={errorUI}>
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {guardado && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400 transition-opacity duration-300">
            Tarifario guardado.
          </span>
        )}
        <button
          type="button"
          onClick={() => { setError(''); mutation.mutate() }}
          disabled={mutation.isPending || cargando}
          className={cn(btnPrimaryUI, 'h-9 px-4')}
        >
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          {mutation.isPending ? 'Guardando...' : 'Guardar tarifario'}
        </button>
      </div>
    </div>
  )
}
