# Spec — Portal publico de agendamiento (Etapa 2.5b)

> **Estado: SPEC, no planificado en detalle.** Depende de Etapa 2.5a (Calendario de
> Atencion): sin disponibilidad real no hay slots que ofrecer. Plan de implementacion
> just-in-time antes de ejecutar.

## Objetivo

Automatizar el agendamiento: el consultorio comparte un link tipo Calendly donde el
cliente elige medico (o llega con uno preseleccionado), ve la disponibilidad real y
reserva su horario. La cita entra al sistema en PENDIENTE y la secretaria la opera
como cualquier otra.

## Flujo

1. Admin/secretaria comparte el link (WhatsApp, Instagram, etc.)
   - General: `/reservar/:slugConsultorio` → el cliente elige servicio y doctor
   - Dirigido: `/reservar/:slugConsultorio?doctor=<id>` → doctor fijo, elige solo servicio y horario
2. El portal muestra slots libres: bloques DISPONIBLE del Calendario de Atencion,
   filtrados por `doctor_servicios`, descontando citas existentes (misma logica que
   `GET /doctores/:id/disponibilidad`)
3. El cliente elige slot y deja: nombre, apellido, telefono/whatsapp (email opcional)
4. Backend: match de paciente por telefono/whatsapp (si no existe, lo crea) + crea la
   cita en **PENDIENTE** con su cobro automatico (regla existente). Se loggea con
   origen PORTAL
5. Pantalla de confirmacion con fecha/hora/doctor + aviso "te contactaremos para confirmar"
   (la confirmacion automatica por WhatsApp llega en Etapa 3)

## Modelo / cambios

| Cambio | Detalle |
|---|---|
| `Consultorio.slug` | Unico, generado del nombre, editable por ADMIN |
| `Consultorio.portalActivo` | Toggle on/off del portal |
| `Cita.origen` | Enum INTERNO / PORTAL (default INTERNO) — para metricas y para distinguir en agenda |

## Endpoints publicos (sin auth, prefijo /public)

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | /public/:slug | Datos minimos del consultorio (nombre, logo) + doctores activos + servicios |
| GET | /public/:slug/slots?doctorId=&servicioId=&fecha= | Slots libres |
| POST | /public/:slug/reservas | Crear paciente (match) + cita PENDIENTE |

## Seguridad (critico: superficie publica)

- `consultorioId` SIEMPRE derivado del slug en el server — jamas input del cliente
- Rate limit agresivo en /public (throttler ya instalado) + captcha simple si hay abuso
- Cero enumeracion de datos: el portal nunca devuelve informacion de pacientes ni
  agenda ajena (solo slots libres como horas, sin nombres)
- Validacion estricta de DTOs publicos (whitelist global ya activa)
- El match de paciente por telefono NO confirma ni revela si el paciente existe
- Doble reserva concurrente del mismo slot: re-validar disponibilidad dentro de la
  transaccion de creacion

## UI

- Portal: pagina publica liviana en la misma SPA (ruta sin AppShell) o micrositio
  estatico — decidir en el plan detallado. Mobile-first (el cliente llega del celular)
- Configuracion (ADMIN): toggle portal on/off + copiar link + editar slug
- Agenda: badge "Portal" en citas con origen PORTAL

## Fuera de alcance

- Confirmacion/recordatorio automatico por WhatsApp → Etapa 3
- Pago online al reservar y portal del paciente con historial → Etapa 6
- Multi-sede → Etapa 5

## Verificacion (cuando se implemente)

- Gate runtime: reserva feliz crea paciente + cita PENDIENTE + cobro; slot ocupado
  rechazado; slug invalido 404; rate limit responde 429; payload con consultorioId
  forzado es ignorado
- Spec Playwright: flujo completo desde el link publico hasta ver la cita en la agenda
