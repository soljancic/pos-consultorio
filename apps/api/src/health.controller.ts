import { Controller, Get, SetMetadata } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { IS_PUBLIC_KEY } from './common/guards/jwt-auth.guard'
import { PrismaService } from './prisma/prisma.service'

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @SetMetadata(IS_PUBLIC_KEY, true)
  @SkipThrottle()
  async check() {
    // Verifica que la DB responde, no solo que el proceso vive
    await this.prisma.$queryRaw`SELECT 1`
    return { status: 'ok', timestamp: new Date().toISOString() }
  }
}
