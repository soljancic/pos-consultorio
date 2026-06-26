import { Controller, Get, Post, Put, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Rol } from '@pos/types'
import { Roles } from '../../common/decorators/roles.decorator'
import { CitasService, CreateCitaDto, CambiarEstadoDto, ReprogramarCitaDto, EditarCitaDto } from './citas.service'
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
    return this.service.findByFecha(
      user.consultorioId,
      fecha,
      doctorId ? Number(doctorId) : undefined,
      hasta,
      user.rol,
      user.sub,
    )
  }

  @Post()
  @ApiOperation({ summary: 'Crear cita' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCitaDto) {
    return this.service.create(user.consultorioId, user.sub, dto)
  }

  @Post('no-shows/procesar')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Barrer citas vencidas a NO_ASISTIO ahora (el cron lo hace cada 30 min)' })
  procesarNoShows(@CurrentUser() user: JwtPayload) {
    return this.service.procesarNoShows(user.consultorioId)
  }

  @Put(':id/estado')
  @ApiOperation({ summary: 'Cambiar estado de la cita (maquina de estados)' })
  cambiarEstado(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoDto,
  ) {
    return this.service.cambiarEstado(user.consultorioId, id, dto, user.sub)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una cita (incluye snapshot de cobertura: usaSeguro, montoPaciente, montoAseguradora)' })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findOne(user.consultorioId, id)
  }

  @Get(':id/token-reprogramacion')
  @ApiOperation({ summary: 'Token para el link de auto-reprogramacion (lo crea si no existe)' })
  tokenReprogramacion(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.tokenReprogramacion(user.consultorioId, id)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Reprogramar cita (editar fecha/hora/doctor en el lugar)' })
  reprogramar(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReprogramarCitaDto,
  ) {
    return this.service.reprogramar(user.consultorioId, id, dto, user.sub)
  }

  @Put(':id/editar')
  @ApiOperation({ summary: 'Editar cita (servicio y/o seguro); recalcula el cobro' })
  editar(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarCitaDto,
  ) {
    return this.service.editarCita(user.consultorioId, id, dto, user.sub)
  }
}
