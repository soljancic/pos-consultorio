import { Controller, Get, Post, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { CajaService } from './caja.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

@ApiTags('Caja')
@ApiBearerAuth()
@Controller('caja')
export class CajaController {
  constructor(private service: CajaService) {}

  @Get('hoy')
  getHoy(@CurrentUser() user: JwtPayload) { return this.service.getHoy(user.consultorioId) }

  @Post('cerrar')
  cerrar(@CurrentUser() user: JwtPayload) { return this.service.cerrar(user.consultorioId, user.sub) }

  @Get('historial')
  getHistorial(
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
  ) {
    return this.service.getHistorial(user.consultorioId, desde, hasta)
  }
}
