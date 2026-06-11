import { SetMetadata } from '@nestjs/common'
import { IS_PUBLIC_KEY } from '../guards/jwt-auth.guard'

// Marca una ruta como publica (sin JWT). Usar SOLO en auth, health y el
// portal de reservas; toda otra ruta es privada por defecto.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
