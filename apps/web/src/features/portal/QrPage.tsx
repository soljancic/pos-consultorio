import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { QrCode, Download } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { cardUI, btnPrimaryUI } from '../../lib/ui'

// Pagina publica de pago con QR (sin auth): el consultorio comparte
// /qr/:slug?cliente=Nombre en el recordatorio de deuda y el paciente ve y
// descarga el QR para pagar desde su app del banco.
export function QrPage() {
  const { slug } = useParams<{ slug: string }>()
  const [params] = useSearchParams()
  const cliente = params.get('cliente')
  const [descargando, setDescargando] = useState(false)

  // En iOS Safari la descarga programatica no funciona bien: se indica
  // mantener pulsada la imagen (mismo criterio que el qr2.php original)
  const esIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)

  const { data, isLoading, isError } = useQuery<{
    consultorio: string
    logoUrl: string | null
    qrUrl: string
  }>({
    queryKey: ['qr-publico', slug],
    queryFn: () => api.get(`/public/${slug}/qr`).then((r) => r.data),
    retry: 1,
  })

  // El download cross-origin (Cloudinary) necesita pasar por blob
  async function descargar() {
    if (!data) return
    setDescargando(true)
    try {
      const res = await fetch(data.qrUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qr-pago-${slug}.jpg`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } finally {
      setDescargando(false)
    }
  }

  if (isLoading) {
    return <div className="min-h-dvh flex items-center justify-center bg-background text-muted-foreground">Cargando...</div>
  }
  if (isError || !data) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-6">
        <div className={cn(cardUI, 'p-8 text-center max-w-sm')}>
          <p className="text-sm text-muted-foreground">
            El QR de pago no está disponible. Consultá con el consultorio.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="bg-primary text-primary-foreground px-6 py-5">
        <div className="max-w-lg mx-auto flex items-center gap-2.5">
          <span className="bg-white/15 rounded-lg p-2">
            <QrCode className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">{data.consultorio}</h1>
            <p className="text-xs text-cyan-50/90">Pago con QR</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 sm:p-6">
        <div className={cn(cardUI, 'p-6 space-y-4 text-center')}>
          <p className="text-sm text-foreground">
            {cliente ? `Hola ${cliente}: escaneá` : 'Escaneá'} el código desde la app de tu banco o
            billetera, o descargalo para pagar cuando quieras.
          </p>
          <img
            src={data.qrUrl}
            alt={`QR de pagos de ${data.consultorio}`}
            className="mx-auto max-h-80 w-auto rounded-lg border bg-white p-2"
          />
          {esIOS ? (
            <p className="text-sm font-medium text-foreground">
              Mantené pulsada la imagen y elegí "Guardar imagen".
            </p>
          ) : (
            <button onClick={descargar} disabled={descargando} className={cn(btnPrimaryUI, 'w-full h-11')}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {descargando ? 'Descargando...' : 'Descargar QR'}
            </button>
          )}

          <div className="text-left text-sm text-foreground bg-muted/50 rounded-md p-4">
            <p className="font-semibold mb-2">Descargá el QR y seguí estos pasos:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Abrí la aplicación de tu banco.</li>
              <li>Andá a la opción Pago Simple o QR.</li>
              <li>Elegí la opción Pagar.</li>
              <li>Seleccioná el código QR de tu galería.</li>
              <li>Confirmá el pago y ¡terminaste!</li>
            </ol>
          </div>

          <p className="text-xs text-muted-foreground">
            Cuando hagas el pago, avisá al consultorio por WhatsApp con el comprobante.
          </p>

          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            Powered by
            <img src="/brand/toptech.png" alt="Toptech" className="h-5 w-auto" />
          </p>
        </div>
      </main>
    </div>
  )
}
