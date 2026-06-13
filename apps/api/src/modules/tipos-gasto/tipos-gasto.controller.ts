import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { TiposGastoService, CreateTipoGastoDto, UpdateTipoGastoDto } from './tipos-gasto.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('TiposGasto')
@ApiBearerAuth()
@Controller('tipos-gasto')
export class TiposGastoController {
  constructor(private service: TiposGastoService) {}

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
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTipoGastoDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTipoGastoDto,
  ) {
    return this.service.update(user.consultorioId, id, dto)
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(user.consultorioId, id)
  }
}
