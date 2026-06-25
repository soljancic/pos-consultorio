import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { ProductosService, CreateProductoDto, UpdateProductoDto } from './productos.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('Productos')
@ApiBearerAuth()
@Controller('productos')
export class ProductosController {
  constructor(private service: ProductosService) {}

  // Picker de venta (rol operativo): solo vendibles. Ruta literal antes de :id.
  @Get('vendibles')
  vendibles(@CurrentUser() user: JwtPayload, @Query('search') search?: string) {
    return this.service.vendibles(user.consultorioId, search)
  }

  // Categorias existentes (distinct) para el combobox del formulario de producto.
  @Get('categorias')
  @Roles(Rol.ADMIN)
  categorias(@CurrentUser() user: JwtPayload) {
    return this.service.categorias(user.consultorioId)
  }

  @Get()
  @Roles(Rol.ADMIN)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('todos') todos?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(user.consultorioId, {
      incluirInactivos: todos === 'true',
      search: search || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Post()
  @Roles(Rol.ADMIN)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProductoDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductoDto) {
    return this.service.update(user.consultorioId, id, dto)
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(user.consultorioId, id)
  }
}
