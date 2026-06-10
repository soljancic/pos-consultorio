import { Controller, Get, Put, Body } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { ConsultoriosService, UpdateConsultorioDto } from './consultorios.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('Consultorio')
@ApiBearerAuth()
@Controller('consultorio')
export class ConsultoriosController {
  constructor(private service: ConsultoriosService) {}

  @Get()
  getConfig(@CurrentUser() user: JwtPayload) {
    return this.service.findOne(user.consultorioId)
  }

  @Put()
  @Roles(Rol.ADMIN)
  updateConfig(@CurrentUser() user: JwtPayload, @Body() body: UpdateConsultorioDto) {
    return this.service.update(user.consultorioId, body)
  }
}
