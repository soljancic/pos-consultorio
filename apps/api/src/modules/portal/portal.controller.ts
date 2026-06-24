import { Controller, Get, Post, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { PortalService, ReservaPortalDto, DiasDisponiblesQueryDto, ReprogramarPublicoDto } from './portal.service'
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
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get(':slug/servicio/:id')
  @ApiOperation({ summary: 'Nombre/duracion de un servicio (resuelve deep-link, incluye ocultos)' })
  servicio(@Param('slug') slug: string, @Param('id', ParseIntPipe) id: number) {
    return this.service.servicio(slug, id)
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
  @Get(':slug/contacto')
  @ApiOperation({ summary: 'Datos de contacto del consultorio (telefono) para la pantalla de error' })
  contacto(@Param('slug') slug: string) {
    return this.service.contacto(slug)
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
  @Get(':slug/dias')
  @ApiOperation({ summary: 'Dias del mes con al menos un horario libre (calendario Calendly)' })
  dias(@Param('slug') slug: string, @Query() q: DiasDisponiblesQueryDto) {
    return this.service.dias(slug, q.doctorId, q.servicioId, q.mes)
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

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get(':slug/reprogramar/:token')
  @ApiOperation({ summary: 'Contexto del link de reprogramacion (cita, servicio fijo, doctores)' })
  contextoReprogramacion(@Param('slug') slug: string, @Param('token') token: string) {
    return this.service.contextoReprogramacion(slug, token)
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(':slug/reprogramar/:token')
  @ApiOperation({ summary: 'Reprogramar (mover) la cita del token a una nueva fecha/hora' })
  reprogramarPorToken(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @Body() dto: ReprogramarPublicoDto,
  ) {
    return this.service.reprogramarPorToken(slug, token, dto)
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(':slug/cancelar/:token')
  @ApiOperation({ summary: 'Cancelar la cita del token (libera el horario al instante)' })
  cancelarPorToken(@Param('slug') slug: string, @Param('token') token: string) {
    return this.service.cancelarPorToken(slug, token)
  }
}
