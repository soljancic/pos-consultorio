import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { CobrosService, RegistrarPagoDto } from './cobros.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

@ApiTags('Cobros')
@ApiBearerAuth()
@Controller('cobros')
export class CobrosController {
  constructor(private service: CobrosService) {}

  @Get('deudores')
  @ApiOperation({ summary: 'Listar todos los cobros con saldo pendiente' })
  getDeudores(@CurrentUser() user: JwtPayload) {
    return this.service.getDeudores(user.consultorioId)
  }

  @Get('cita/:citaId')
  @ApiOperation({ summary: 'Obtener cobro de una cita' })
  findByCita(@CurrentUser() user: JwtPayload, @Param('citaId') citaId: string) {
    return this.service.findByCita(user.consultorioId, citaId)
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
