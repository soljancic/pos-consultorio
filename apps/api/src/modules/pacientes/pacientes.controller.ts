import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { PacientesService, CreatePacienteDto, UpdatePacienteDto, SetActivoDto } from './pacientes.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

@ApiTags('Pacientes')
@ApiBearerAuth()
@Controller('pacientes')
export class PacientesController {
  constructor(private service: PacientesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar pacientes paginado (con busqueda)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('incluirInactivos') incluirInactivos?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(user.consultorioId, {
      search,
      incluirInactivos: incluirInactivos === 'true',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Get('coincidencias')
  @ApiOperation({ summary: 'Avisar si ya existe un paciente con ese CI, telefono o correo (no bloquea)' })
  coincidencias(
    @CurrentUser() user: JwtPayload,
    @Query('dni') dni?: string,
    @Query('telefono') telefono?: string,
    @Query('email') email?: string,
    @Query('excluirId') excluirId?: string,
  ) {
    return this.service.coincidencias(user.consultorioId, {
      dni,
      telefono,
      email,
      excluirId: excluirId ? Number(excluirId) : undefined,
    })
  }

  @Get(':id/portal-token')
  @ApiOperation({ summary: 'Token para el link de reserva precargado (lo crea si no existe)' })
  portalToken(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.portalToken(user.consultorioId, id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ficha completa del paciente' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(user.consultorioId, id)
  }

  @Post()
  @ApiOperation({ summary: 'Crear paciente' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePacienteDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Put(':id/activo')
  @ApiOperation({ summary: 'Archivar / reactivar paciente (activo:false/true)' })
  setActivo(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetActivoDto,
  ) {
    return this.service.setActivo(user.consultorioId, id, dto.activo, user.sub)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar paciente' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePacienteDto,
  ) {
    return this.service.update(user.consultorioId, id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar paciente (soft delete)' })
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.softDelete(user.consultorioId, id)
  }
}
