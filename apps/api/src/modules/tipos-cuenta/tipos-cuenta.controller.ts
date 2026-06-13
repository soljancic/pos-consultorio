import { Controller, Get, Post, Put, Body, Param, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { TiposCuentaService, CreateTipoCuentaDto, UpdateTipoCuentaDto } from './tipos-cuenta.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('TiposCuenta')
@ApiBearerAuth()
@Controller('tipos-cuenta')
export class TiposCuentaController {
  constructor(private service: TiposCuentaService) {}

  // Cualquier rol operativo: dropdown de alta de gasto
  @Get('activos')
  activos(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.consultorioId, false)
  }

  @Get()
  @Roles(Rol.ADMIN)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.consultorioId, true)
  }

  @Post()
  @Roles(Rol.ADMIN)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTipoCuentaDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTipoCuentaDto,
  ) {
    return this.service.update(user.consultorioId, id, dto)
  }
}
