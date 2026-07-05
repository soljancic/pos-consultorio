import { Injectable, Logger } from '@nestjs/common'
import { Resend } from 'resend'

// Prefijos internacionales por pais (ISO alfa-2) para armar el wa.me del
// consultorio cuando el telefono no trae el codigo. Espejo de apps/web paises.ts.
const DIAL_PAIS: Record<string, string> = {
  DE: '49', AR: '54', BO: '591', BR: '55', CA: '1', CL: '56', CN: '86',
  CO: '57', CR: '506', CU: '53', EC: '593', SV: '503', ES: '34', US: '1',
  FR: '33', GT: '502', HN: '504', IT: '39', JP: '81', MX: '52', NI: '505',
  PA: '507', PY: '595', PE: '51', PT: '351', GB: '44', DO: '1', UY: '598', VE: '58',
}

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

  async enviar(
    para: string,
    asunto: string,
    html: string,
    remitente?: string,
    adjuntos?: { filename: string; content: Buffer; contentType?: string }[],
  ) {
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
        ...(adjuntos?.length ? { attachments: adjuntos } : {}),
      })
      if (error) this.logger.error(`Resend rechazo el email a ${para}: ${error.message}`)
      else this.logger.log(`Email "${asunto}" enviado a ${para}`)
    } catch (e: any) {
      this.logger.error(`Error enviando email a ${para}: ${e?.message ?? e}`)
    }
  }

  // Escape para texto interpolado en el HTML de los emails: datos cargados
  // por usuarios/pacientes (el nombre del portal publico es la via critica,
  // llega de un endpoint sin auth) no pueden inyectar markup en un correo
  // que sale firmado por el dominio del consultorio.
  private esc(s: string | null | undefined): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // Solo http(s) para links que vienen de configuracion (ubicacionUrl):
  // cualquier otro scheme no entra a un href del email.
  private urlSegura(u?: string | null): string | null {
    const t = (u ?? '').trim()
    return /^https?:\/\//i.test(t) ? t : null
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

  // WhatsApp del consultorio: si el telefono ya viene en internacional (+...)
  // se respeta; si no, se antepone el prefijo del pais del consultorio (default
  // Bolivia, igual que el front). Sin digitos validos no se arma el link.
  private linkWhatsApp(telefono?: string | null, pais?: string | null) {
    const t = (telefono ?? '').trim()
    if (!t) return null
    const intl = t.startsWith('+') ? t : `+${DIAL_PAIS[pais ?? ''] ?? DIAL_PAIS.BO} ${t}`
    const num = intl.replace(/\D/g, '')
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
    const n = this.esc(nombre)
    const c = this.esc(consultorio)
    return this.layout(
      `Bienvenido/a a ${c}`,
      `Hola ${n}: te crearon una cuenta en el sistema de ${c}. Para empezar a usarla definí tu contraseña con el siguiente botón.`,
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
    ubicacionUrl?: string | null
    pais?: string | null
    fecha: string
    hora: string
    servicio: string
    doctor: string
    slug?: string | null
    token?: string | null
    // 'reprogramada' cambia titulo/intro; el resto del layout es identico
    modo?: 'confirmada' | 'reprogramada'
  }) {
    const linkReprogramar =
      datos.slug && datos.token ? this.linkPortalCita(datos.slug, datos.token, 'reprogramar') : null
    const linkCancelar =
      datos.slug && datos.token ? this.linkPortalCita(datos.slug, datos.token, 'cancelar') : null
    const linkWa = this.linkWhatsApp(datos.telefono, datos.pais)
    // El link de ubicacion: el de Google Maps cargado a mano (solo http/https),
    // o uno armado de la direccion en texto como fallback. Se calcula ANTES
    // del escape para no encodear entidades en la query de Maps.
    const linkUbicacion = this.urlSegura(datos.ubicacionUrl) || this.linkMapa(datos.direccion)

    // Todo texto de usuario/paciente escapado antes de interpolarse en el HTML
    datos = {
      ...datos,
      nombre: this.esc(datos.nombre),
      consultorio: this.esc(datos.consultorio),
      direccion: datos.direccion ? this.esc(datos.direccion) : datos.direccion,
      telefono: datos.telefono ? this.esc(datos.telefono) : datos.telefono,
      fecha: this.esc(datos.fecha),
      hora: this.esc(datos.hora),
      servicio: this.esc(datos.servicio),
      doctor: this.esc(datos.doctor),
    }

    const esReprog = datos.modo === 'reprogramada'
    const titulo = esReprog ? 'Tu cita fue reprogramada' : 'Tu reserva fue confirmada'
    const intro = esReprog
      ? `Hola <strong style="color:#0f172a">${datos.nombre}</strong>, actualizamos tu cita. Esta es tu nueva fecha y hora.`
      : `Hola <strong style="color:#0f172a">${datos.nombre}</strong>, nos alegra confirmar tu cita. Te esperamos.`

    // Boton de accion: fondo y borde van en el <td> (Outlook no dibuja bien
    // border/border-radius sobre <a>), y el <a display:block> da el area clickeable.
    const boton = (href: string, texto: string, bg: string, color: string, borde: string) =>
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr>
        <td style="background-color:${bg};border:1px solid ${borde};border-radius:10px;text-align:center">
          <a href="${href}" style="display:block;padding:13px 8px;color:${color};text-decoration:none;font-size:14px;font-weight:600;white-space:nowrap">${texto}</a>
        </td>
      </tr></table>`

    // Link chico inline (ej. "Ver en Maps", "WhatsApp") al lado de un dato
    const linkInline = (href: string, texto: string, color: string) =>
      `<a href="${href}" style="color:${color};font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap">${texto} &rsaquo;</a>`

    // Fila de la tarjeta de datos: emoji + etiqueta + valor (con link opcional)
    const filaDato = (emoji: string, etiqueta: string, valor: string, extra = '') =>
      `<tr>
        <td style="padding:6px 10px 6px 0;width:24px;font-size:18px;vertical-align:top">${emoji}</td>
        <td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;vertical-align:top;white-space:nowrap">${etiqueta}</td>
        <td style="padding:6px 0;color:#0f172a;font-size:15px;font-weight:600;text-align:right;vertical-align:top">${valor}${extra}</td>
      </tr>`

    // Dirección: muestra el texto y, al lado, el link a Maps (o solo el link
    // si hay ubicación cargada pero no hay dirección escrita)
    const filaConsultorio = datos.direccion
      ? filaDato('📍', 'Dirección', datos.direccion,
          linkUbicacion ? `<br><span style="font-weight:400">${linkInline(linkUbicacion, 'Ver en Maps', '#0e7490')}</span>` : '')
      : linkUbicacion
      ? filaDato('📍', 'Ubicación', linkInline(linkUbicacion, 'Ver en Maps', '#0e7490'))
      : ''

    // Teléfono: tappable (tel:) y, debajo, el link de WhatsApp
    const filaTelefono = datos.telefono
      ? `<tr>
          <td style="padding:6px 10px 6px 0;width:24px;font-size:18px;vertical-align:top">📞</td>
          <td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;vertical-align:top;white-space:nowrap">Teléfono</td>
          <td style="padding:6px 0;text-align:right;vertical-align:top">
            <a href="tel:${datos.telefono}" style="color:#0f172a;font-size:15px;font-weight:600;text-decoration:none">${datos.telefono}</a>
            ${linkWa ? `<br>${linkInline(linkWa, 'WhatsApp', '#15803d')}` : ''}
          </td>
        </tr>`
      : ''

    // Solo dos acciones, lado a lado: reprogramar y cancelar (vienen juntas:
    // ambas necesitan slug + token del portal).
    const acciones = linkReprogramar && linkCancelar
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="50%" style="padding-right:5px">${boton(linkReprogramar, 'Reprogramar cita', '#0891b2', '#ffffff', '#0891b2')}</td>
          <td width="50%" style="padding-left:5px">${boton(linkCancelar, 'Cancelar cita', '#ffffff', '#b91c1c', '#fecaca')}</td>
        </tr></table>`
      : ''

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
          <h1 style="margin:18px 0 4px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:700">${titulo}</h1>
          <p style="margin:0;font-size:13px;color:#cffafe">${datos.consultorio}</p>
        </td></tr>

        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155">
            ${intro}
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

          ${acciones}
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

  // .ics (iCalendar) como INVITACION real (METHOD:REQUEST con ORGANIZER +
  // ATTENDEE): asi Outlook/Gmail lo reconocen y lo agregan al calendario (no
  // queda como archivo inerte). Tiempos en UTC; UID estable por cita y
  // SEQUENCE para que al reprogramar el evento se actualice en vez de duplicar.
  buildICS(datos: {
    citaId: number
    consultorio: string
    servicio: string
    doctor: string
    inicio: Date
    duracionMin: number
    direccion?: string | null
    ubicacionUrl?: string | null
    attendeeEmail: string
    attendeeNombre: string
    secuencia?: number
  }) {
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    const esc = (s: string) =>
      (s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
    // CN va entre comillas (admite comas/espacios); se quitan las comillas internas
    const cn = (s: string) => `"${(s ?? '').replace(/"/g, '')}"`
    const fin = new Date(datos.inicio.getTime() + datos.duracionMin * 60 * 1000)
    const host = this.webBase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '') || 'consultech'
    const organizador = this.direccionRemitente()
    const lugar = datos.direccion?.trim() || datos.ubicacionUrl?.trim() || ''
    const desc = [
      `Profesional: ${datos.doctor}`,
      `Consultorio: ${datos.consultorio}`,
      ...(datos.ubicacionUrl?.trim() ? [`Ubicación: ${datos.ubicacionUrl.trim()}`] : []),
    ].join('\n')
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Consultech//Citas//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:cita-${datos.citaId}@${host}`,
      `SEQUENCE:${datos.secuencia ?? 0}`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(datos.inicio)}`,
      `DTEND:${fmt(fin)}`,
      `SUMMARY:${esc(`${datos.servicio} - ${datos.consultorio}`)}`,
      ...(lugar ? [`LOCATION:${esc(lugar)}`] : []),
      `DESCRIPTION:${esc(desc)}`,
      `ORGANIZER;CN=${cn(datos.consultorio)}:mailto:${organizador}`,
      `ATTENDEE;CN=${cn(datos.attendeeNombre)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${datos.attendeeEmail}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
  }

  // Aviso al paciente cuando su cita se cancela (por el consultorio o por el
  // propio paciente desde el link). Mismo estilo de marca; sin acciones de
  // reprogramar: ofrece volver a reservar y deja a mano el contacto.
  htmlCitaCancelada(datos: {
    nombre: string
    consultorio: string
    direccion?: string | null
    telefono?: string | null
    ubicacionUrl?: string | null
    pais?: string | null
    fecha: string
    hora: string
    servicio: string
    doctor: string
    slug?: string | null
  }) {
    const linkWa = this.linkWhatsApp(datos.telefono, datos.pais)
    const linkUbicacion = this.urlSegura(datos.ubicacionUrl) || this.linkMapa(datos.direccion)
    const linkReservar = datos.slug ? `${this.webBase()}/reservar/${datos.slug}` : null

    // Todo texto de usuario/paciente escapado antes de interpolarse en el HTML
    datos = {
      ...datos,
      nombre: this.esc(datos.nombre),
      consultorio: this.esc(datos.consultorio),
      direccion: datos.direccion ? this.esc(datos.direccion) : datos.direccion,
      telefono: datos.telefono ? this.esc(datos.telefono) : datos.telefono,
      fecha: this.esc(datos.fecha),
      hora: this.esc(datos.hora),
      servicio: this.esc(datos.servicio),
      doctor: this.esc(datos.doctor),
    }

    const linkInline = (href: string, texto: string, color: string) =>
      `<a href="${href}" style="color:${color};font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap">${texto} &rsaquo;</a>`
    const fila = (emoji: string, etiqueta: string, valor: string, extra = '') =>
      `<tr>
        <td style="padding:6px 10px 6px 0;width:24px;font-size:18px;vertical-align:top">${emoji}</td>
        <td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;vertical-align:top;white-space:nowrap">${etiqueta}</td>
        <td style="padding:6px 0;color:#0f172a;font-size:15px;font-weight:600;text-align:right;vertical-align:top">${valor}${extra}</td>
      </tr>`

    const filaDir = datos.direccion
      ? fila('📍', 'Dirección', datos.direccion,
          linkUbicacion ? `<br><span style="font-weight:400">${linkInline(linkUbicacion, 'Ver en Maps', '#0e7490')}</span>` : '')
      : ''
    const filaTel = datos.telefono
      ? `<tr>
          <td style="padding:6px 10px 6px 0;width:24px;font-size:18px;vertical-align:top">📞</td>
          <td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;vertical-align:top;white-space:nowrap">Teléfono</td>
          <td style="padding:6px 0;text-align:right;vertical-align:top">
            <a href="tel:${datos.telefono}" style="color:#0f172a;font-size:15px;font-weight:600;text-decoration:none">${datos.telefono}</a>
            ${linkWa ? `<br>${linkInline(linkWa, 'WhatsApp', '#15803d')}` : ''}
          </td>
        </tr>`
      : ''

    return `
<div style="margin:0;padding:0;background-color:#f1f5f9">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">

        <tr><td style="background-color:#0e7490;background-image:linear-gradient(135deg,#0e7490,#0891b2);padding:30px 32px;text-align:center">
          <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
            <td style="width:64px;height:64px;background-color:#ffffff;border-radius:50%;text-align:center;vertical-align:middle">
              <span style="font-size:30px;line-height:64px;color:#dc2626;font-weight:700">&#10005;</span>
            </td>
          </tr></table>
          <h1 style="margin:18px 0 4px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:700">Tu cita fue cancelada</h1>
          <p style="margin:0;font-size:13px;color:#cffafe">${datos.consultorio}</p>
        </td></tr>

        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155">
            Hola <strong style="color:#0f172a">${datos.nombre}</strong>, tu cita quedó cancelada. Si fue un error o querés otro horario, podés reservar de nuevo cuando gustes.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:14px;margin:0 0 18px">
            <tr><td style="padding:16px 20px;text-align:center">
              <p style="margin:0 0 4px;font-size:13px;color:#b91c1c;font-weight:600">Cita cancelada</p>
              <p style="margin:0;font-size:16px;line-height:1.4;color:#0f172a;font-weight:600"><span style="text-decoration:line-through;color:#64748b">${datos.fecha} · ${datos.hora}</span></p>
              <p style="margin:6px 0 0;font-size:13px;color:#64748b">${datos.servicio} con ${datos.doctor}</p>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:14px;margin:0 0 20px">
            <tr><td style="padding:16px 20px">
              <p style="margin:0 0 8px;font-size:13px;color:#64748b;font-weight:600">Información del consultorio</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${fila('🏥', 'Consultorio', datos.consultorio)}
                ${filaDir}
                ${filaTel}
              </table>
            </td></tr>
          </table>

          ${linkReservar ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr>
            <td style="background-color:#0891b2;border:1px solid #0891b2;border-radius:10px;text-align:center">
              <a href="${linkReservar}" style="display:block;padding:13px 12px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600">Reservar otra cita</a>
            </td>
          </tr></table>` : ''}
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
    // Nombres de usuario/cuenta escapados: tambien son texto cargado en la app
    d = {
      ...d,
      consultorio: this.esc(d.consultorio),
      abrioPor: this.esc(d.abrioPor),
      cerroPor: this.esc(d.cerroPor),
      cuentas: d.cuentas.map((c) => ({ nombre: this.esc(c.nombre), total: c.total })),
    }
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
      `Hola ${this.esc(nombre)}: recibimos un pedido para restablecer tu contraseña. Si no fuiste vos, ignorá este correo.`,
      link,
      'Elegir nueva contraseña',
    )
  }
}
