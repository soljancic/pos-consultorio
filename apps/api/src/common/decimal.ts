// Prisma 7 dejo de exponer Decimal en '@prisma/client/runtime/library'. El tipo
// y la clase ahora viven bajo el namespace Prisma. Re-exportamos aca un unico
// `Decimal` (valor + tipo) para no repetir `Prisma.Decimal` en cada servicio y
// dejar un solo punto si vuelve a cambiar de ubicacion.
import { Prisma } from '@prisma/client'

export const Decimal = Prisma.Decimal
export type Decimal = Prisma.Decimal
