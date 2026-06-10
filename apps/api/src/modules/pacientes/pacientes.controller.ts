import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { PacientesService, CreatePacienteDto, UpdatePacienteDto } from './pacientes.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

@ApiTags('Pacientes')
@ApiBearerAuth()
@Controller('pacientes')
export class PacientesController {
  constructor(private service: PacientesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar pacientes (con busqueda)' })
  findAll(@CurrentUser() user: JwtPayload, @Query('search') search?: string) {
    return this.service.findAll(user.consultorioId, search)
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
