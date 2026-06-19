import { Controller, Get, Put, Body, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AseguradorasService, SetTarifasDto } from './aseguradoras.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('TarifasCobertura')
@ApiBearerAuth()
@Controller('tarifas-cobertura')
export class TarifasCoberturaController {
  constructor(private service: AseguradorasService) {}

  @Get()
  @Roles(Rol.ADMIN)
  findAll(@CurrentUser() user: JwtPayload, @Query('categoriaSeguroId', ParseIntPipe) categoriaSeguroId: number) {
    return this.service.findTarifas(user.consultorioId, categoriaSeguroId)
  }

  @Put()
  @Roles(Rol.ADMIN)
  setTarifas(@CurrentUser() user: JwtPayload, @Body() dto: SetTarifasDto) {
    return this.service.setTarifas(user.consultorioId, dto)
  }
}
