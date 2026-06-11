import { Controller, Post, Body, HttpCode, HttpStatus, SetMetadata, ForbiddenException } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { RefreshDto } from './dto/refresh.dto'
import { GoogleLoginDto } from './dto/google-login.dto'
import { SolicitarPasswordDto, EstablecerPasswordDto } from './dto/password.dto'
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

  @Public()
  @Post('google')
  @Throttle({ default: { ttl: 60_000, limit: LOGIN_LIMIT } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login con Google OAuth' })
  loginGoogle(@Body() dto: GoogleLoginDto) {
    return this.authService.loginGoogle(dto.credential)
  }

  @Public()
  @Post('password/solicitar')
  @Throttle({ default: { ttl: 60_000, limit: LOGIN_LIMIT } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Olvido de contraseña: envia email con link de un solo uso (respuesta identica exista o no la cuenta)' })
  solicitarPassword(@Body() dto: SolicitarPasswordDto) {
    return this.authService.solicitarPassword(dto.email)
  }

  @Public()
  @Post('password/establecer')
  @Throttle({ default: { ttl: 60_000, limit: LOGIN_LIMIT } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Definir la contraseña con un token vigente (alta de usuario o reset)' })
  establecerPassword(@Body() dto: EstablecerPasswordDto) {
    return this.authService.establecerPassword(dto.token, dto.password)
  }
}
