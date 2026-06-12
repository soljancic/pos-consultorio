import { Injectable, Logger } from '@nestjs/common'
import { Resend } from 'resend'

// E2-M10: envio de emails de cuenta via Resend. El envio nunca bloquea ni
// rompe el flujo que lo dispara: si falla queda en el log del server.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private readonly resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null
  private readonly from = process.env.MAIL_FROM ?? 'POS Consultorio <onboarding@resend.dev>'

  async enviar(para: string, asunto: string, html: string) {
    if (!this.resend) {
      this.logger.warn(`RESEND_API_KEY no configurada; email "${asunto}" a ${para} omitido`)
      return
    }
    try {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to: para,
        subject: asunto,
        html,
      })
      if (error) this.logger.error(`Resend rechazo el email a ${para}: ${error.message}`)
      else this.logger.log(`Email "${asunto}" enviado a ${para}`)
    } catch (e: any) {
      this.logger.error(`Error enviando email a ${para}: ${e?.message ?? e}`)
    }
  }

  linkEstablecerPassword(token: string) {
    const base = process.env.WEB_URL ?? 'http://localhost:5173'
    return `${base}/establecer-password?token=${token}`
  }

  private layout(titulo: string, cuerpo: string, link: string, cta: string) {
    return `
<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#0e7490;margin-bottom:4px">${titulo}</h2>
  <p style="font-size:14px;line-height:1.6">${cuerpo}</p>
  <p style="margin:28px 0">
    <a href="${link}" style="background:#0891b2;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:bold">${cta}</a>
  </p>
  <p style="font-size:12px;color:#64748b;line-height:1.5">
    El enlace vence en 48 horas y solo puede usarse una vez.
    Si el botón no funciona, copiá y pegá esta dirección en el navegador:<br>
    <span style="word-break:break-all">${link}</span>
  </p>
</div>`
  }

  htmlInvitacion(nombre: string, consultorio: string, link: string) {
    return this.layout(
      `Bienvenido/a a ${consultorio}`,
      `Hola ${nombre}: te crearon una cuenta en el sistema de ${consultorio}. Para empezar a usarla definí tu contraseña con el siguiente botón.`,
      link,
      'Definir mi contraseña',
    )
  }

  // E2.5b: aviso al paciente cuando la secretaria acepta su reserva del
  // portal (SOLICITADA -> PENDIENTE). Sin CTA: es puramente informativo.
  htmlReservaAceptada(datos: {
    nombre: string
    consultorio: string
    fecha: string
    hora: string
    servicio: string
    doctor: string
  }) {
    return `
<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#0e7490;margin-bottom:4px">¡Tu reserva fue aceptada!</h2>
  <p style="font-size:14px;line-height:1.6">
    Hola ${datos.nombre}: ${datos.consultorio} aceptó tu reserva.
  </p>
  <table style="font-size:14px;line-height:1.8;border-collapse:collapse">
    <tr><td style="color:#64748b;padding-right:12px">Fecha</td><td style="font-weight:bold">${datos.fecha}</td></tr>
    <tr><td style="color:#64748b;padding-right:12px">Hora</td><td style="font-weight:bold">${datos.hora}</td></tr>
    <tr><td style="color:#64748b;padding-right:12px">Servicio</td><td>${datos.servicio}</td></tr>
    <tr><td style="color:#64748b;padding-right:12px">Profesional</td><td>${datos.doctor}</td></tr>
  </table>
  <p style="font-size:12px;color:#64748b;line-height:1.5;margin-top:24px">
    Si no podés asistir, avisá al consultorio para reprogramar.
  </p>
</div>`
  }

  htmlReset(nombre: string, link: string) {
    return this.layout(
      'Restablecer contraseña',
      `Hola ${nombre}: recibimos un pedido para restablecer tu contraseña. Si no fuiste vos, ignorá este correo.`,
      link,
      'Elegir nueva contraseña',
    )
  }
}
