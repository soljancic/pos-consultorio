import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class UsuariosService {
  constructor(private prisma: PrismaService) {}

  findAll(consultorioId: string) {
    return this.prisma.usuario.findMany({
      where: { consultorioId, activo: true },
      select: { id: true, nombre: true, email: true, rol: true, createdAt: true },
    })
  }
}
