// Catalogo de paises para el telefono de contacto (ISO 3166-1 alfa-2 +
// prefijo internacional). Define el prefijo al armar links de wa.me.
// Bolivia es el default del producto (PAIS_DEFAULT, igual que en la BD).

export type Pais = { codigo: string; nombre: string; dial: string }

export const PAIS_DEFAULT = 'BO'

export const PAISES: Pais[] = [
  { codigo: 'DE', nombre: 'Alemania', dial: '49' },
  { codigo: 'AR', nombre: 'Argentina', dial: '54' },
  { codigo: 'BO', nombre: 'Bolivia', dial: '591' },
  { codigo: 'BR', nombre: 'Brasil', dial: '55' },
  { codigo: 'CA', nombre: 'Canadá', dial: '1' },
  { codigo: 'CL', nombre: 'Chile', dial: '56' },
  { codigo: 'CN', nombre: 'China', dial: '86' },
  { codigo: 'CO', nombre: 'Colombia', dial: '57' },
  { codigo: 'CR', nombre: 'Costa Rica', dial: '506' },
  { codigo: 'CU', nombre: 'Cuba', dial: '53' },
  { codigo: 'EC', nombre: 'Ecuador', dial: '593' },
  { codigo: 'SV', nombre: 'El Salvador', dial: '503' },
  { codigo: 'ES', nombre: 'España', dial: '34' },
  { codigo: 'US', nombre: 'Estados Unidos', dial: '1' },
  { codigo: 'FR', nombre: 'Francia', dial: '33' },
  { codigo: 'GT', nombre: 'Guatemala', dial: '502' },
  { codigo: 'HN', nombre: 'Honduras', dial: '504' },
  { codigo: 'IT', nombre: 'Italia', dial: '39' },
  { codigo: 'JP', nombre: 'Japón', dial: '81' },
  { codigo: 'MX', nombre: 'México', dial: '52' },
  { codigo: 'NI', nombre: 'Nicaragua', dial: '505' },
  { codigo: 'PA', nombre: 'Panamá', dial: '507' },
  { codigo: 'PY', nombre: 'Paraguay', dial: '595' },
  { codigo: 'PE', nombre: 'Perú', dial: '51' },
  { codigo: 'PT', nombre: 'Portugal', dial: '351' },
  { codigo: 'GB', nombre: 'Reino Unido', dial: '44' },
  { codigo: 'DO', nombre: 'República Dominicana', dial: '1' },
  { codigo: 'UY', nombre: 'Uruguay', dial: '598' },
  { codigo: 'VE', nombre: 'Venezuela', dial: '58' },
]

export function paisDe(codigo?: string | null): Pais {
  return PAISES.find((p) => p.codigo === codigo) ?? PAISES.find((p) => p.codigo === PAIS_DEFAULT)!
}

// Bandera emoji a partir del codigo ISO (indicadores regionales Unicode)
export function banderaDe(codigo: string) {
  return String.fromCodePoint(...[...codigo.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

// Telefono en formato internacional legible: "+591 71234567".
// Si el numero ya viene con "+", se respeta tal cual.
export function telefonoIntl(telefono: string, pais?: string | null) {
  const limpio = telefono.trim()
  if (limpio.startsWith('+')) return limpio
  return `+${paisDe(pais).dial} ${limpio}`
}
