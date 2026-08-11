import { useEffect, useRef } from 'react'
import { HOJA_H, type TrazosHoja } from '@pos/types'
import { cn } from '../../lib/utils'
import { altoHoja, escalaHoja, pintarHoja } from './dibujar'

interface Props {
  trazos: TrazosHoja
  /** Ancho de render en pixeles CSS. El alto sale de la proporcion A4. */
  ancho: number
  className?: string
  /** Texto alternativo para lectores de pantalla. */
  etiqueta?: string
}

/**
 * Dibuja una hoja manuscrita en solo lectura. Se usa para la miniatura del
 * modal, el visor de la historia clinica y la capa de trazos ya cerrados del
 * editor. No captura eventos: es puro pixel.
 */
export function HojaRenderer({ trazos, ancho, className, etiqueta }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const alto = altoHoja(ancho)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // devicePixelRatio: sin esto el trazo se ve pixelado en pantallas retina.
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    // Escala de espacio logico de hoja -> pixeles fisicos del canvas
    const escala = escalaHoja(ancho, dpr)
    // Ambos ejes se derivan de ancho/dpr sin redondear y redondean UNA sola
    // vez (canvas.height NO sale de `alto`, que ya esta redondeado a CSS: si
    // se multiplicara por dpr otra vez seria un doble redondeo).
    canvas.width = Math.round(ancho * dpr)
    canvas.height = Math.round(escala * HOJA_H)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    pintarHoja(ctx, trazos)
  }, [trazos, ancho, alto])

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={etiqueta ?? 'Hoja manuscrita'}
      style={{ width: ancho, height: alto }}
      // bg-white fijo a proposito: la hoja es papel, un objeto con su propio
      // color fijo (como una foto), no chrome de la app — se mantiene blanca
      // en dark mode igual que quedaria una hoja escaneada. El border si usa
      // el token semantico (dark-mode safe) porque es el borde del recorte,
      // no del papel en si.
      className={cn('bg-white rounded-md border', className)}
    />
  )
}
