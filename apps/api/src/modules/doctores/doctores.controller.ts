import { Controller, Get, Post, Put, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Rol } from '@pos/types'
import { Roles } from '../../common/decorators/roles.decorator'
import { DoctoresService, CreateDoctorDto, UpdateDoctorDto, CreateHorarioDto, SetServiciosDto } from './doctores.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

@ApiTags('Doctores')
@ApiBearerAuth()
@Controller('doctores')
export class DoctoresController {
  constructor(private service: DoctoresService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query('todos') todos?: string) {
    return this.service.findAll(user.consultorioId, todos === 'true')
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDoctorDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Put(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDoctorDto) {
    return this.service.update(user.consultorioId, id, dto)
  }

  @Put(':id/servicios')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Definir que servicios atiende el doctor (lista vacia = todos)' })
  setServicios(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetServiciosDto,
  ) {
    return this.service.setServicios(user.consultorioId, id, dto.servicioIds)
  }

  @Post(':id/horarios')
  addHorario(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateHorarioDto) {
    return this.service.addHorario(user.consultorioId, id, dto)
  }

  @Get(':id/disponibilidad')
  getDisponibilidad(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query('fecha') fecha: string,
    @Query('duracionMin') duracionMin?: string,
  ) {
    return this.service.getDisponibilidad(
      user.consultorioId,
      id,
      fecha,
      duracionMin ? Number(duracionMin) : undefined,
    )
  }
}
