import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import {
  DisponibilidadesService,
  CreateDisponibilidadDto,
  UpdateDisponibilidadDto,
  type Alcance,
} from './disponibilidades.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

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
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Crear bloque u horario repetible (serie semanal)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDisponibilidadDto) {
    return this.service.create(user.consultorioId, user.sub, dto)
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Editar bloque (alcance: uno | serie | desde)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDisponibilidadDto,
    @Query('alcance') alcance?: Alcance,
  ) {
    return this.service.update(user.consultorioId, id, user.sub, dto, alcance ?? 'uno')
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Eliminar bloque (soft; alcance: uno | serie | desde)' })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query('alcance') alcance?: Alcance,
  ) {
    return this.service.remove(user.consultorioId, id, user.sub, alcance ?? 'uno')
  }
}
