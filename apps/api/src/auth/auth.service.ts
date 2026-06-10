import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { OAuth2Client } from 'google-auth-library'
import { PrismaService } from '../prisma/prisma.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { Rol } from '@pos/types'
import * as argon2 from 'argon2'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await argon2.hash(dto.password)

    const consultorio = await this.prisma.consultorio.create({
      data: {
        nombre: dto.consultorioNombre,
        moneda: dto.moneda || 'ARS',
        timezone: dto.timezone || 'America/Argentina/Buenos_Aires',
        usuarios: {
          create: {
            nombre: dto.adminNombre,
            email: dto.email,
            passwordHash,
            rol: Rol.ADMIN,
          },
        },
      },
      include: { usuarios: true },
    })

    const usuario = consultorio.usuarios[0]
    return this.buildTokens(usuario.id, usuario.email, usuario.rol, consultorio.id)
  }

  async login(dto: LoginDto) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { email: dto.email, activo: true },
      include: { consultorio: { select: { nombre: true } } },
    })

    if (!usuario) throw new UnauthorizedException('Credenciales invalidas')
    if (!usuario.passwordHash) throw new UnauthorizedException('Credenciales invalidas')

    const passwordValido = await argon2.verify(usuario.passwordHash, dto.password)
    if (!passwordValido) throw new UnauthorizedException('Credenciales invalidas')

    const tokens = await this.buildTokens(
      usuario.id,
      usuario.email,
      usuario.rol,
      usuario.consultorioId,
    )

    return {
      ...tokens,
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        consultorioId: usuario.consultorioId,
        consultorioNombre: usuario.consultorio.nombre,
      },
    }
  }

  async loginGoogle(credential: string) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')
    if (!clientId) {
      throw new UnauthorizedException('Google login no esta configurado')
    }

    let email: string
    let nombre: string
    try {
      const client = new OAuth2Client(clientId)
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId })
      const payload = ticket.getPayload()
      if (!payload?.email) throw new Error('Payload invalido')
      email = payload.email
      nombre = payload.name ?? payload.email
    } catch {
      throw new UnauthorizedException('Token de Google invalido')
    }

    const usuario = await this.prisma.usuario.findFirst({
      where: { email, activo: true },
      include: { consultorio: { select: { nombre: true } } },
    })

    if (!usuario) {
      throw new UnauthorizedException(`No existe una cuenta activa para ${email}. Solicita al administrador que cree tu usuario.`)
    }

    const tokens = await this.buildTokens(
      usuario.id,
      usuario.email,
      usuario.rol,
      usuario.consultorioId,
    )

    return {
      ...tokens,
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        consultorioId: usuario.consultorioId,
        consultorioNombre: usuario.consultorio.nombre,
      },
    }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      })
      return this.buildTokens(payload.sub, payload.email, payload.rol, payload.consultorioId)
    } catch {
      throw new UnauthorizedException('Refresh token invalido')
    }
  }

  private async buildTokens(
    userId: number,
    email: string,
    rol: string,
    consultorioId: number,
  ) {
    const payload = { sub: userId, email, rol, consultorioId }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN') || '15m',
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') || '7d',
      }),
    ])

    return { accessToken, refreshToken }
  }
}
