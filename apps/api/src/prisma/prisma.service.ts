import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Prisma 7: el cliente ya no lee la url del schema; recibe un driver adapter.
    // PrismaPg crea su propio pool a partir de DATABASE_URL (inyectada por Railway
    // en prod y por ConfigModule/.env en local, ya presente en process.env aca).
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  }

  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }

  // Helper: extrae consultorioId del contexto para queries con tenancy
  withTenant(consultorioId: number) {
    return {
      where: { consultorioId },
    }
  }
}
