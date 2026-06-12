import { Controller, Get, Put, Post, Body, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
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

  @Post('qr')
  @Roles(Rol.ADMIN)
  @UseInterceptors(FileInterceptor('archivo'))
  @ApiOperation({ summary: 'Subir el QR de pagos a Cloudinary y guardar la URL' })
  subirQr(@CurrentUser() user: JwtPayload, @UploadedFile() archivo?: Express.Multer.File) {
    if (!archivo) throw new BadRequestException('Falta el archivo del QR')
    return this.service.subirQr(user.consultorioId, archivo)
  }
}
