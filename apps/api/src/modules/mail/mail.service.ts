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

  // Solo la direccion verificada de MAIL_FROM ("Nombre <addr>" -> "addr").
  // El remitente visible (display name) se reemplaza por el nombre del
  // consultorio; el dominio debe seguir siendo el verificado en Resend.
  private direccionRemitente(): string {
    return this.from.match(/<([^>]+)>/)?.[1] ?? this.from
  }

  // from con el nombre del consultorio como remitente visible. Sin nombre,
  // cae al MAIL_FROM por defecto. Se limpian comillas/backslash para no
  // romper el header RFC 5322.
  private fromConRemitente(remitente?: string): string {
    const nombre = remitente?.replace(/["\\]/g, ' ').trim()
    return nombre ? `"${nombre}" <${this.direccionRemitente()}>` : this.from
  }

  async enviar(para: string, asunto: string, html: string, remitente?: string) {
    if (!this.resend) {
      this.logger.warn(`RESEND_API_KEY no configurada; email "${asunto}" a ${para} omitido`)
      return
    }
    try {
      const { error } = await this.resend.emails.send({
        from: this.fromConRemitente(remitente),
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

  private webBase() {
    return (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/$/, '')
  }

  linkEstablecerPassword(token: string) {
    return `${this.webBase()}/establecer-password?token=${token}`
  }

  // Links del portal publico para el email de confirmacion: el paciente
  // gestiona su propia cita (mismo slug + token opaco que ya usa la agenda).
  private linkPortalCita(slug: string, token: string, accion: 'reprogramar' | 'cancelar') {
    return `${this.webBase()}/reservar/${slug}?${accion}=${token}`
  }

  // WhatsApp del consultorio a partir del telefono cargado (debe traer codigo
  // de pais). Sin digitos validos no se arma el link.
  private linkWhatsApp(telefono?: string | null) {
    const num = (telefono ?? '').replace(/\D/g, '')
    return num ? `https://wa.me/${num}` : null
  }

  // Ubicacion en Google Maps a partir de la direccion en texto libre
  private linkMapa(direccion?: string | null) {
    const d = (direccion ?? '').trim()
    return d ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d)}` : null
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

  // E2.5b: confirmacion al paciente cuando la secretaria acepta su reserva del
  // portal (SOLICITADA -> PENDIENTE). Email transaccional, mobile-first y con
  // tablas (lo unico confiable entre clientes); colores de la marca (cyan),
  // tarjetas para los datos, fecha y hora como heroe, y acciones de
  // autogestion (reprogramar / cancelar / ubicacion) si hay slug + token.
  htmlReservaAceptada(datos: {
    nombre: string
    consultorio: string
    direccion?: string | null
    telefono?: string | null
    fecha: string
    hora: string
    servicio: string
    doctor: string
    slug?: string | null
    token?: string | null
  }) {
    const linkReprogramar =
      datos.slug && datos.token ? this.linkPortalCita(datos.slug, datos.token, 'reprogramar') : null
    const linkCancelar =
      datos.slug && datos.token ? this.linkPortalCita(datos.slug, datos.token, 'cancelar') : null
    const linkWa = this.linkWhatsApp(datos.telefono)
    const linkUbicacion = this.linkMapa(datos.direccion)

    // Boton de ancho completo, "a prueba de balas" (display:block + padding).
    const boton = (href: string, texto: string, bg: string, color: string, borde: string) =>
      `<tr><td style="padding-bottom:10px">
        <a href="${href}" style="display:block;text-align:center;background-color:${bg};color:${color};border:1px solid ${borde};text-decoration:none;padding:13px 20px;border-radius:10px;font-size:15px;font-weight:600">${texto}</a>
      </td></tr>`

    // Fila de la tarjeta de datos: emoji + etiqueta + valor
    const filaDato = (emoji: string, etiqueta: string, valor: string) =>
      `<tr>
        <td style="padding:5px 10px 5px 0;width:24px;font-size:18px;vertical-align:top">${emoji}</td>
        <td style="padding:5px 12px 5px 0;color:#64748b;font-size:14px;vertical-align:top;white-space:nowrap">${etiqueta}</td>
        <td style="padding:5px 0;color:#0f172a;font-size:15px;font-weight:600;text-align:right;vertical-align:top">${valor}</td>
      </tr>`

    const filaConsultorio = datos.direccion ? filaDato('📍', 'Dirección', datos.direccion) : ''
    const filaTelefono = datos.telefono
      ? `<tr>
          <td style="padding:5px 10px 5px 0;width:24px;font-size:18px;vertical-align:top">📞</td>
          <td style="padding:5px 12px 5px 0;color:#64748b;font-size:14px;vertical-align:top;white-space:nowrap">Teléfono</td>
          <td style="padding:5px 0;text-align:right;vertical-align:top"><a href="tel:${datos.telefono}" style="color:#0e7490;font-size:15px;font-weight:600;text-decoration:none">${datos.telefono}</a></td>
        </tr>`
      : ''

    const botones =
      (linkReprogramar ? boton(linkReprogramar, 'Reprogramar cita', '#0891b2', '#ffffff', '#0891b2') : '') +
      (linkCancelar ? boton(linkCancelar, 'Cancelar cita', '#ffffff', '#b91c1c', '#fecaca') : '') +
      (linkUbicacion ? boton(linkUbicacion, 'Ver ubicación', '#ffffff', '#334155', '#e2e8f0') : '') +
      (linkWa ? boton(linkWa, 'Escribir por WhatsApp', '#ffffff', '#15803d', '#bbf7d0') : '')

    return `
<div style="margin:0;padding:0;background-color:#f1f5f9">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">

        <tr><td style="background-color:#0e7490;background-image:linear-gradient(135deg,#0e7490,#0891b2);padding:30px 32px;text-align:center">
          <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
            <td style="width:64px;height:64px;background-color:#ffffff;border-radius:50%;text-align:center;vertical-align:middle">
              <span style="font-size:34px;line-height:64px;color:#16a34a;font-weight:700">&#10003;</span>
            </td>
          </tr></table>
          <h1 style="margin:18px 0 4px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:700">Tu reserva fue confirmada</h1>
          <p style="margin:0;font-size:13px;color:#cffafe">${datos.consultorio}</p>
        </td></tr>

        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155">
            Hola <strong style="color:#0f172a">${datos.nombre}</strong>, nos alegra confirmar tu cita. Te esperamos.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ecfeff;border:1px solid #a5f3fc;border-radius:14px;margin:0 0 16px">
            <tr><td style="padding:20px 24px;text-align:center">
              <p style="margin:0 0 6px;font-size:13px;color:#0e7490;font-weight:600">Tu cita</p>
              <p style="margin:0 0 4px;font-size:18px;line-height:1.3;color:#0f172a;font-weight:600">${datos.fecha}</p>
              <p style="margin:0;font-size:36px;line-height:1.1;color:#0e7490;font-weight:800">${datos.hora}</p>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:14px;margin:0 0 14px">
            <tr><td style="padding:16px 20px">
              <p style="margin:0 0 8px;font-size:13px;color:#64748b;font-weight:600">Detalles de la cita</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${filaDato('🩺', 'Servicio', datos.servicio)}
                ${filaDato('👨‍⚕️', 'Profesional', datos.doctor)}
              </table>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:14px;margin:0 0 20px">
            <tr><td style="padding:16px 20px">
              <p style="margin:0 0 8px;font-size:13px;color:#64748b;font-weight:600">Información del consultorio</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${filaDato('🏥', 'Consultorio', datos.consultorio)}
                ${filaConsultorio}
                ${filaTelefono}
              </table>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#334155">
            Te recomendamos llegar <strong>10 minutos antes</strong> de tu hora.
          </p>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#334155">
            Si no vas a poder asistir, cancelá o reprogramá tu cita para liberar el horario a otra persona.
          </p>

          ${botones ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${botones}</table>` : ''}
        </td></tr>

        <tr><td style="padding:20px 32px 28px;border-top:1px solid #e2e8f0;text-align:center">
          <p style="margin:0 0 6px;font-size:13px;color:#475569">Gracias por confiar en <strong>${datos.consultorio}</strong>.</p>
          <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5">Este es un mensaje automático. Ante cualquier consulta, comunicate con nosotros con los datos de contacto de arriba.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</div>`
  }

  // Feature 3 (spec UX publico): resumen del turno al cerrar caja. Montos ya
  // formateados por el caller (Decimal de Prisma, nunca float).
  htmlCierreCaja(d: {
    consultorio: string
    fecha: string
    abrioPor: string
    cerroPor: string
    horaApertura: string
    horaCierre: string
    moneda: string
    montoInicial: string
    cuentas: { nombre: string; total: string }[]
    gastos: string
    esperado: string
    contado: string
    diferencia: string
    hayDiferencia: boolean
    cantidadCobros: number
  }) {
    const fila = (label: string, valor: string, fuerte = false) =>
      `<tr><td style="color:#64748b;padding:4px 12px 4px 0">${label}</td><td style="text-align:right${fuerte ? ';font-weight:bold' : ''}">${valor}</td></tr>`
    // Simbolo de la moneda en vez del codigo ISO (Bs, $, etc.); fallback al codigo.
    const SIMBOLO_MONEDA: Record<string, string> = {
      ARS: '$', USD: '$', UYU: '$', CLP: '$', COP: '$', MXN: '$',
      PEN: 'S/', BOB: 'Bs', BRL: 'R$',
    }
    const simbolo = SIMBOLO_MONEDA[d.moneda] ?? d.moneda
    const dinero = (v: string) => `${simbolo} ${v}`
    return `
<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#0e7490;margin-bottom:2px">Cierre de caja</h2>
  <p style="font-size:14px;color:#64748b;margin-top:0">${d.consultorio} · ${d.fecha}</p>

  <table style="font-size:14px;line-height:1.5;border-collapse:collapse;width:100%;margin-top:8px">
    ${fila('Abrió', `${d.abrioPor} · ${d.horaApertura}`)}
    ${fila('Cerró', `${d.cerroPor} · ${d.horaCierre}`)}
    ${fila('Monto inicial (caja chica)', dinero(d.montoInicial))}
  </table>

  <h3 style="font-size:14px;color:#0e7490;margin:20px 0 4px">Ingresos por forma de pago</h3>
  <table style="font-size:14px;line-height:1.5;border-collapse:collapse;width:100%">
    ${d.cuentas.map((c) => fila(c.nombre, dinero(c.total))).join('')}
    ${fila('Gastos del turno (efectivo)', `- ${dinero(d.gastos)}`)}
  </table>

  <h3 style="font-size:14px;color:#0e7490;margin:20px 0 4px">Arqueo de efectivo</h3>
  <table style="font-size:14px;line-height:1.5;border-collapse:collapse;width:100%">
    ${fila('Esperado', dinero(d.esperado))}
    ${fila('Contado', dinero(d.contado), true)}
    <tr>
      <td style="color:#64748b;padding:4px 12px 4px 0">Diferencia</td>
      <td style="text-align:right;font-weight:bold;color:${d.hayDiferencia ? '#dc2626' : '#16a34a'}">${dinero(d.diferencia)}</td>
    </tr>
  </table>

  <p style="font-size:13px;color:#64748b;margin-top:18px">Cobros registrados en el turno: <strong>${d.cantidadCobros}</strong></p>
  ${d.hayDiferencia ? '<p style="font-size:13px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px">El arqueo tiene diferencia: queda pendiente de revisión del administrador.</p>' : ''}
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
