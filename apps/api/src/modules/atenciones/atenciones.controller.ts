import { Controller, Get, Put, Body, Param } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { AtencionesService, UpsertAtencionDto } from './atenciones.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

@ApiTags('Atenciones')
@ApiBearerAuth()
@Controller('atenciones')
export class AtencionesController {
  constructor(private service: AtencionesService) {}

  @Get('cita/:citaId')
  @ApiOperation({ summary: 'Atencion registrada de una cita' })
  findByCita(@CurrentUser() user: JwtPayload, @Param('citaId') citaId: string) {
    return this.service.findByCita(user.consultorioId, citaId)
  }

  @Put('cita/:citaId')
  @ApiOperation({ summary: 'Registrar o actualizar la atencion de una cita' })
  upsert(
    @CurrentUser() user: JwtPayload,
    @Param('citaId') citaId: string,
    @Body() dto: UpsertAtencionDto,
  ) {
    return this.service.upsert(user.consultorioId, citaId, dto, user.sub)
  }
}
