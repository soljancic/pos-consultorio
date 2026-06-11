import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { IsArray, ArrayNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator'
// Sin esModuleInterop en el tsconfig del api, el default import de pdfkit
// emite .default (undefined) en runtime — usar la forma CJS de TS
import PDFDocument = require('pdfkit')
import { PrismaService } from '../../prisma/prisma.service'
import { AtencionesService } from './atenciones.service'

export class CreateRecetaDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) @MaxLength(200, { each: true })
  medicamentos: string[]

  @IsString() @IsOptional() @MaxLength(1000)
  indicaciones?: string
}

// Recetas PDF (E2-M5): el PDF se genera al descargar (siempre con el membrete
// vigente del consultorio); pdfUrl queda reservado para cuando haya hosting
@Injectable()
export class RecetasService {
  constructor(
    private prisma: PrismaService,
    private atenciones: AtencionesService,
  ) {}

  async crear(
    consultorioId: number,
    citaId: number,
    dto: CreateRecetaDto,
    usuarioId: number,
    rol: string,
  ) {
    const cita = await this.atenciones.citaConGuardDeEscritura(consultorioId, citaId, usuarioId, rol)
    if (!cita.atencion) {
      throw new BadRequestException('Registre la atencion antes de emitir una receta')
    }

    const [receta] = await this.prisma.$transaction([
      this.prisma.receta.create({
        data: {
          atencionId: cita.atencion.id,
          contenido: { medicamentos: dto.medicamentos, indicaciones: dto.indicaciones ?? null },
        },
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Receta',
          entidadId: citaId,
          accion: 'CREATE',
          payloadDespues: { medicamentos: dto.medicamentos },
        },
      }),
    ])
    return receta
  }

  // Lectura abierta al staff, como el resto de la atencion
  async listar(consultorioId: number, citaId: number) {
    const atencion = await this.prisma.atencion.findFirst({
      where: { citaId, cita: { consultorioId, deletedAt: null } },
      select: { id: true },
    })
    if (!atencion) return []
    return this.prisma.receta.findMany({
      where: { atencionId: atencion.id },
      orderBy: { createdAt: 'desc' },
    })
  }

  async pdf(consultorioId: number, recetaId: number): Promise<{ buffer: Buffer; nombre: string }> {
    const receta = await this.prisma.receta.findFirst({
      where: { id: recetaId, atencion: { cita: { consultorioId, deletedAt: null } } },
      include: {
        atencion: {
          include: {
            cita: {
              include: {
                paciente: { select: { nombre: true, apellido: true, dni: true, fechaNacimiento: true } },
                doctor: { select: { nombre: true, especialidad: true } },
              },
            },
          },
        },
      },
    })
    if (!receta) throw new NotFoundException('Receta no encontrada')

    const consultorio = await this.prisma.consultorio.findUnique({
      where: { id: consultorioId },
      select: { nombre: true, telefono: true, direccion: true },
    })

    const { paciente, doctor, fechaHora } = receta.atencion.cita
    const contenido = receta.contenido as { medicamentos: string[]; indicaciones: string | null }
    const fecha = receta.createdAt.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' })

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A5', margins: { top: 40, bottom: 40, left: 44, right: 44 } })
      const chunks: Buffer[] = []
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Membrete
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#0e7490').text(consultorio?.nombre ?? 'Consultorio')
      doc.font('Helvetica').fontSize(8).fillColor('#555555')
      const lineas = [consultorio?.direccion, consultorio?.telefono ? `Tel: ${consultorio.telefono}` : null].filter(Boolean)
      if (lineas.length) doc.text(lineas.join('  ·  '))
      doc.moveDown(0.4)
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .lineWidth(1).strokeColor('#0e7490').stroke()
      doc.moveDown(0.8)

      // Titulo + fecha
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text('RECETA MÉDICA', { continued: true })
      doc.font('Helvetica').fontSize(9).fillColor('#555555').text(`   ${fecha}`, { baseline: 'bottom' })
      doc.moveDown(0.6)

      // Paciente
      doc.font('Helvetica').fontSize(10).fillColor('#111111')
      doc.text(`Paciente: ${paciente.apellido}, ${paciente.nombre}${paciente.dni ? `   ·   CI: ${paciente.dni}` : ''}`)
      doc.fontSize(9).fillColor('#555555')
        .text(`Atendido el ${fechaHora.toLocaleDateString('es-BO')} `)
      doc.moveDown(0.8)

      // Prescripcion
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#111111').text('Rp/')
      doc.moveDown(0.3)
      doc.font('Helvetica').fontSize(11)
      contenido.medicamentos.forEach((m, i) => {
        doc.text(`${i + 1}.  ${m}`, { paragraphGap: 4 })
      })
      if (contenido.indicaciones) {
        doc.moveDown(0.6)
        doc.font('Helvetica-Bold').fontSize(10).text('Indicaciones:')
        doc.font('Helvetica').fontSize(10).text(contenido.indicaciones)
      }

      // Firma al pie
      const yFirma = doc.page.height - doc.page.margins.bottom - 64
      doc.moveTo(doc.page.width / 2 - 10, yFirma).lineTo(doc.page.width - doc.page.margins.right, yFirma)
        .lineWidth(0.8).strokeColor('#999999').stroke()
      doc.font('Helvetica').fontSize(9).fillColor('#111111')
        .text(doctor.nombre, doc.page.width / 2 - 10, yFirma + 6, { width: doc.page.width / 2 - doc.page.margins.right + 10, align: 'center' })
      if (doctor.especialidad) {
        doc.fontSize(8).fillColor('#555555')
          .text(doctor.especialidad, { width: doc.page.width / 2 - doc.page.margins.right + 10, align: 'center' })
      }

      doc.end()
    })

    const nombre = `receta-${receta.id}-${paciente.apellido.toLowerCase()}.pdf`
    return { buffer, nombre }
  }
}
