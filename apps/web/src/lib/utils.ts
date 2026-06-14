import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { telefonoIntl } from './paises'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFecha(date: Date | string, fmt = 'dd/MM/yyyy') {
  return format(new Date(date), fmt, { locale: es })
}

export function formatHora(date: Date | string) {
  return format(new Date(date), 'HH:mm', { locale: es })
}

// Dias calendario (@db.Date): llegan como medianoche UTC y new Date() los
// corre un dia hacia atras en GMT-4. Formatear SIEMPRE desde el string
// YYYY-MM-DD sin pasar por el timezone (gastos, historial de caja,
// nacimiento, proximo control, calendario de atención).
export function formatDia(fechaIso: string, fmt = 'dd/MM/yyyy') {
  const [y, m, d] = fechaIso.slice(0, 10).split('-').map(Number)
  return format(new Date(y, m - 1, d), fmt, { locale: es })
}

export function formatMoneda(monto: number, moneda = 'ARS') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda }).format(monto)
}

export function tiempoRelativo(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })
}

// El pais del paciente (ISO alfa-2) aporta el prefijo internacional que
// wa.me exige; si el numero ya viene con "+", se respeta tal cual.
export function buildWhatsAppUrl(telefono: string, mensaje: string, pais?: string | null) {
  const numero = telefonoIntl(telefono, pais).replace(/\D/g, '')
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
}

// Abre WhatsApp en la app nativa (movil) o en WhatsApp Desktop via el esquema
// whatsapp://, evitando la pagina intermedia de wa.me (en iOS, el "Continuar al
// chat" de Safari). Si la app no esta instalada, cae a wa.me (web) para no
// dejar al usuario sin nada. Se detecta el exito porque la pestana se oculta
// (la app toma el foco); si seguimos visibles a los 1.2s, abrimos la web.
export function abrirWhatsApp(telefono: string, mensaje: string, pais?: string | null) {
  const numero = telefonoIntl(telefono, pais).replace(/\D/g, '')
  const texto = encodeURIComponent(mensaje)
  // Sin numero (p.ej. futuro paciente): WhatsApp abre el selector de contacto.
  const appUrl = numero ? `whatsapp://send?phone=${numero}&text=${texto}` : `whatsapp://send?text=${texto}`
  const webUrl = numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`

  let abrioApp = false
  const marcar = () => { abrioApp = true }
  document.addEventListener('visibilitychange', marcar, { once: true })
  window.addEventListener('blur', marcar, { once: true })

  window.location.href = appUrl

  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', marcar)
    window.removeEventListener('blur', marcar)
    if (!abrioApp && !document.hidden) {
      window.open(webUrl, '_blank', 'noopener,noreferrer')
    }
  }, 1200)
}
