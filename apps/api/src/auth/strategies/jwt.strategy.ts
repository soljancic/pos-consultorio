import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/decorators/current-user.decorator'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Solo alcanzable en dev: main.ts valida los secrets antes de arrancar en produccion
      secretOrKey: config.get<string>('JWT_SECRET') || 'dev-only-secret',
    })
  }

  async validate(payload: JwtPayload) {
    // Releemos rol + activo en cada request (misma query que ya haciamos para
    // activo). Asi un cambio de rol o una baja pegan al instante, sin esperar a
    // que caduque el token: el RolesGuard usa este rol fresco, no el del claim.
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: { activo: true, rol: true },
    })
    if (!usuario || !usuario.activo) throw new UnauthorizedException()
    return { ...payload, rol: usuario.rol }
  }
}
