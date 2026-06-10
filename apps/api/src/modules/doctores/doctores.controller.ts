import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { DoctoresService, CreateDoctorDto, UpdateDoctorDto, CreateHorarioDto } from './doctores.service'
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
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.service.update(user.consultorioId, id, dto)
  }

  @Post(':id/horarios')
  addHorario(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: CreateHorarioDto) {
    return this.service.addHorario(user.consultorioId, id, dto)
  }

  @Get(':id/disponibilidad')
  getDisponibilidad(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('fecha') fecha: string,
  ) {
    return this.service.getDisponibilidad(user.consultorioId, id, fecha)
  }
}
