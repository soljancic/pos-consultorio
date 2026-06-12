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
  @ApiOperation({ summary: 'Cola de mensajes (estado opcional: PENDIENTE/ENVIADO/OMITIDO)' })
  findAll(@CurrentUser() user: JwtPayload, @Query('estado') estado?: EstadoMensaje) {
    return this.service.findAll(user.consultorioId, estado)
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
