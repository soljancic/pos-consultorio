import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { OAuth2Client } from 'google-auth-library'
import { randomBytes, createHash, randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../modules/mail/mail.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { Rol } from '@pos/types'
import * as argon2 from 'argon2'

// Solo dev/tests: expone el token en la respuesta para los gates.
// En produccion JAMAS (el unico canal es el email).
const MAIL_DEBUG = process.env.NODE_ENV !== 'production' && process.env.MAIL_DEBUG === '1'

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

// Contexto opcional de la request (para auditar la sesion); no es de confianza.
export interface SessionContext {
  userAgent?: string
  ip?: string
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  async register(dto: RegisterDto, ctx?: SessionContext) {
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
    return this.buildTokens(usuario.id, usuario.email, usuario.rol, consultorio.id, ctx)
  }

  async login(dto: LoginDto, ctx?: SessionContext) {
    const usuario = await this.prisma.usuario.findFirst({
      // Email case-insensitive: el correo no distingue mayus/minus al loguear
      where: { email: { equals: dto.email.trim(), mode: 'insensitive' }, activo: true },
      include: { consultorio: { select: { nombre: true, trabajaConAseguradoras: true, vendeProductos: true } } },
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
      ctx,
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
        vendeProductos: usuario.consultorio.vendeProductos,
      },
    }
  }

  async loginGoogle(credential: string, ctx?: SessionContext) {
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
      // Solo aceptamos emails verificados por Google: un email sin verificar no
      // prueba la posesion de esa casilla y podria suplantar a un usuario existente.
      if (payload.email_verified === false) throw new Error('Email de Google no verificado')
      email = payload.email.toLowerCase()
      nombre = payload.name ?? payload.email
    } catch {
      throw new UnauthorizedException('Token de Google invalido')
    }

    const usuario = await this.prisma.usuario.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, activo: true },
      include: { consultorio: { select: { nombre: true, trabajaConAseguradoras: true, vendeProductos: true } } },
    })

    if (!usuario) {
      // Mensaje generico (igual que el login con password): no confirmar si
      // una cuenta existe o no a partir del email
      throw new UnauthorizedException('No se pudo iniciar sesión con esa cuenta. Si no tenés usuario, pedile al administrador que lo cree.')
    }

    const tokens = await this.buildTokens(
      usuario.id,
      usuario.email,
      usuario.rol,
      usuario.consultorioId,
      ctx,
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
        vendeProductos: usuario.consultorio.vendeProductos,
      },
    }
  }

  // Rotacion con deteccion de reuso. El refresh token es stateful: vive como
  // hash en la tabla Session. Cada uso rota el eslabon (el anterior se revoca);
  // presentar un eslabon ya revocado = senal de robo -> se mata toda la familia.
  async refresh(refreshToken: string | undefined, ctx?: SessionContext) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token invalido')

    // 1) Firma + expiracion del JWT (barato, antes de tocar la DB)
    try {
      this.jwt.verify(refreshToken, { secret: this.config.get('JWT_REFRESH_SECRET') })
    } catch {
      throw new UnauthorizedException('Refresh token invalido')
    }

    // 2) El token debe existir como sesion vigente
    const sesion = await this.prisma.session.findUnique({ where: { tokenHash: sha256(refreshToken) } })
    if (!sesion) throw new UnauthorizedException('Refresh token invalido')

    // 3) Reuso de un eslabon ya rotado/revocado: revocar la familia entera
    if (sesion.revocadoAt || sesion.expiraAt < new Date()) {
      await this.prisma.session.updateMany({
        where: { familia: sesion.familia, revocadoAt: null },
        data: { revocadoAt: new Date() },
      })
      throw new UnauthorizedException('Refresh token invalido')
    }

    // 4) Claims frescos desde la DB (un cambio de rol o una baja pegan ya)
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: sesion.usuarioId },
      select: { id: true, email: true, rol: true, activo: true, consultorioId: true },
    })
    if (!usuario || !usuario.activo) {
      await this.prisma.session.updateMany({
        where: { familia: sesion.familia, revocadoAt: null },
        data: { revocadoAt: new Date() },
      })
      throw new UnauthorizedException('Refresh token invalido')
    }

    // 5) Rotar: revocar el eslabon actual y emitir uno nuevo en la misma familia
    return this.buildTokens(
      usuario.id,
      usuario.email,
      usuario.rol,
      usuario.consultorioId,
      ctx,
      { familia: sesion.familia, revocarId: sesion.id },
    )
  }

  // Logout real: revoca la familia de la sesion presentada (este dispositivo).
  // Idempotente: sin token o token desconocido devuelve ok igual.
  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return { ok: true }
    const sesion = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      select: { familia: true },
    })
    if (sesion) {
      await this.prisma.session.updateMany({
        where: { familia: sesion.familia, revocadoAt: null },
        data: { revocadoAt: new Date() },
      })
    }
    return { ok: true }
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
      // Cambiar la contrasena cierra todas las sesiones abiertas del usuario:
      // si la cuenta estaba comprometida, los tokens del atacante dejan de servir
      this.prisma.session.updateMany({
        where: { usuarioId: registro.usuario.id, revocadoAt: null },
        data: { revocadoAt: new Date() },
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
    ctx?: SessionContext,
    // Si viene, es una rotacion: reusa la familia y revoca el eslabon anterior
    rotacion?: { familia: string; revocarId: number },
  ) {
    const payload = { sub: userId, email, rol, consultorioId }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN') || '15m',
      }),
      // jti unico: garantiza que cada refresh sea distinto (hash unico en Session)
      this.jwt.signAsync({ ...payload, jti: randomUUID() }, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') || '7d',
      }),
    ])

    // La sesion expira exactamente cuando expira el JWT (su claim exp)
    const exp = (this.jwt.decode(refreshToken) as { exp?: number } | null)?.exp
    const expiraAt = exp ? new Date(exp * 1000) : new Date(Date.now() + 7 * 24 * 3600 * 1000)

    const datosSesion = {
      usuarioId: userId,
      familia: rotacion?.familia ?? randomUUID(),
      tokenHash: sha256(refreshToken),
      userAgent: ctx?.userAgent?.slice(0, 255),
      ip: ctx?.ip?.slice(0, 100),
      expiraAt,
    }

    if (rotacion) {
      await this.prisma.$transaction([
        this.prisma.session.update({
          where: { id: rotacion.revocarId },
          data: { revocadoAt: new Date() },
        }),
        this.prisma.session.create({ data: datosSesion }),
      ])
    } else {
      await this.prisma.session.create({ data: datosSesion })
    }

    return { accessToken, refreshToken }
  }
}
