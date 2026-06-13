import { Controller, Get, Post, Put, Body, Param, Query, ParseIntPipe, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Rol } from '@pos/types'
import { Roles } from '../../common/decorators/roles.decorator'
import { DoctoresService, CreateDoctorDto, UpdateDoctorDto, CreateHorarioDto, SetServiciosDto } from './doctores.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

@ApiTags('Doctores')
@ApiBearerAuth()
@Controller('doctores')
export class DoctoresController {
  constructor(private service: DoctoresService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query('todos') todos?: string) {
    return this.service.findAll(user.consultorioId, todos === 'true')
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDoctorDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Put(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDoctorDto) {
    return this.service.update(user.consultorioId, id, dto)
  }

  @Put(':id/servicios')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Definir que servicios atiende el doctor (lista vacia = todos)' })
  setServicios(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetServiciosDto,
  ) {
    return this.service.setServicios(user.consultorioId, id, dto.servicioIds, dto.precios)
  }

  @Post(':id/foto')
  @Roles(Rol.ADMIN)
  @UseInterceptors(FileInterceptor('archivo'))
  @ApiOperation({ summary: 'Subir la foto del doctor a Cloudinary y guardar la URL' })
  subirFoto(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() archivo?: Express.Multer.File,
  ) {
    if (!archivo) throw new BadRequestException('Falta el archivo de la foto')
    return this.service.subirFoto(user.consultorioId, id, archivo)
  }

  @Post(':id/horarios')
  addHorario(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateHorarioDto) {
    return this.service.addHorario(user.consultorioId, id, dto)
  }

  @Get(':id/disponibilidad')
  getDisponibilidad(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query('fecha') fecha: string,
    @Query('duracionMin') duracionMin?: string,
  ) {
    return this.service.getDisponibilidad(
      user.consultorioId,
      id,
      fecha,
      duracionMin ? Number(duracionMin) : undefined,
    )
  }
}
