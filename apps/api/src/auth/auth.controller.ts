import { Controller, Post, Body, HttpCode, HttpStatus, SetMetadata, ForbiddenException } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { RefreshDto } from './dto/refresh.dto'
import { IS_PUBLIC_KEY } from '../common/guards/jwt-auth.guard'

const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

// Limites estrictos por defecto (produccion); en dev/test se relajan por env
// para que la suite E2E (muchos logins por minuto) no se auto-bloquee.
const LOGIN_LIMIT = Number(process.env.LOGIN_RATE_LIMIT ?? 10)
const REGISTER_LIMIT = Number(process.env.REGISTER_RATE_LIMIT ?? 5)

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: REGISTER_LIMIT } })
  @ApiOperation({ summary: 'Registrar nuevo consultorio con usuario admin' })
  register(@Body() dto: RegisterDto) {
    // Para el piloto el registro publico se cierra con REGISTRO_ABIERTO=false
    if (process.env.REGISTRO_ABIERTO === 'false') {
      throw new ForbiddenException('El registro publico esta deshabilitado')
    }
    return this.authService.register(dto)
  }

  @Public()
  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: LOGIN_LIMIT } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login de usuario' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refrescar access token' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken)
  }
}
