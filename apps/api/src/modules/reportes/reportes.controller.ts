import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Rol } from '@pos/types'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { ReportesService } from './reportes.service'

@ApiTags('Reportes')
@ApiBearerAuth()
@Controller('reportes')
export class ReportesController {
  constructor(private service: ReportesService) {}

  @Get('mensual')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Reporte del mes: ingresos, gastos, citas y desglose por doctor (ADMIN)' })
  mensual(@CurrentUser() user: JwtPayload, @Query('mes') mes?: string) {
    return this.service.mensual(user.consultorioId, mes)
  }
}
