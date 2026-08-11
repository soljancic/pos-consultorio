import { HOJA_H, HOJA_W, OCR_LADO_LARGO, type TrazosHoja } from '@pos/types'
import { pintarHoja } from './dibujar'

/**
 * Redibuja la hoja a un PNG de 2576 px de lado largo, que es el maximo que
 * aprovecha la vision del modelo. El blob es efimero: se manda y se descarta,
 * nunca se guarda. El canvas es local a la funcion y nunca se ancla al DOM ni
 * se retiene desde afuera -- con el blob ya resuelto no queda ninguna
 * referencia viva, asi que el recolector de basura lo libera como a
 * cualquier otro objeto (no hace falta un dispose explicito).
 */
export async function rasterizarHoja(trazos: TrazosHoja): Promise<Blob> {
  const escala = OCR_LADO_LARGO / HOJA_H // A4 vertical: el lado largo es el alto
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(HOJA_W * escala)
  canvas.height = Math.round(HOJA_H * escala)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la imagen de la hoja')

  // Fondo blanco explicito: un PNG transparente le da mucho menos contraste al
  // modelo y baja la precision de la transcripcion.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(escala, 0, 0, escala, 0, 0)
  pintarHoja(ctx, trazos)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen de la hoja'))),
      'image/png',
    )
  })
}
