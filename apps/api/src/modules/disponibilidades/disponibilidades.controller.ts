import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import {
  DisponibilidadesService,
  CreateDisponibilidadDto,
  UpdateDisponibilidadDto,
  type Alcance,
} from './disponibilidades.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

// Sin @Roles aca: el service valida ADMIN o el propio doctor (Doctor.usuarioId)
@ApiTags('Disponibilidades')
@ApiBearerAuth()
@Controller('disponibilidades')
export class DisponibilidadesController {
  constructor(private service: DisponibilidadesService) {}

  @Get()
  @ApiOperation({ summary: 'Bloques del calendario de atencion en un rango' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('doctorId') doctorId?: string,
  ) {
    return this.service.findAll(
      user.consultorioId,
      desde,
      hasta,
      doctorId ? Number(doctorId) : undefined,
    )
  }

  @Post()
  @ApiOperation({ summary: 'Crear bloque u horario repetible (ADMIN o el propio doctor)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDisponibilidadDto) {
    return this.service.create(user.consultorioId, user.sub, user.rol, dto)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Editar bloque (alcance: uno | serie | desde)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDisponibilidadDto,
    @Query('alcance') alcance?: Alcance,
  ) {
    return this.service.update(user.consultorioId, id, user.sub, user.rol, dto, alcance ?? 'uno')
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar bloque (soft; alcance: uno | serie | desde)' })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query('alcance') alcance?: Alcance,
  ) {
    return this.service.remove(user.consultorioId, id, user.sub, user.rol, alcance ?? 'uno')
  }
}
