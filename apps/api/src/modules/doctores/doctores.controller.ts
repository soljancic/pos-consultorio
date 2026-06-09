import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { DoctoresService, CreateDoctorDto, CreateHorarioDto } from './doctores.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

@ApiTags('Doctores')
@ApiBearerAuth()
@Controller('doctores')
export class DoctoresController {
  constructor(private service: DoctoresService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) { return this.service.findAll(user.consultorioId) }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDoctorDto) {
    return this.service.create(user.consultorioId, dto)
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
