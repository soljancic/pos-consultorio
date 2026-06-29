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

      // Paleta (alineada al color primary teal del sistema)
      const BRAND = '#0e7490'
      const INK = '#1f2937'
      const MUTED = '#6b7280'
      const FAINT = '#9ca3af'
      const PANEL = '#f8fafc'
      const PANEL_BORDER = '#e5e7eb'

      const left = doc.page.margins.left
      const right = doc.page.width - doc.page.margins.right
      const contentW = right - left
      let y = doc.page.margins.top

      // Edad del paciente (si hay fecha de nacimiento)
      let edad: number | null = null
      if (paciente.fechaNacimiento) {
        const fn = new Date(paciente.fechaNacimiento)
        const hoy = new Date()
        let e = hoy.getFullYear() - fn.getFullYear()
        const mm = hoy.getMonth() - fn.getMonth()
        if (mm < 0 || (mm === 0 && hoy.getDate() < fn.getDate())) e--
        if (e >= 0 && e < 130) edad = e
      }

      // ── Membrete ───────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(16).fillColor(BRAND)
        .text(consultorio?.nombre ?? 'Consultorio', left, y)
      y = doc.y
      const sub = [consultorio?.direccion, consultorio?.telefono ? `Tel: ${consultorio.telefono}` : null]
        .filter(Boolean).join('   ·   ')
      if (sub) {
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(sub, left, y + 2)
        y = doc.y
      }
      y += 7
      doc.moveTo(left, y).lineTo(right, y).lineWidth(1.5).strokeColor(BRAND).stroke()
      y += 18

      // ── Titulo + fecha de emision ──────────────────────────────
      doc.font('Helvetica-Bold').fontSize(13).fillColor(INK)
        .text('RECETA MÉDICA', left, y, { characterSpacing: 0.3 })
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
        .text(fecha, left, y + 3, { width: contentW, align: 'right' })
      y += 26

      // ── Panel del paciente ─────────────────────────────────────
      const padX = 12
      const innerW = contentW - padX * 2
      const nombrePaciente = `${paciente.nombre} ${paciente.apellido}`
      const metaParts: string[] = []
      if (paciente.dni) metaParts.push(`CI: ${paciente.dni}`)
      if (edad != null) metaParts.push(`${edad} ${edad === 1 ? 'año' : 'años'}`)
      metaParts.push(`Atendido: ${fechaHora.toLocaleDateString('es-BO')}`)
      const metaLine = metaParts.join('   ·   ')

      doc.font('Helvetica-Bold').fontSize(12)
      const nameH = doc.heightOfString(nombrePaciente, { width: innerW })
      doc.font('Helvetica').fontSize(9)
      const metaH = doc.heightOfString(metaLine, { width: innerW })
      const panelH = 10 + 9 + 2 + nameH + 3 + metaH + 10

      doc.lineWidth(1)
      doc.roundedRect(left, y, contentW, panelH, 6).fillAndStroke(PANEL, PANEL_BORDER)

      let py = y + 10
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND)
        .text('PACIENTE', left + padX, py, { characterSpacing: 0.8 })
      py = doc.y + 1
      doc.font('Helvetica-Bold').fontSize(12).fillColor(INK)
        .text(nombrePaciente, left + padX, py, { width: innerW })
      py = doc.y + 3
      doc.font('Helvetica').fontSize(9).fillColor(MUTED)
        .text(metaLine, left + padX, py, { width: innerW })

      y += panelH + 20

      // ── Prescripcion ───────────────────────────────────────────
      doc.font('Helvetica-BoldOblique').fontSize(22).fillColor(BRAND).text('Rp/', left, y)
      y = doc.y + 8

      contenido.medicamentos.forEach((m, i) => {
        const rowY = y
        doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND)
          .text(`${i + 1}.`, left + 4, rowY, { width: 20 })
        doc.font('Helvetica').fontSize(11).fillColor(INK)
          .text(m, left + 28, rowY, { width: contentW - 28, lineGap: 1 })
        y = doc.y + 7
      })

      // ── Indicaciones ───────────────────────────────────────────
      if (contenido.indicaciones) {
        y += 6
        doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND)
          .text('INDICACIONES', left, y, { characterSpacing: 0.8 })
        y = doc.y + 3
        doc.font('Helvetica').fontSize(10).fillColor(INK)
          .text(contenido.indicaciones, left, y, { width: contentW, lineGap: 2.5 })
      }

      // ── Firma al pie ───────────────────────────────────────────
      const sigW = 190
      const sigX = right - sigW
      const sigY = doc.page.height - doc.page.margins.bottom - 58
      doc.moveTo(sigX, sigY).lineTo(right, sigY).lineWidth(0.8).strokeColor(FAINT).stroke()
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
        .text(doctor.nombre, sigX, sigY + 7, { width: sigW, align: 'center' })
      if (doctor.especialidad) {
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
          .text(doctor.especialidad, sigX, doc.y + 1, { width: sigW, align: 'center' })
      }
      doc.font('Helvetica').fontSize(7.5).fillColor(FAINT)
        .text('Firma y sello', sigX, doc.y + 3, { width: sigW, align: 'center' })

      doc.end()
    })

    const nombre = `receta-${receta.id}-${paciente.apellido.toLowerCase()}.pdf`
    return { buffer, nombre }
  }
}
