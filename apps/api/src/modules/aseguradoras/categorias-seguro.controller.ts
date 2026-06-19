import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AseguradorasService, CreateCategoriaSeguroDto, UpdateCategoriaSeguroDto } from './aseguradoras.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('CategoriasSeguro')
@ApiBearerAuth()
@Controller('categorias-seguro')
export class CategoriasSeguroController {
  constructor(private service: AseguradorasService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('aseguradoraId', ParseIntPipe) aseguradoraId: number,
    @Query('soloActivas') soloActivas?: string,
  ) {
    return this.service.findCategorias(user.consultorioId, aseguradoraId, soloActivas === 'true')
  }

  @Post()
  @Roles(Rol.ADMIN)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCategoriaSeguroDto) {
    return this.service.createCategoria(user.consultorioId, dto)
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoriaSeguroDto) {
    return this.service.updateCategoria(user.consultorioId, id, dto)
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.removeCategoria(user.consultorioId, id)
  }
}
