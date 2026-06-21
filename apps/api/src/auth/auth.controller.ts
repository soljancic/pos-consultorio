import { Controller, Post, Body, Req, Res, HttpCode, HttpStatus, SetMetadata, ForbiddenException } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { AuthService, SessionContext } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { GoogleLoginDto } from './dto/google-login.dto'
import { SolicitarPasswordDto, EstablecerPasswordDto } from './dto/password.dto'
import { IS_PUBLIC_KEY } from '../common/guards/jwt-auth.guard'

const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

// Limites estrictos por defecto (produccion); en dev/test se relajan por env
// para que la suite E2E (muchos logins por minuto) no se auto-bloquee.
const LOGIN_LIMIT = Number(process.env.LOGIN_RATE_LIMIT ?? 10)
const REGISTER_LIMIT = Number(process.env.REGISTER_RATE_LIMIT ?? 5)

// El refresh token viaja SOLO en una cookie httpOnly (fuera del alcance de JS:
// un XSS no lo puede exfiltrar). web y API comparten sitio (toptech.com.bo), asi
// que SameSite=Lax basta y no la bloquea Safari/iOS. Scope acotado a /auth.
const REFRESH_COOKIE = 'refresh'
const REFRESH_PATH = '/api/v1/auth'
// Debe seguir a JWT_REFRESH_EXPIRES_IN (default 7d): es la vida del refresh.
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function refreshCookieOpts() {
  return {
    httpOnly: true,
    // En dev (http://localhost) Secure impediria guardar la cookie
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: REFRESH_PATH,
  }
}

function ctxDeRequest(req: Request): SessionContext {
  return { userAgent: req.headers['user-agent'], ip: req.ip }
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, { ...refreshCookieOpts(), maxAge: REFRESH_MAX_AGE_MS })
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOpts())
  }

  @Public()
  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: REGISTER_LIMIT } })
  @ApiOperation({ summary: 'Registrar nuevo consultorio con usuario admin' })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Para el piloto el registro publico se cierra con REGISTRO_ABIERTO=false
    if (process.env.REGISTRO_ABIERTO === 'false') {
      throw new ForbiddenException('El registro publico esta deshabilitado')
    }
    const { refreshToken, ...rest } = await this.authService.register(dto, ctxDeRequest(req))
    this.setRefreshCookie(res, refreshToken)
    return rest
  }

  @Public()
  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: LOGIN_LIMIT } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login de usuario' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...rest } = await this.authService.login(dto, ctxDeRequest(req))
    this.setRefreshCookie(res, refreshToken)
    return rest
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: LOGIN_LIMIT } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refrescar access token (rota la cookie de refresh)' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined
    const { refreshToken, ...rest } = await this.authService.refresh(token, ctxDeRequest(req))
    this.setRefreshCookie(res, refreshToken)
    return rest
  }

  @Public()
  @Post('google')
  @Throttle({ default: { ttl: 60_000, limit: LOGIN_LIMIT } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login con Google OAuth' })
  async loginGoogle(@Body() dto: GoogleLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...rest } = await this.authService.loginGoogle(dto.credential, ctxDeRequest(req))
    this.setRefreshCookie(res, refreshToken)
    return rest
  }

  // Publico a proposito: poder cerrar sesion aunque el access token ya expiro.
  // La cookie es SameSite=Lax, asi que un POST cross-site no la manda (no hay
  // CSRF de logout). Revoca la familia de la sesion y borra la cookie.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesion: revoca la sesion en el server y borra la cookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined)
    this.clearRefreshCookie(res)
    return { ok: true }
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
