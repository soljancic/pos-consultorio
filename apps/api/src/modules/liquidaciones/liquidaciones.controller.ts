import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { CambiarEstadoLiquidacionDto, LiquidacionesService } from './liquidaciones.service'
import { LiquidacionFiltersDto } from './dto/liquidacion-filters.dto'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('Liquidaciones')
@ApiBearerAuth()
@Controller('liquidaciones')
export class LiquidacionesController {
  constructor(private service: LiquidacionesService) {}

  @Get()
  @Roles(Rol.ADMIN)
  findAll(@CurrentUser() user: JwtPayload, @Query() f: LiquidacionFiltersDto) {
    return this.service.findAll(user.consultorioId, f)
  }

  @Patch(':id/estado')
  @Roles(Rol.ADMIN)
  cambiarEstado(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoLiquidacionDto,
  ) {
    return this.service.cambiarEstado(user.consultorioId, user.sub, id, dto)
  }
}
