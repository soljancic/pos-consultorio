import { Controller, Get, Patch, Param, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { NotificacionesService } from './notificaciones.service'

@ApiTags('Notificaciones')
@ApiBearerAuth()
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private service: NotificacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Últimas notificaciones del usuario (según rol)' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user)
  }

  @Get('no-leidas/count')
  @ApiOperation({ summary: 'Cantidad de no leídas (badge de la campana)' })
  async count(@CurrentUser() user: JwtPayload) {
    return { count: await this.service.noLeidasCount(user) }
  }

  @Patch('leidas')
  @ApiOperation({ summary: 'Marcar todas como leídas' })
  marcarTodas(@CurrentUser() user: JwtPayload) {
    return this.service.marcarTodasLeidas(user)
  }

  @Patch(':id/leida')
  @ApiOperation({ summary: 'Marcar una como leída' })
  marcarLeida(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.marcarLeida(user, id)
  }
}
