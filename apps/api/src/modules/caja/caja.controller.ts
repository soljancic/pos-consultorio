import { Controller, Get, Post, Put, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { CajaService, AbrirCajaDto, CerrarCajaDto, RevisarCajaDto } from './caja.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('Caja')
@ApiBearerAuth()
@Controller('caja')
export class CajaController {
  constructor(private service: CajaService) {}

  @Get('hoy')
  getHoy(@CurrentUser() user: JwtPayload) { return this.service.getHoy(user.consultorioId, user.rol) }

  @Get('estado')
  @ApiOperation({ summary: 'Estado liviano del turno de hoy (chip global del shell)' })
  getEstado(@CurrentUser() user: JwtPayload) { return this.service.getEstado(user.consultorioId) }

  @Post('abrir')
  @ApiOperation({ summary: 'Abrir el turno del dia declarando la caja chica inicial' })
  abrir(@CurrentUser() user: JwtPayload, @Body() dto: AbrirCajaDto) {
    return this.service.abrir(user.consultorioId, user.sub, dto)
  }

  @Post('cerrar')
  @ApiOperation({ summary: 'Cerrar caja con arqueo ciego (declarar efectivo contado)' })
  cerrar(@CurrentUser() user: JwtPayload, @Body() dto: CerrarCajaDto) {
    return this.service.cerrar(user.consultorioId, user.sub, dto)
  }

  @Post('reabrir')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Reabrir el turno de hoy ya cerrado (descarta el arqueo)' })
  reabrir(@CurrentUser() user: JwtPayload) {
    return this.service.reabrir(user.consultorioId, user.sub)
  }

  @Put(':id/revisar')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Aprobar la revision de un cierre con diferencia' })
  revisar(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevisarCajaDto,
  ) {
    return this.service.revisar(user.consultorioId, id, dto, user.sub)
  }

  @Get('historial')
  getHistorial(
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
  ) {
    return this.service.getHistorial(user.consultorioId, desde, hasta)
  }
}
