import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Rol } from '@pos/types'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PlantillasService, CreatePlantillaDto } from './plantillas.service'

@ApiTags('Plantillas de horario')
@ApiBearerAuth()
@Controller('plantillas-horario')
export class PlantillasController {
  constructor(private service: PlantillasService) {}

  @Get()
  @ApiOperation({ summary: 'Plantillas de horario del consultorio' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.consultorioId)
  }

  @Post()
  @Roles(Rol.ADMIN, Rol.DOCTOR)
  @ApiOperation({ summary: 'Crear plantilla nombrada (quienes gestionan el calendario)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePlantillaDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Eliminar plantilla (soft, ADMIN)' })
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(user.consultorioId, id)
  }
}
