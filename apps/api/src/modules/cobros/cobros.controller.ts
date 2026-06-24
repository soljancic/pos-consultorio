import { Controller, Get, Post, Put, Body, Param, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { CobrosService, RegistrarPagoDto, AjustarTotalDto, AnularPagoDto } from './cobros.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

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
  findByCita(@CurrentUser() user: JwtPayload, @Param('citaId', ParseIntPipe) citaId: number) {
    return this.service.findByCita(user.consultorioId, citaId)
  }

  @Put(':id/total')
  @ApiOperation({ summary: 'Ajustar el precio del cobro (descuento/recargo, auditado)' })
  ajustarTotal(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AjustarTotalDto,
  ) {
    return this.service.ajustarTotal(user.consultorioId, id, dto, user.sub)
  }

  @Post(':id/pagos')
  @ApiOperation({ summary: 'Registrar pago (total o parcial)' })
  registrarPago(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarPagoDto,
  ) {
    return this.service.registrarPago(user.consultorioId, id, dto, user.sub)
  }

  @Post('pagos/:id/anular')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Anular un pago con asiento de reversa (nunca se borra)' })
  anularPago(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularPagoDto,
  ) {
    return this.service.anularPago(user.consultorioId, id, dto, user.sub)
  }

  @Post('cita/:citaId/devolver')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Devolver (reversar) todos los pagos de prepago de una cita' })
  devolverPrepago(
    @CurrentUser() user: JwtPayload,
    @Param('citaId', ParseIntPipe) citaId: number,
    @Body() body: { motivo?: string },
  ) {
    return this.service.reversarPagosDeCita(user.consultorioId, citaId, user.sub, body?.motivo)
  }
}
