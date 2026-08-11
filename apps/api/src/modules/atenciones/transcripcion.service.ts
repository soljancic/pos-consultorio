import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaService } from '../../prisma/prisma.service'
import { HojasService } from './hojas.service'
import { mediaTypeDeImagen, modeloTranscripcion, PROMPT_TRANSCRIPCION } from './transcripcion.prompt'

const MAX_IMAGEN_BYTES = 8 * 1024 * 1024

/**
 * Unica puerta hacia el proveedor de OCR. Cambiar de proveedor = tocar solo
 * este archivo; el controller y el frontend no se enteran.
 *
 * La imagen NO se persiste en ningun lado: es un intermedio de la request.
 */
@Injectable()
export class TranscripcionService {
  constructor(
    private prisma: PrismaService,
    private hojas: HojasService,
  ) {}

  disponible(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  }

  async transcribir(
    consultorioId: number,
    citaId: number,
    hojaId: number,
    usuarioId: number,
    rol: string,
    imagen: Buffer,
  ): Promise<{ texto: string }> {
    const hoja = await this.hojas.hojaConGuardDeEscritura(consultorioId, citaId, hojaId, usuarioId, rol)

    if (!this.disponible()) {
      throw new ServiceUnavailableException(
        'La transcripcion no esta configurada en el servidor (falta ANTHROPIC_API_KEY)',
      )
    }
    if (imagen.length > MAX_IMAGEN_BYTES) {
      throw new BadRequestException('La imagen de la hoja supera el maximo de 8 MB')
    }
    const mediaType = mediaTypeDeImagen(imagen)
    if (!mediaType) {
      throw new BadRequestException('La imagen de la hoja debe ser PNG o JPEG')
    }

    const client = new Anthropic()
    let texto: string
    try {
      const respuesta = await client.messages.create({
        model: modeloTranscripcion(process.env),
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imagen.toString('base64') } },
              { type: 'text', text: PROMPT_TRANSCRIPCION },
            ],
          },
        ],
      })

      // El modelo puede declinar la respuesta: hay que mirar stop_reason antes
      // de tocar content, o content[0] revienta.
      if (respuesta.stop_reason === 'refusal') {
        throw new ServiceUnavailableException('El modelo no pudo procesar esta hoja')
      }
      texto = respuesta.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
    } catch (e) {
      if (e instanceof ServiceUnavailableException || e instanceof BadRequestException) throw e
      throw new ServiceUnavailableException('No se pudo transcribir la hoja. Intente de nuevo.')
    }

    await this.prisma.$transaction([
      this.prisma.hojaManuscrita.update({
        where: { id: hoja.id },
        data: { transcripcion: texto, transcritoAt: new Date() },
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'HojaManuscrita',
          entidadId: citaId,
          accion: 'UPDATE',
          payloadDespues: { hojaId: hoja.id, transcrito: true, caracteres: texto.length },
        },
      }),
    ])

    return { texto }
  }
}
