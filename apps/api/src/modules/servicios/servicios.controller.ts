import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { ServiciosService, CreateServicioDto, UpdateServicioDto } from './servicios.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

@ApiTags('Servicios')
@ApiBearerAuth()
@Controller('servicios')
export class ServiciosController {
  constructor(private service: ServiciosService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query('todos') todos?: string) {
    return this.service.findAll(user.consultorioId, todos === 'true')
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateServicioDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Put(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateServicioDto) {
    return this.service.update(user.consultorioId, id, dto)
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(user.consultorioId, id)
  }
}
