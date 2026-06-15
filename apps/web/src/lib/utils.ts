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

// Moneda del consultorio. Se setea una vez (AppShell, al cargar la config) y
// TODAS las llamadas a formatMoneda la usan por defecto: asi el simbolo correcto
// (Bs para BOB, $ para ARS/USD) aparece en todo el front y en los mensajes de
// cobranza sin pasar la moneda en cada lugar. Se persiste para que el simbolo
// ya sea correcto en el primer render tras recargar.
const MONEDA_KEY = 'pos-moneda'
let monedaActual =
  (typeof localStorage !== 'undefined' && localStorage.getItem(MONEDA_KEY)) || 'ARS'

export function setMonedaActual(moneda?: string | null) {
  if (!moneda || moneda === monedaActual) return
  monedaActual = moneda
  try {
    localStorage.setItem(MONEDA_KEY, moneda)
  } catch {
    /* storage no disponible (modo privado): igual queda en memoria */
  }
}

// narrowSymbol: "$" para ARS/USD, "Bs" para BOB (en vez de los codigos ARS/BOB).
export function formatMoneda(monto: number, moneda = monedaActual) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: moneda,
    currencyDisplay: 'narrowSymbol',
  }).format(monto)
}

// Solo el simbolo de la moneda activa ("Bs", "$", ...). Para prefijos de inputs.
export function simboloMoneda(moneda = monedaActual) {
  const parte = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: moneda,
    currencyDisplay: 'narrowSymbol',
  })
    .formatToParts(0)
    .find((p) => p.type === 'currency')
  return parte?.value ?? moneda
}

export function tiempoRelativo(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })
}

// Base canonica para los links publicos que se mandan al paciente (reserva y
// QR de pago). Se fija con VITE_PUBLIC_URL para que el link sea SIEMPRE el
// dominio propio aunque el staff abra la app desde otro dominio (p.ej. el
// *.up.railway.app). Sin la var configurada cae al origen actual.
export function publicBaseUrl() {
  const base = import.meta.env.VITE_PUBLIC_URL as string | undefined
  return (base || window.location.origin).replace(/\/$/, '')
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
  // Sin telefono real, NO armar numero: telefonoIntl devolveria solo el prefijo
  // del pais (ej "+591"), que WhatsApp toma como numero invalido. Vacio = el
  // selector de contacto se abre con el texto ya cargado.
  const numero = telefono.trim() ? telefonoIntl(telefono, pais).replace(/\D/g, '') : ''
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
