import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { OAuth2Client } from 'google-auth-library'
import { randomBytes, createHash } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../modules/mail/mail.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { Rol } from '@pos/types'
import * as argon2 from 'argon2'

// Solo dev/tests: expone el token en la respuesta para los gates.
// En produccion JAMAS (el unico canal es el email).
const MAIL_DEBUG = process.env.NODE_ENV !== 'production' && process.env.MAIL_DEBUG === '1'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
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
            email: dto.email.trim().toLowerCase(),
            passwordHash,
            rol: Rol.ADMIN,
          },
        },
        // Catalogos default para que Gastos funcione desde el primer dia
        tiposGasto: {
          create: [
            { nombre: 'Insumos' }, { nombre: 'Sueldos' }, { nombre: 'Alquiler' },
            { nombre: 'Servicios' }, { nombre: 'Impuestos' }, { nombre: 'Otros' },
          ],
        },
        // Cuentas/formas de pago: sirven para cobros y gastos. esEfectivo
        // define cuales participan del arqueo de efectivo.
        tiposCuenta: {
          create: [
            { nombre: 'Efectivo', esEfectivo: true },
            { nombre: 'QR' }, { nombre: 'Tarjeta' },
            { nombre: 'Vales' },
          ],
        },
      },
      include: { usuarios: true },
    })

    const usuario = consultorio.usuarios[0]
    return this.buildTokens(usuario.id, usuario.email, usuario.rol, consultorio.id)
  }

  async login(dto: LoginDto) {
    const usuario = await this.prisma.usuario.findFirst({
      // Email case-insensitive: el correo no distingue mayus/minus al loguear
      where: { email: { equals: dto.email.trim(), mode: 'insensitive' }, activo: true },
      include: { consultorio: { select: { nombre: true, trabajaConAseguradoras: true } } },
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
        trabajaConAseguradoras: usuario.consultorio.trabajaConAseguradoras,
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
      email = payload.email.toLowerCase()
      nombre = payload.name ?? payload.email
    } catch {
      throw new UnauthorizedException('Token de Google invalido')
    }

    const usuario = await this.prisma.usuario.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, activo: true },
      include: { consultorio: { select: { nombre: true, trabajaConAseguradoras: true } } },
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
        trabajaConAseguradoras: usuario.consultorio.trabajaConAseguradoras,
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

  // E2-M10: token de un solo uso para definir/restablecer contrasena.
  // Reutilizado por usuarios.service para la invitacion del alta.
  async crearTokenPassword(usuarioId: number) {
    const token = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    await this.prisma.$transaction([
      // Un token vigente por usuario: los anteriores quedan invalidados
      this.prisma.passwordToken.updateMany({
        where: { usuarioId, usadoAt: null },
        data: { usadoAt: new Date() },
      }),
      this.prisma.passwordToken.create({
        data: { usuarioId, tokenHash, expiraAt: new Date(Date.now() + 48 * 3600 * 1000) },
      }),
    ])
    return token
  }

  // Respuesta IDENTICA exista o no el email (cero enumeracion de cuentas)
  async solicitarPassword(email: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' }, activo: true },
      include: { consultorio: { select: { nombre: true } } },
    })
    if (!usuario) return { ok: true }

    const token = await this.crearTokenPassword(usuario.id)
    void this.mail.enviar(
      usuario.email,
      'Restablecer contraseña',
      this.mail.htmlReset(usuario.nombre, this.mail.linkEstablecerPassword(token)),
      usuario.consultorio?.nombre,
    )
    return MAIL_DEBUG ? { ok: true, devToken: token } : { ok: true }
  }

  async establecerPassword(token: string, password: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const registro = await this.prisma.passwordToken.findUnique({
      where: { tokenHash },
      include: { usuario: { select: { id: true, consultorioId: true, activo: true } } },
    })
    if (!registro || registro.usadoAt || registro.expiraAt < new Date() || !registro.usuario.activo) {
      throw new BadRequestException('El enlace no es válido o ya expiró. Solicitá uno nuevo.')
    }

    const passwordHash = await argon2.hash(password)
    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id: registro.usuario.id },
        data: { passwordHash },
      }),
      this.prisma.passwordToken.update({
        where: { id: registro.id },
        data: { usadoAt: new Date() },
      }),
      this.prisma.log.create({
        data: {
          consultorioId: registro.usuario.consultorioId,
          usuarioId: registro.usuario.id,
          entidad: 'Usuario',
          entidadId: registro.usuario.id,
          accion: 'UPDATE',
          payloadDespues: { evento: 'password-establecida' },
        },
      }),
    ])
    return { ok: true }
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
