import { Controller, Get, Post, Put, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { EstadoMensaje } from '@prisma/client'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { MensajesService, ResolverMensajeDto } from './mensajes.service'

@ApiTags('Mensajes')
@ApiBearerAuth()
@Controller('mensajes')
export class MensajesController {
  constructor(private service: MensajesService) {}

  @Get()
  @ApiOperation({ summary: 'Cola de mensajes (estado opcional; resueltos filtran por rango desde/hasta)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('estado') estado?: EstadoMensaje,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.service.findAll(user.consultorioId, estado, desde, hasta)
  }

  @Get('pendientes/count')
  @ApiOperation({ summary: 'Cantidad de mensajes pendientes (badge del nav)' })
  async pendientesCount(@CurrentUser() user: JwtPayload) {
    return { pendientes: await this.service.pendientesCount(user.consultorioId) }
  }

  @Post('generar')
  @ApiOperation({ summary: 'Encolar recordatorios (citas hoy/manana) y avisos de deuda (el cron lo hace a diario)' })
  generar(@CurrentUser() user: JwtPayload) {
    return this.service.generar(user.consultorioId)
  }

  // Ruta literal antes que la parametrizada (:id). Lo usa el boton de WhatsApp
  // de la agenda: al mandar el recordatorio de una cita de hoy, lo saca de la cola.
  @Put('cita/:citaId/enviado')
  @ApiOperation({ summary: 'Marca como ENVIADO el recordatorio de una cita de hoy (al enviarlo desde la agenda)' })
  resolverPorCita(
    @CurrentUser() user: JwtPayload,
    @Param('citaId', ParseIntPipe) citaId: number,
  ) {
    return this.service.resolverPorCita(user.consultorioId, citaId, user.sub)
  }

  @Put(':id/resolver')
  @ApiOperation({ summary: 'Marcar un mensaje como ENVIADO u OMITIDO' })
  resolver(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolverMensajeDto,
  ) {
    return this.service.resolver(user.consultorioId, id, dto.estado, user.sub)
  }
}
