import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFecha(date: Date | string, fmt = 'dd/MM/yyyy') {
  return format(new Date(date), fmt, { locale: es })
}

export function formatHora(date: Date | string) {
  return format(new Date(date), 'HH:mm', { locale: es })
}

export function formatMoneda(monto: number, moneda = 'ARS') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda }).format(monto)
}

export function tiempoRelativo(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })
}

export function buildWhatsAppUrl(telefono: string, mensaje: string) {
  const numero = telefono.replace(/\D/g, '')
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
}
