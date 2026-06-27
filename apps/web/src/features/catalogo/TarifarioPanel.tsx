import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Info, Save } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { btnPrimaryUI, cardUI } from '../../lib/ui'
import { toast } from '../../stores/toast.store'

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

  // Prellenar desde las tarifas existentes. UN solo effect (no dos) para evitar
  // una carrera de orden: al cambiar de categoria con datos ya cacheados,
  // `tarifas` y `categoriaSeguroId` cambian en el mismo commit; con dos effects
  // el de prefill llenaba y el de reset lo borraba justo despues (por eso "la
  // 1era vez cargaba y al cambiar de categoria ya no"). Aca: si cambio la
  // categoria reinicio desde cero; dentro de la misma categoria conservo las
  // ediciones en curso.
  const categoriaPrevia = useRef<number | null>(null)
  useEffect(() => {
    const cambioCategoria = categoriaPrevia.current !== categoriaSeguroId
    categoriaPrevia.current = categoriaSeguroId
    if (cambioCategoria) {
      setGuardado(false)
    }
    setMontos((prev) => {
      const base = cambioCategoria ? {} : { ...prev }
      for (const t of tarifas) {
        if (cambioCategoria || !base[t.servicioId]) {
          base[t.servicioId] = {
            montoPaciente: String(Number(t.montoPaciente)),
            montoAseguradora: String(Number(t.montoAseguradora)),
          }
        }
      }
      return base
    })
  }, [tarifas, categoriaSeguroId])

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
      setMontos({})
      qc.invalidateQueries({ queryKey: ['tarifas-cobertura', categoriaSeguroId] })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    },
    onError: (err: any) => toast.fromError(err, 'Error al guardar el tarifario'),
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
                  className="w-24 h-8 shrink-0 border border-input bg-card rounded-md px-2 text-sm text-foreground tabular-nums placeholder:text-muted-foreground/50 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
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
                  className="w-24 h-8 shrink-0 border border-input bg-card rounded-md px-2 text-sm text-foreground tabular-nums placeholder:text-muted-foreground/50 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                />
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {guardado && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400 transition-opacity duration-300">
            Tarifario guardado.
          </span>
        )}
        <button
          type="button"
          onClick={() => mutation.mutate()}
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
