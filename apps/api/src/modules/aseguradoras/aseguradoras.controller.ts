import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AseguradorasService, CreateAseguradoraDto, UpdateAseguradoraDto } from './aseguradoras.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('Aseguradoras')
@ApiBearerAuth()
@Controller('aseguradoras')
export class AseguradorasController {
  constructor(private service: AseguradorasService) {}

  // Dropdown de seleccion (pacientes/citas en F2): cualquier rol operativo
  @Get('activas')
  activas(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.consultorioId, false)
  }

  @Get()
  @Roles(Rol.ADMIN)
  findAll(@CurrentUser() user: JwtPayload, @Query('todos') todos?: string) {
    return this.service.findAll(user.consultorioId, todos === 'true')
  }

  @Post()
  @Roles(Rol.ADMIN)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAseguradoraDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAseguradoraDto) {
    return this.service.update(user.consultorioId, id, dto)
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(user.consultorioId, id)
  }
}
