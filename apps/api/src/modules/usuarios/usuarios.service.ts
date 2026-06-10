import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsEmail, MinLength, IsIn, IsOptional, IsBoolean } from 'class-validator'
import { PrismaService } from '../../prisma/prisma.service'
import * as argon2 from 'argon2'
import { Rol } from '@prisma/client'

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
}

// passwordHash jamas viaja en una respuesta
const USUARIO_SELECT = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  createdAt: true,
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

    const { password, ...rest } = dto
    const passwordHash = await argon2.hash(password)

    return this.prisma.usuario.create({
      data: { ...rest, passwordHash, consultorioId },
      select: USUARIO_SELECT,
    })
  }

  async update(consultorioId: number, id: number, dto: UpdateUsuarioDto) {
    const usuario = await this.prisma.usuario.findFirst({ where: { id, consultorioId } })
    if (!usuario) throw new NotFoundException('Usuario no encontrado')

    const { password, ...rest } = dto
    const data: Record<string, unknown> = { ...rest }
    if (password) data.passwordHash = await argon2.hash(password)

    return this.prisma.usuario.update({
      where: { id },
      data,
      select: USUARIO_SELECT,
    })
  }
}
