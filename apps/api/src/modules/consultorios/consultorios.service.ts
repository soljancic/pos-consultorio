import { Injectable, ConflictException, BadRequestException } from '@nestjs/common'
import { IsString, IsOptional, IsBoolean, Matches, MaxLength } from 'class-validator'
import { v2 as cloudinary } from 'cloudinary'
import { PrismaService } from '../../prisma/prisma.service'

export class UpdateConsultorioDto {
  @IsString() @IsOptional()
  nombre?: string

  @IsString() @IsOptional()
  logoUrl?: string

  @IsString() @IsOptional()
  telefono?: string

  @IsString() @IsOptional()
  direccion?: string

  @IsString() @IsOptional()
  moneda?: string

  @IsString() @IsOptional()
  timezone?: string

  // Portal publico (E2.5b): /reservar/:slug
  @Matches(/^[a-z0-9-]{3,40}$/, { message: 'slug: minusculas, numeros y guiones (3-40)' })
  @IsOptional()
  slug?: string

  @IsBoolean() @IsOptional()
  portalActivo?: boolean

  // E3 item 26: plantillas de WhatsApp ({nombre} {hora} {fecha} {monto} {consultorio})
  @IsString() @IsOptional() @MaxLength(400)
  msjRecordatorio?: string

  @IsString() @IsOptional() @MaxLength(400)
  msjDeuda?: string

  @IsString() @IsOptional() @MaxLength(400)
  msjContacto?: string

  // QR de pagos: normalmente lo escribe POST /consultorio/qr (Cloudinary),
  // pero tambien se acepta una URL pegada a mano
  @IsString() @IsOptional() @MaxLength(500)
  qrUrl?: string
}

const CONSULTORIO_SELECT = {
  id: true,
  nombre: true,
  logoUrl: true,
  telefono: true,
  direccion: true,
  moneda: true,
  timezone: true,
  plan: true,
  slug: true,
  portalActivo: true,
  msjRecordatorio: true,
  msjDeuda: true,
  msjContacto: true,
  qrUrl: true,
} as const

// QR de pagos: solo imagenes chicas; Cloudinary lo normaliza a jpg
const MIMES_QR = ['image/jpeg', 'image/png', 'image/webp']
const MAX_QR_BYTES = 5 * 1024 * 1024

@Injectable()
export class ConsultoriosService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: number) {
    return this.prisma.consultorio.findUnique({
      where: { id },
      select: CONSULTORIO_SELECT,
    })
  }

  async update(id: number, data: UpdateConsultorioDto) {
    if (data.slug) {
      const tomado = await this.prisma.consultorio.findFirst({
        where: { slug: data.slug, id: { not: id } },
        select: { id: true },
      })
      if (tomado) throw new ConflictException('Ese slug ya esta en uso')
    }
    return this.prisma.consultorio.update({
      where: { id },
      data,
      select: CONSULTORIO_SELECT,
    })
  }

  // Sube el QR de pagos a Cloudinary (folder QR, un public_id por consultorio
  // con overwrite: re-subir reemplaza) y guarda la URL segura en qrUrl
  async subirQr(id: number, file: Express.Multer.File) {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new BadRequestException('Cloudinary no esta configurado en el servidor')
    }
    if (!MIMES_QR.includes(file.mimetype)) {
      throw new BadRequestException('Solo se aceptan imagenes JPG, PNG o WebP')
    }
    if (file.size > MAX_QR_BYTES) {
      throw new BadRequestException('La imagen supera el maximo de 5 MB')
    }

    const consultorio = await this.prisma.consultorio.findUnique({
      where: { id },
      select: { nombre: true },
    })

    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    })

    // public_id estable y sin caracteres raros: "nombre-id"
    const slugNombre = (consultorio?.nombre ?? 'consultorio')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()

    const subida = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'QR',
          public_id: `${slugNombre}-${id}`,
          overwrite: true,
          invalidate: true,
          format: 'jpg',
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) reject(error ?? new Error('Cloudinary sin respuesta'))
          else resolve(result)
        },
      )
      stream.end(file.buffer)
    }).catch(() => {
      throw new BadRequestException('No se pudo subir la imagen a Cloudinary')
    })

    return this.prisma.consultorio.update({
      where: { id },
      data: { qrUrl: subida.secure_url },
      select: CONSULTORIO_SELECT,
    })
  }
}
