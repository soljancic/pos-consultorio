import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '../../prisma/prisma.service'
import { HojasService } from './hojas.service'
import { mediaTypeDeImagen, modeloTranscripcion, PROMPT_TRANSCRIPCION, resultadoTranscripcion } from './transcripcion.prompt'

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
    return Boolean(process.env.OPENAI_API_KEY?.trim())
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
        'La transcripción no está configurada en el servidor (falta OPENAI_API_KEY)',
      )
    }
    if (imagen.length > MAX_IMAGEN_BYTES) {
      throw new BadRequestException('La imagen de la hoja supera el máximo de 8 MB')
    }
    const mediaType = mediaTypeDeImagen(imagen)
    if (!mediaType) {
      throw new BadRequestException('La imagen de la hoja debe ser PNG o JPEG')
    }

    // La key sale de OPENAI_API_KEY, que el SDK lee solo. Ver disponible():
    // sin key no se llega hasta aca.
    const client = new OpenAI()
    let texto: string
    try {
      const respuesta = await client.responses.create({
        model: modeloTranscripcion(process.env),
        // Tope conjunto de razonamiento + texto visible (no solo del texto):
        // una hoja densa puede gastar buena parte del presupuesto razonando
        // antes de escribir, y quedarse corta a mitad de la transcripcion.
        max_output_tokens: 16000,
        // Transcribir letra manuscrita es percepcion, no razonamiento: un
        // effort alto desperdicia presupuesto que le hace falta al texto
        // visible cuando la letra es dificil.
        reasoning: { effort: 'low' },
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_image',
                // El SDK toma la imagen como data URL, no como base64 pelado.
                image_url: `data:${mediaType};base64,${imagen.toString('base64')}`,
                // 'high' a proposito: la hoja se manda a 2576px de lado largo
                // justamente para que se lea la letra. Con 'low' el modelo la
                // reescala a una miniatura y la cursiva se vuelve ilegible.
                detail: 'high',
              },
              { type: 'input_text', text: PROMPT_TRANSCRIPCION },
            ],
          },
        ],
      })

      // El modelo puede declinar la respuesta, cortarse por presupuesto a
      // mitad de frase, fallar, o devolver contenido vacio: en ningun caso se
      // persiste como si fuera una transcripcion completa. resultadoTranscripcion
      // decide esto de forma pura (ver transcripcion.prompt.spec.ts).
      const huboRechazo = respuesta.output.some(
        (item) => item.type === 'message' && item.content.some((parte) => parte.type === 'refusal'),
      )
      const resultado = resultadoTranscripcion({
        estado: respuesta.status,
        razonIncompleta: respuesta.incomplete_details?.reason,
        huboRechazo,
        // output_text es el agregado de las partes de texto de la salida.
        texto: respuesta.output_text,
      })

      if (!resultado.ok) {
        if (resultado.motivo === 'max_tokens') {
          throw new ServiceUnavailableException(
            'La transcripción de esta hoja quedó incompleta (demasiado texto para procesarla de una vez). Transcríbala manualmente.',
          )
        }
        if (resultado.motivo === 'vacio') {
          throw new ServiceUnavailableException('No se pudo leer texto en esta hoja')
        }
        if (resultado.motivo === 'incompleto') {
          throw new ServiceUnavailableException(
            'La transcripción no llegó a completarse. Intente de nuevo.',
          )
        }
        throw new ServiceUnavailableException('El modelo no pudo procesar esta hoja')
      }
      texto = resultado.texto
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
