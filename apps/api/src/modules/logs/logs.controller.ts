import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { AccionLog } from '@prisma/client'
import { LogsService } from './logs.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('Logs')
@ApiBearerAuth()
@Controller('logs')
export class LogsController {
  constructor(private service: LogsService) {}

  @Get()
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Actividad reciente: logs paginados (solo ADMIN)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('entidad') entidad?: string,
    @Query('accion') accion?: AccionLog,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('page') page?: string,
  ) {
    return this.service.findAll(user.consultorioId, {
      entidad,
      accion,
      desde,
      hasta,
      page: page ? Number(page) : undefined,
    })
  }
}
