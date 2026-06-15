import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsEmail, MinLength, IsIn, IsOptional, IsBoolean, IsInt } from 'class-validator'
import { randomBytes } from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { AuthService } from '../../auth/auth.service'
import * as argon2 from 'argon2'
import { Rol, Prisma } from '@prisma/client'

const ROLES = ['ADMIN', 'SECRETARIA', 'DOCTOR', 'CAJA'] as const

// Solo dev/tests (espejo de auth.service): expone el token de invitacion
const MAIL_DEBUG = process.env.NODE_ENV !== 'production' && process.env.MAIL_DEBUG === '1'

export class CreateUsuarioDto {
  @IsString() @IsNotEmpty()
  nombre: string

  @IsEmail()
  email: string

  // E2-M10: sin password se envia una invitacion por email para definirla
  @IsString() @MinLength(8) @IsOptional()
  password?: string

  @IsIn(ROLES)
  rol: Rol

  // Doctor de la tabla doctores al que se vincula un usuario rol DOCTOR:
  // al loguearse ve/edita solo su agenda y su calendario de atencion
  @IsInt() @IsOptional()
  doctorId?: number
}

export class UpdateUsuarioDto {
  @IsString() @IsNotEmpty() @IsOptional()
  nombre?: string

  @IsEmail() @IsOptional()
  email?: string

  @IsString() @MinLength(8) @IsOptional()
  password?: string

  @IsIn(ROLES) @IsOptional()
  rol?: Rol

  @IsBoolean() @IsOptional()
  activo?: boolean

  @IsInt() @IsOptional()
  doctorId?: number
}

// passwordHash jamas viaja en una respuesta
const USUARIO_SELECT = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  createdAt: true,
  doctor: { select: { id: true, nombre: true } },
} as const

@Injectable()
export class UsuariosService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private auth: AuthService,
  ) {}

  // Incluye inactivos: el admin debe poder verlos y reactivarlos
  findAll(consultorioId: number) {
    return this.prisma.usuario.findMany({
      where: { consultorioId },
      select: USUARIO_SELECT,
      orderBy: { nombre: 'asc' },
    })
  }

  async create(consultorioId: number, dto: CreateUsuarioDto) {
    const email = dto.email.trim().toLowerCase()
    const exists = await this.prisma.usuario.findUnique({
      where: { email_consultorioId: { email, consultorioId } },
    })
    if (exists) throw new ConflictException('Ya existe un usuario con ese email')
    if (dto.doctorId && dto.rol !== Rol.DOCTOR) {
      throw new BadRequestException('Solo un usuario con rol DOCTOR puede asociarse a un doctor')
    }

    const { password, doctorId, ...rest } = dto
    rest.email = email // email normalizado a minusculas (case-insensitive login)
    // Sin password la cuenta nace inaccesible (hash de bytes aleatorios) y el
    // usuario la habilita con el link del email de invitacion (E2-M10)
    const passwordHash = await argon2.hash(password ?? randomBytes(32).toString('hex'))

    const usuario = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.usuario.create({
        data: { ...rest, passwordHash, consultorioId },
        select: USUARIO_SELECT,
      })
      if (doctorId) await this.asociarDoctor(tx, consultorioId, creado.id, doctorId)
      return tx.usuario.findUnique({ where: { id: creado.id }, select: USUARIO_SELECT })
    })

    if (!password && usuario) {
      const consultorio = await this.prisma.consultorio.findUnique({
        where: { id: consultorioId },
        select: { nombre: true },
      })
      const token = await this.auth.crearTokenPassword(usuario.id)
      void this.mail.enviar(
        email,
        `Tu cuenta en ${consultorio?.nombre ?? 'el consultorio'}`,
        this.mail.htmlInvitacion(dto.nombre, consultorio?.nombre ?? 'el consultorio', this.mail.linkEstablecerPassword(token)),
        consultorio?.nombre,
      )
      if (MAIL_DEBUG) return { ...usuario, devToken: token }
    }
    return usuario
  }

  async update(consultorioId: number, id: number, dto: UpdateUsuarioDto) {
    const usuario = await this.prisma.usuario.findFirst({ where: { id, consultorioId } })
    if (!usuario) throw new NotFoundException('Usuario no encontrado')

    const rolFinal = dto.rol ?? usuario.rol
    if (dto.doctorId && rolFinal !== Rol.DOCTOR) {
      throw new BadRequestException('Solo un usuario con rol DOCTOR puede asociarse a un doctor')
    }

    const { password, doctorId, ...rest } = dto
    if (rest.email) rest.email = rest.email.trim().toLowerCase()
    const data: Record<string, unknown> = { ...rest }
    if (password) data.passwordHash = await argon2.hash(password)

    return this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id }, data })
      if (rolFinal !== Rol.DOCTOR) {
        // Al dejar de ser DOCTOR se suelta cualquier doctor vinculado
        await tx.doctor.updateMany({ where: { consultorioId, usuarioId: id }, data: { usuarioId: null } })
      } else if (doctorId) {
        await this.asociarDoctor(tx, consultorioId, id, doctorId)
      }
      return tx.usuario.findUnique({ where: { id }, select: USUARIO_SELECT })
    })
  }

  // Vincula usuario <-> doctor (1:1): suelta el doctor previo del usuario y
  // rechaza doctores ya tomados por otro usuario
  private async asociarDoctor(
    tx: Prisma.TransactionClient,
    consultorioId: number,
    usuarioId: number,
    doctorId: number,
  ) {
    const doctor = await tx.doctor.findFirst({ where: { id: doctorId, consultorioId } })
    if (!doctor) throw new NotFoundException('Doctor no encontrado')
    if (doctor.usuarioId && doctor.usuarioId !== usuarioId) {
      throw new ConflictException('Ese doctor ya esta asociado a otro usuario')
    }
    await tx.doctor.updateMany({
      where: { consultorioId, usuarioId, id: { not: doctorId } },
      data: { usuarioId: null },
    })
    await tx.doctor.update({ where: { id: doctorId }, data: { usuarioId } })
  }
}
