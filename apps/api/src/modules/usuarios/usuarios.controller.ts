import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { UsuariosService, CreateUsuarioDto, UpdateUsuarioDto } from './usuarios.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private service: UsuariosService) {}

  @Get()
  @Roles(Rol.ADMIN)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.consultorioId)
  }

  @Post()
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Crear usuario' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateUsuarioDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Editar usuario (password opcional)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateUsuarioDto,
  ) {
    return this.service.update(user.consultorioId, id, dto)
  }
}
