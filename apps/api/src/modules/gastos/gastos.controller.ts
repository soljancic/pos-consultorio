import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { CategoriaGasto } from '@prisma/client'
import { GastosService, CreateGastoDto, UpdateGastoDto } from './gastos.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('Gastos')
@ApiBearerAuth()
@Controller('gastos')
export class GastosController {
  constructor(private service: GastosService) {}

  // Ruta literal antes que la parametrizada (regla NestJS del proyecto)
  @Get('resumen')
  @ApiOperation({ summary: 'Total y desglose por categoria en un rango' })
  resumen(
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.service.resumen(user.consultorioId, desde, hasta)
  }

  @Get()
  @ApiOperation({ summary: 'Listar gastos (filtros: desde, hasta, categoria)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('categoria') categoria?: CategoriaGasto,
  ) {
    return this.service.findAll(user.consultorioId, desde, hasta, categoria)
  }

  @Post()
  @ApiOperation({ summary: 'Registrar gasto (cualquier rol operativo)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateGastoDto) {
    return this.service.create(user.consultorioId, user.sub, dto)
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Editar gasto (solo ADMIN)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGastoDto,
  ) {
    return this.service.update(user.consultorioId, id, user.sub, dto)
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Borrar gasto (soft, solo ADMIN)' })
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(user.consultorioId, id, user.sub)
  }
}
