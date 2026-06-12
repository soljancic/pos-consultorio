import { Controller, Get, Post, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { PortalService, ReservaPortalDto } from './portal.service'
import { Public } from '../../common/decorators/public.decorator'

// Superficie PUBLICA (sin auth): rate limit estricto y cero enumeracion.
@ApiTags('Portal publico')
@Controller('public')
export class PortalController {
  constructor(private service: PortalService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get(':slug')
  @ApiOperation({ summary: 'Datos publicos del consultorio (doctores y servicios)' })
  info(@Param('slug') slug: string) {
    return this.service.info(slug)
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get(':slug/prefill/:token')
  @ApiOperation({ summary: 'Datos de contacto del paciente del link precargado (token opaco)' })
  prefill(@Param('slug') slug: string, @Param('token') token: string) {
    return this.service.prefill(slug, token)
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get(':slug/qr')
  @ApiOperation({ summary: 'QR de pagos del consultorio (para ver y descargar)' })
  qr(@Param('slug') slug: string) {
    return this.service.qr(slug)
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get(':slug/slots')
  @ApiOperation({ summary: 'Horas libres del doctor para un servicio y fecha' })
  slots(
    @Param('slug') slug: string,
    @Query('doctorId', ParseIntPipe) doctorId: number,
    @Query('servicioId', ParseIntPipe) servicioId: number,
    @Query('fecha') fecha: string,
  ) {
    return this.service.slots(slug, doctorId, servicioId, fecha)
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(':slug/reservas')
  @ApiOperation({ summary: 'Reservar: crea paciente (match por telefono) + cita PENDIENTE' })
  reservar(@Param('slug') slug: string, @Body() dto: ReservaPortalDto) {
    return this.service.reservar(slug, dto)
  }
}
