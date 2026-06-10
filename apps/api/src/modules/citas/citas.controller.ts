import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { CitasService, CreateCitaDto, CambiarEstadoDto } from './citas.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

@ApiTags('Citas')
@ApiBearerAuth()
@Controller('citas')
export class CitasController {
  constructor(private service: CitasService) {}

  @Get()
  @ApiOperation({ summary: 'Agenda (fecha requerida; hasta opcional para rango; doctorId opcional)' })
  findByFecha(
    @CurrentUser() user: JwtPayload,
    @Query('fecha') fecha: string,
    @Query('doctorId') doctorId?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.service.findByFecha(user.consultorioId, fecha, doctorId, hasta)
  }

  @Post()
  @ApiOperation({ summary: 'Crear cita' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCitaDto) {
    return this.service.create(user.consultorioId, user.sub, dto)
  }

  @Put(':id/estado')
  @ApiOperation({ summary: 'Cambiar estado de la cita (maquina de estados)' })
  cambiarEstado(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CambiarEstadoDto,
  ) {
    return this.service.cambiarEstado(user.consultorioId, id, dto, user.sub)
  }
}
