// Prisma 7: la configuracion del CLI se centraliza aca (reemplaza la key `prisma`
// de package.json y el `url` del datasource del schema). El runtime de la app NO
// usa este archivo: el PrismaClient se instancia con el driver adapter en
// prisma.service.ts. Esto es solo para los comandos del CLI (generate/migrate/seed).
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // El seed sigue corriendo con ts-node (ya instalado), no agregamos tsx.
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    // Solo para Migrate/CLI; en runtime la conexion va por el adapter.
    url: env('DATABASE_URL'),
  },
})
