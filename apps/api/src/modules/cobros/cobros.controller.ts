import { Controller, Get, Post, Put, Body, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { CobrosService, RegistrarPagoDto, AjustarTotalDto, AnularPagoDto, DevolverPrepagoDto, SetLineasProductoDto, CrearVentaDirectaDto } from './cobros.service'
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
    @Body() dto: DevolverPrepagoDto,
  ) {
    return this.service.reversarPagosDeCita(user.consultorioId, citaId, user.sub, dto.motivo)
  }

  @Post('detalle/:detalleId/devolver')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Deshacer la venta de un item: devuelve stock y revierte la plata del item' })
  devolverDetalle(
    @CurrentUser() user: JwtPayload,
    @Param('detalleId', ParseIntPipe) detalleId: number,
  ) {
    return this.service.devolverDetalle(user.consultorioId, detalleId, user.sub)
  }

  @Post('venta-directa')
  @ApiOperation({ summary: 'Crear una venta directa de productos (sin cita)' })
  crearVentaDirecta(@CurrentUser() user: JwtPayload, @Body() dto: CrearVentaDirectaDto) {
    return this.service.crearVentaDirecta(user.consultorioId, dto, user.sub)
  }

  @Get('ventas-detalle')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Detalle de ventas de productos (linea por linea), para devoluciones' })
  listarVentasDetalle(
    @CurrentUser() user: JwtPayload,
    @Query('q') q?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listarDetalleVentas(user.consultorioId, {
      q: q || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un cobro por id (con detalles)' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(user.consultorioId, id)
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

  @Put(':id/lineas')
  @ApiOperation({ summary: 'Editar las lineas de producto de un cobro (antes de confirmar)' })
  setProductos(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetLineasProductoDto,
  ) {
    return this.service.setProductos(user.consultorioId, id, dto, user.sub)
  }
}
