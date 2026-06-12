import { useQuery } from '@tanstack/react-query'
import { api } from './api-client'

// E3 item 26: plantillas de WhatsApp editables por consultorio.
// Variables soportadas: {nombre} {hora} {fecha} {monto} {consultorio}
export const PLANTILLAS_DEFAULT = {
  recordatorio: 'Hola {nombre}, le recordamos su cita el día de hoy a las {hora}.',
  deuda: 'Hola {nombre}, le recordamos que tiene un saldo pendiente de {monto} en {consultorio}. ¡Gracias!',
  contacto: 'Hola {nombre}, le contactamos desde {consultorio}.',
} as const

export type PlantillasWhatsApp = { recordatorio: string; deuda: string; contacto: string }

type ConsultorioConfig = {
  nombre: string
  msjRecordatorio: string | null
  msjDeuda: string | null
  msjContacto: string | null
}

export function renderPlantilla(plantilla: string, vars: Record<string, string | number>) {
  return plantilla.replace(/\{(\w+)\}/g, (token, clave) =>
    clave in vars ? String(vars[clave]) : token,
  )
}

// Las plantillas del consultorio con fallback a los defaults; el nombre del
// consultorio viaja como variable implicita
export function usePlantillasWhatsApp() {
  const { data } = useQuery<ConsultorioConfig>({
    queryKey: ['consultorio'],
    queryFn: () => api.get('/consultorio').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const plantillas: PlantillasWhatsApp = {
    recordatorio: data?.msjRecordatorio || PLANTILLAS_DEFAULT.recordatorio,
    deuda: data?.msjDeuda || PLANTILLAS_DEFAULT.deuda,
    contacto: data?.msjContacto || PLANTILLAS_DEFAULT.contacto,
  }
  return { plantillas, consultorioNombre: data?.nombre ?? 'el consultorio' }
}
