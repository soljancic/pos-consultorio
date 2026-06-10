import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { CobrosService, RegistrarPagoDto, AjustarTotalDto } from './cobros.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

@ApiTags('Cobros')
@ApiBearerAuth()
@Controller('cobros')
export class CobrosController {
  constructor(private service: CobrosService) {}

  @Get('deudores')
  @ApiOperation({ summary: 'Pacientes con deuda real, agrupados (citas ATENDIDA/CON_DEUDA)' })
  getDeudores(@CurrentUser() user: JwtPayload) {
    return this.service.getDeudores(user.consultorioId)
  }

  @Get('deudores/resumen')
  @ApiOperation({ summary: 'Total adeudado y cantidad de pacientes deudores' })
  getDeudoresResumen(@CurrentUser() user: JwtPayload) {
    return this.service.getDeudoresResumen(user.consultorioId)
  }

  @Get('cita/:citaId')
  @ApiOperation({ summary: 'Obtener cobro de una cita' })
  findByCita(@CurrentUser() user: JwtPayload, @Param('citaId') citaId: string) {
    return this.service.findByCita(user.consultorioId, citaId)
  }

  @Put(':id/total')
  @ApiOperation({ summary: 'Ajustar el precio del cobro (descuento/recargo, auditado)' })
  ajustarTotal(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AjustarTotalDto,
  ) {
    return this.service.ajustarTotal(user.consultorioId, id, dto, user.sub)
  }

  @Post(':id/pagos')
  @ApiOperation({ summary: 'Registrar pago (total o parcial)' })
  registrarPago(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RegistrarPagoDto,
  ) {
    return this.service.registrarPago(user.consultorioId, id, dto, user.sub)
  }
}
