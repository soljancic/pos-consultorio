import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react'
import { api } from '../../lib/api-client'
import { descargarBlob } from '../../lib/descargas'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { cardUI, btnPrimaryUI, btnOutlineUI, errorUI } from '../../lib/ui'
import { cn } from '../../lib/utils'
import { toast } from '../../stores/toast.store'

type Resultado = {
  creados: number
  actualizados: number
  omitidos?: number
  errores: Array<{ fila: number; motivo: string }>
}

export function ImportarPacientesModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [actualizar, setActualizar] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null)

  const importar = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('archivo', archivo!)
      fd.append('actualizarExistentes', String(actualizar))
      const { data } = await api.post<Resultado>('/pacientes/import', fd)
      return data
    },
    onSuccess: (data) => {
      setResultado(data)
      void qc.invalidateQueries({ queryKey: ['pacientes'] })
    },
    onError: (err: any) => {
      toast.fromError(err, 'No se pudo importar el archivo. Revisá el formato e intentá de nuevo.')
    },
  })

  async function handleDescarga() {
    setErrorDescarga(null)
    try {
      await descargarBlob('/pacientes/import/sample', 'pacientes-ejemplo.xlsx')
    } catch (err: unknown) {
      setErrorDescarga(
        err instanceof Error ? err.message : 'No se pudo descargar el archivo de ejemplo.',
      )
    }
  }

  function handleSeleccionar() {
    // Resetear el input para permitir re-importar el mismo archivo
    if (fileRef.current) fileRef.current.value = ''
    fileRef.current?.click()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-importar-titulo"
    >
      <div className={cn(cardUI, 'w-full max-w-lg p-0')}>
        <ModalHeader
          icon={Upload}
          title="Importar pacientes"
          subtitle="Cargá varios pacientes a la vez desde un archivo XLSX."
          onClose={onClose}
        />

        <div className="p-5 space-y-4">
          {/* Barra de progreso indeterminada durante la importación */}
          {importar.isPending && (
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Importando..."
            >
              <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
            </div>
          )}

          {/* Región de resultado/error con aria-live para lectores de pantalla */}
          <div aria-live="polite" aria-atomic="true">
            {!resultado ? (
              <div className="space-y-4">
                {/* Checkbox actualizar existentes */}
                <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={actualizar}
                    onChange={(e) => setActualizar(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                  />
                  Actualizar datos de pacientes ya registrados
                </label>

                {/* Input oculto + botón visible para seleccionar archivo */}
                <div className="space-y-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    onClick={handleSeleccionar}
                    className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 min-h-[44px] w-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                  >
                    <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {archivo ? archivo.name : 'Seleccionar archivo XLSX'}
                    </span>
                  </button>

                  {/* Enlace para descargar el archivo de ejemplo */}
                  <button
                    type="button"
                    onClick={handleDescarga}
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                    Descargar archivo de ejemplo
                  </button>
                </div>

                {/* Error de descarga del ejemplo */}
                {errorDescarga && (
                  <p role="alert" className={errorUI}>
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {errorDescarga}
                  </p>
                )}

              </div>
            ) : (
              /* Resumen de resultado post-importación */
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" aria-hidden="true" />
                  Importación completada
                </div>

                <div className="bg-muted/40 rounded-lg px-3 py-2.5 text-sm tabular-nums">
                  <span className="text-foreground">
                    <b>{resultado.creados}</b> creados
                  </span>
                  <span className="mx-2 text-muted-foreground/50">·</span>
                  <span className="text-foreground">
                    <b>{resultado.actualizados}</b> actualizados
                  </span>
                  {typeof resultado.omitidos === 'number' && (
                    <>
                      <span className="mx-2 text-muted-foreground/50">·</span>
                      <span className="text-muted-foreground">
                        <b>{resultado.omitidos}</b> omitidos
                      </span>
                    </>
                  )}
                </div>

                {resultado.errores.length > 0 && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5">
                    <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-destructive uppercase tracking-wide">
                      {resultado.errores.length} {resultado.errores.length === 1 ? 'fila con error' : 'filas con error'}
                    </p>
                    <ul className="max-h-40 overflow-auto px-3 pb-2.5 space-y-0.5">
                      {resultado.errores.map((e) => (
                        <li key={e.fila} className="text-sm text-muted-foreground tabular-nums">
                          <span className="font-medium text-foreground">Fila {e.fila}:</span>{' '}
                          {e.motivo}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className={btnOutlineUI}
          >
            {resultado ? 'Cerrar' : 'Cancelar'}
          </button>
          {!resultado && (
            <button
              type="button"
              disabled={!archivo || importar.isPending}
              onClick={() => importar.mutate()}
              className={btnPrimaryUI}
            >
              {importar.isPending ? 'Importando...' : 'Importar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
