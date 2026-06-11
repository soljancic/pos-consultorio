import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsEmail, MinLength, IsIn, IsOptional, IsBoolean, IsInt } from 'class-validator'
import { PrismaService } from '../../prisma/prisma.service'
import * as argon2 from 'argon2'
import { Rol, Prisma } from '@prisma/client'

const ROLES = ['ADMIN', 'SECRETARIA', 'DOCTOR', 'CAJA'] as const

export class CreateUsuarioDto {
  @IsString() @IsNotEmpty()
  nombre: string

  @IsEmail()
  email: string

  @IsString() @MinLength(8)
  password: string

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
  constructor(private prisma: PrismaService) {}

  // Incluye inactivos: el admin debe poder verlos y reactivarlos
  findAll(consultorioId: number) {
    return this.prisma.usuario.findMany({
      where: { consultorioId },
      select: USUARIO_SELECT,
      orderBy: { nombre: 'asc' },
    })
  }

  async create(consultorioId: number, dto: CreateUsuarioDto) {
    const exists = await this.prisma.usuario.findUnique({
      where: { email_consultorioId: { email: dto.email, consultorioId } },
    })
    if (exists) throw new ConflictException('Ya existe un usuario con ese email')
    if (dto.doctorId && dto.rol !== Rol.DOCTOR) {
      throw new BadRequestException('Solo un usuario con rol DOCTOR puede asociarse a un doctor')
    }

    const { password, doctorId, ...rest } = dto
    const passwordHash = await argon2.hash(password)

    return this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: { ...rest, passwordHash, consultorioId },
        select: USUARIO_SELECT,
      })
      if (doctorId) await this.asociarDoctor(tx, consultorioId, usuario.id, doctorId)
      return tx.usuario.findUnique({ where: { id: usuario.id }, select: USUARIO_SELECT })
    })
  }

  async update(consultorioId: number, id: number, dto: UpdateUsuarioDto) {
    const usuario = await this.prisma.usuario.findFirst({ where: { id, consultorioId } })
    if (!usuario) throw new NotFoundException('Usuario no encontrado')

    const rolFinal = dto.rol ?? usuario.rol
    if (dto.doctorId && rolFinal !== Rol.DOCTOR) {
      throw new BadRequestException('Solo un usuario con rol DOCTOR puede asociarse a un doctor')
    }

    const { password, doctorId, ...rest } = dto
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
