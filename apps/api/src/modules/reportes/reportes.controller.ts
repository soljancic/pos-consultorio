import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Rol } from '@pos/types'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { ReportesService } from './reportes.service'
import { ReportFiltersDto } from './dto/report-filters.dto'

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

  @Get('citas')
  @Roles(Rol.ADMIN, Rol.DOCTOR)
  @ApiOperation({ summary: 'Reporte de citas (rango). DOCTOR ve solo las suyas.' })
  citas(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
    return this.service.citas(u.consultorioId, u.rol, u.sub, f)
  }

  @Get('cobranzas')
  @Roles(Rol.ADMIN, Rol.DOCTOR)
  @ApiOperation({ summary: 'Reporte de cobranzas (pagos del rango).' })
  cobranzas(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
    return this.service.cobranzas(u.consultorioId, u.rol, u.sub, f)
  }

  @Get('gastos')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Reporte de gastos (ADMIN).' })
  gastos(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
    return this.service.gastos(u.consultorioId, f)
  }

  @Get('pacientes')
  @Roles(Rol.ADMIN, Rol.DOCTOR)
  @ApiOperation({ summary: 'Reporte de pacientes (rango).' })
  pacientes(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
    return this.service.pacientes(u.consultorioId, u.rol, u.sub, f)
  }

  @Get('servicios')
  @Roles(Rol.ADMIN, Rol.DOCTOR)
  @ApiOperation({ summary: 'Reporte de servicios (servicio x doctor).' })
  servicios(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
    return this.service.servicios(u.consultorioId, u.rol, u.sub, f)
  }

  @Get('aseguradoras')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Reporte por aseguradora (atenciones, ingresos, estados).' })
  aseguradoras(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
    return this.service.aseguradoras(u.consultorioId, f)
  }

  @Get('cobertura')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Reporte de cobertura: pacientes con/sin seguro.' })
  cobertura(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
    return this.service.cobertura(u.consultorioId, f)
  }
}
