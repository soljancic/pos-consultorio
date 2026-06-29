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
      select: { nombre: true, telefono: true, direccion: true, logoUrl: true },
    })

    const { paciente, doctor, fechaHora } = receta.atencion.cita
    const contenido = receta.contenido as { medicamentos: string[]; indicaciones: string | null }
    const fecha = receta.createdAt.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' })

    // Logo del consultorio (Cloudinary). Se descarga aparte; si falla o no es
    // PNG/JPEG se dibuja un isotipo de cruz medica como respaldo.
    //
    // SSRF: `logoUrl` viene de la BD y el admin la puede setear via PATCH
    // /consultorio (DTO sin validacion de URL), asi que NO se puede hacer fetch
    // a una URL arbitraria (apuntaria a 169.254.169.254 / servicios internos).
    // Los logos SIEMPRE se suben a Cloudinary, asi que se restringe a ese host
    // (https + allowlist de dominio + sin seguir redirects). Si no cumple, se usa
    // el respaldo sin hacer ninguna request.
    let logoBuf: Buffer | null = null
    if (consultorio?.logoUrl) {
      try {
        const u = new URL(consultorio.logoUrl)
        const host = u.hostname.toLowerCase()
        const esCloudinary = host === 'res.cloudinary.com' || host.endsWith('.cloudinary.com')
        if (u.protocol === 'https:' && esCloudinary) {
          const res = await fetch(consultorio.logoUrl, {
            signal: AbortSignal.timeout(4000),
            redirect: 'manual', // un 3xx a una URL interna no se sigue
          })
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer())
            const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50
            const isJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8
            if (isPng || isJpg) logoBuf = buf
          }
        }
      } catch {
        // URL invalida o fetch fallido: se usa el respaldo
      }
    }

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 46, bottom: 46, left: 50, right: 50 } })
      const chunks: Buffer[] = []
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // ── Paleta (un unico color de acento) ──────────────────────
      const PRIMARY = '#1F6F97'
      const INK = '#1f2a37'
      const MUTED = '#6b7280'
      const FAINT = '#9aa3af'
      const CARD_BG = '#f8fafc'
      const HAIR = '#e5e7eb'
      const AVATAR_BG = '#e9f1f6'

      const left = doc.page.margins.left
      const right = doc.page.width - doc.page.margins.right
      const contentW = right - left
      const pageBottom = doc.page.height - doc.page.margins.bottom
      const top = doc.page.margins.top

      // ── Iconos outline (paths estilo Feather, viewBox 24) ──────
      const ICONS: Record<string, string> = {
        user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2',
        pin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z',
        phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
        clipboard: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
        shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
      }
      const icon = (name: string, x: number, yy: number, size: number, color: string) => {
        const s = size / 24
        doc.save().translate(x, yy).scale(s)
        doc.lineWidth(1.5 / s).strokeColor(color).lineJoin('round').lineCap('round')
        if (ICONS[name]) doc.path(ICONS[name]).stroke()
        if (name === 'user') doc.circle(12, 7, 4).stroke()
        if (name === 'pin') doc.circle(12, 10, 3).stroke()
        if (name === 'clipboard') doc.roundedRect(8, 2, 8, 4, 1).stroke()
        if (name === 'calendar') {
          doc.roundedRect(3, 4, 18, 18, 2).stroke()
          doc.moveTo(16, 2).lineTo(16, 6).stroke()
          doc.moveTo(8, 2).lineTo(8, 6).stroke()
          doc.moveTo(3, 10).lineTo(21, 10).stroke()
        }
        doc.restore()
      }

      // ── Encabezado: logo + nombre (izq) · contacto (der) ───────
      const logoSize = 46
      if (logoBuf) {
        try { doc.image(logoBuf, left, top, { fit: [logoSize, logoSize] }) } catch { /* respaldo */ }
      } else {
        doc.roundedRect(left, top, logoSize, logoSize, 11).fill(PRIMARY)
        doc.fillColor('#ffffff')
        const cx = left + logoSize / 2
        const cy = top + logoSize / 2
        doc.rect(cx - 3.5, cy - 12, 7, 24).fill()
        doc.rect(cx - 12, cy - 3.5, 24, 7).fill()
      }
      const nameX = left + logoSize + 14
      doc.font('Helvetica-Bold').fontSize(20).fillColor(PRIMARY)
        .text(consultorio?.nombre ?? 'Consultorio', nameX, top + 4, { width: contentW - logoSize - 205 })
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
        .text('Tu salud, nuestra prioridad', nameX, doc.y + 1)

      const infoW = 185
      const infoX = right - infoW
      let infoY = top + 1
      // El icono se centra con la 1ra linea del texto: su centro (iconTop + size/2)
      // se alinea al centro optico del texto (~fontSize * 0.36 desde el top).
      if (consultorio?.direccion) {
        icon('pin', infoX, infoY - 3, 12, PRIMARY)
        doc.font('Helvetica').fontSize(8.5).fillColor(INK)
          .text(consultorio.direccion, infoX + 18, infoY, { width: infoW - 18 })
        infoY = doc.y + 6
      }
      if (consultorio?.telefono) {
        icon('phone', infoX, infoY - 3, 12, PRIMARY)
        doc.font('Helvetica').fontSize(8.5).fillColor(INK)
          .text(`Tel: ${consultorio.telefono}`, infoX + 18, infoY, { width: infoW - 18 })
        infoY = doc.y
      }

      let y = Math.max(top + logoSize + 14, infoY + 12)
      doc.moveTo(left, y).lineTo(right, y).lineWidth(1.2).strokeColor(PRIMARY).stroke()
      y += 24

      // ── Titulo (centrado) + fecha (derecha) ────────────────────
      doc.font('Helvetica-Bold').fontSize(15).fillColor(INK)
        .text('RECETA MÉDICA', left, y, { width: contentW, align: 'center', characterSpacing: 0.6 })
      doc.font('Helvetica').fontSize(9)
      const dW = doc.widthOfString(fecha)
      icon('calendar', right - dW - 15, y + 1, 11, PRIMARY)
      doc.fillColor(MUTED).text(fecha, right - dW, y + 2)
      y += 34

      // ── Tarjeta paciente / medico (2 columnas) ─────────────────
      const cardH = 74
      doc.lineWidth(1).roundedRect(left, y, contentW, cardH, 11).fillAndStroke(CARD_BG, HAIR)
      const midX = left + contentW / 2
      doc.moveTo(midX, y + 14).lineTo(midX, y + cardH - 14).lineWidth(1).strokeColor(HAIR).stroke()

      const persona = (colX: number, eyebrow: string, nombre: string, sub: string | null) => {
        const avSize = 30
        const avY = y + (cardH - avSize) / 2
        doc.circle(colX + avSize / 2, avY + avSize / 2, avSize / 2).fill(AVATAR_BG)
        icon('user', colX + 5, avY + 5, avSize - 10, PRIMARY)
        const tx = colX + avSize + 12
        const colRight = colX < midX ? midX : right
        const blockH = 9 + 3 + 14 + (sub ? 3 + 11 : 0)
        let ty = y + (cardH - blockH) / 2
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(PRIMARY)
          .text(eyebrow, tx, ty, { characterSpacing: 0.8 })
        ty = doc.y + 3
        doc.font('Helvetica-Bold').fontSize(12).fillColor(INK)
          .text(nombre, tx, ty, { width: colRight - tx - 14 })
        if (sub) {
          ty = doc.y + 3
          doc.font('Helvetica').fontSize(9).fillColor(MUTED)
            .text(sub, tx, ty, { width: colRight - tx - 14 })
        }
      }
      const subPac = [
        paciente.dni ? `CI: ${paciente.dni}` : null,
        `Atendido: ${fechaHora.toLocaleDateString('es-BO')}`,
      ].filter(Boolean).join('   ·   ')
      persona(left + 16, 'PACIENTE', `${paciente.nombre} ${paciente.apellido}`, subPac)
      persona(midX + 18, 'MÉDICO TRATANTE', doctor.nombre, doctor.especialidad ?? null)
      y += cardH + 28

      // ── Prescripcion ───────────────────────────────────────────
      doc.font('Helvetica-BoldOblique').fontSize(24).fillColor(PRIMARY).text('Rp/', left, y)
      y = doc.y + 12

      contenido.medicamentos.forEach((m, i) => {
        const rowY = y
        doc.font('Helvetica-Bold').fontSize(11).fillColor(PRIMARY)
          .text(`${i + 1}.`, left + 6, rowY + 1, { width: 22 })
        doc.font('Helvetica').fontSize(12).fillColor(INK)
          .text(m, left + 32, rowY, { width: contentW - 32, lineGap: 1 })
        y = doc.y + 14
      })

      // ── Indicaciones ───────────────────────────────────────────
      if (contenido.indicaciones) {
        y += 6
        icon('clipboard', left, y, 12, PRIMARY)
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(PRIMARY)
          .text('INDICACIONES', left + 18, y + 1, { characterSpacing: 0.8 })
        y = doc.y + 5
        const inds = contenido.indicaciones.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean)
        if (inds.length > 1) {
          for (const linea of inds) {
            const rowY = y
            doc.font('Helvetica').fontSize(10).fillColor(PRIMARY).text('•', left + 18, rowY, { width: 10 })
            doc.font('Helvetica').fontSize(10).fillColor(INK)
              .text(linea, left + 30, rowY, { width: contentW - 30, lineGap: 2 })
            y = doc.y + 5
          }
        } else {
          doc.font('Helvetica').fontSize(10).fillColor(INK)
            .text(contenido.indicaciones, left + 18, y, { width: contentW - 18, lineGap: 2.5 })
        }
      }

      // ── Firma (abajo a la derecha) ─────────────────────────────
      const footerLineY = pageBottom - 22
      const sigW = 210
      const sigX = right - sigW
      const sigLineY = footerLineY - 52
      doc.moveTo(sigX, sigLineY).lineTo(right, sigLineY).lineWidth(0.9).strokeColor(FAINT).stroke()
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK)
        .text(doctor.nombre, sigX, sigLineY + 7, { width: sigW, align: 'center' })
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text('Firma y sello', sigX, doc.y + 1, { width: sigW, align: 'center' })

      // ── Pie de pagina ──────────────────────────────────────────
      doc.moveTo(left, footerLineY).lineTo(right, footerLineY).lineWidth(0.8).strokeColor(HAIR).stroke()
      const fy = footerLineY + 8
      icon('shield', left, fy, 11, PRIMARY)
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text('Gracias por confiar en nosotros.', left + 16, fy + 1)
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text('Cuida tu salud, sigue las indicaciones.', left, fy + 1, { width: contentW, align: 'right' })

      doc.end()
    })

    const nombre = `receta-${receta.id}-${paciente.apellido.toLowerCase()}.pdf`
    return { buffer, nombre }
  }
}
