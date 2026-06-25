# ConsulTech — Presentación de Negocio

> Documento para presentar el sistema a una audiencia de negocio (socios, inversores,
> consultorios prospecto, equipo comercial). No es documentación técnica.
> _by Toptech · última actualización: 2026-06-25_

---

## Resumen ejecutivo (1 párrafo)

**ConsulTech** es el sistema operativo diario de un consultorio médico: agenda, cobros,
caja, deudas, gastos, pacientes y reportes, todo en una sola herramienta. Reemplaza el
cuaderno, la planilla de Excel y el software clínico viejo y lento por algo rápido,
visual y accionable. Está pensado para consultorios chicos y medianos (1 a 10
profesionales) y ya está **en producción**. Modelo SaaS por licencia mensual, multi-consultorio.

**La frase de ascensor:** _"Que la recepcionista agende y cobre sin fricción, que el
dueño confíe en que la caja cuadra, y que nadie tenga que pensar en la herramienta."_

---

## El problema

Los consultorios pequeños hoy operan con herramientas que no conversan entre sí:

- **Agenda** en cuaderno o Google Calendar → choques de horario, citas perdidas.
- **Cobros y caja** en planilla o de memoria → la caja no cuadra, hay fugas de dinero.
- **Deudas** que nadie sigue → se cobra tarde o no se cobra.
- **Sin visibilidad financiera** → el dueño no sabe cuánto ganó realmente este mes.
- **Software clínico legacy** → gris, apretado, lento, lleno de menús; nadie lo quiere usar.
- **Ausencias (no-shows)** sin control → horarios desperdiciados.

Resultado: tiempo perdido, plata que se escapa y decisiones a ciegas.

---

## La solución

Una sola plataforma, rápida y clara, que cubre **todo el día del consultorio**:

| Antes | Con ConsulTech |
|---|---|
| Cuaderno + Excel + software viejo | Una sola herramienta |
| "¿Cuánto cobramos hoy?" → revisar papeles | Lo ve en segundos en el dashboard |
| "¿Quién me debe?" → no se sabe | Lista de deudores + cobro por WhatsApp en un clic |
| Caja que no cuadra | Arqueo ciego: control anti-fraude del efectivo |
| Pacientes que no vienen | Recordatorios automáticos → menos ausencias |
| Reservas solo por teléfono | Portal online tipo Calendly, 24/7 |
| Cada doctor en su propia planilla | Equipo multi-doctor en una sola agenda, cada uno con su precio |
| Precio único para todos | Precios por servicio, por doctor y por aseguradora |

---

## A quién sirve

**Público objetivo:** médicos independientes, odontólogos, psicólogos, fisioterapeutas,
nutricionistas y estéticas médicas con **1 a 10 profesionales**. Sirve igual al
profesional solo que a **equipos de varios doctores** compartiendo agenda, caja y reportes.

**Los tres usuarios y su problema resuelto:**

- **Recepcionista / secretaria** → agenda y cobra todo el día sin cambiar de pantalla.
- **Doctor/a** → ve qué se le hizo al paciente la última vez y emite recetas.
- **Dueño (admin)** → controla caja, deudas, gastos y reportes; confía en los números.

---

## Qué hace hoy (en valor de negocio)

Todo lo siguiente ya está **funcionando en producción**:

### Agenda y reservas
- Agenda diaria, semanal y mensual con estados de cita; ves el día de un vistazo.
- **Portal de reservas online** (tipo Calendly): el paciente reserva solo, 24/7, y el
  consultorio aprueba con un clic.
- Validación de choques de horario.

### Equipo multi-doctor
- **Varios profesionales en una sola agenda**, cada uno con su color, especialidad y foto.
- **Horario propio por doctor** (días y franjas), con bloqueos por vacaciones o ausencias.
- **Servicios por doctor**: cada profesional atiende solo lo que le corresponde.
- **Comisiones por doctor** y liquidación mensual automática.
- Reportes filtrables por doctor (atendidos, ingresos, ausencias).

### Precios flexibles por consulta
- **Precio por servicio**: cada tipo de consulta o tratamiento tiene su propia tarifa.
- **Precio por doctor**: un mismo servicio puede costar distinto según el profesional.
- **Precio por aseguradora**: tarifa diferenciada por convenio (cuánto paga el paciente
  y cuánto cubre el seguro).
- Ajuste de precio puntual con motivo, auditado.

### Dinero bajo control
- Cobros con **pagos parciales y divididos** (efectivo, QR, tarjeta, vales).
- **Caja diaria con arqueo ciego**: control anti-fraude; el efectivo siempre cuadra.
- **Deudores**: quién debe, cuánto, y recordatorio de deuda por WhatsApp.
- **Gastos** con categorías y **resultado neto** en el dashboard.
- **Comisiones por doctor** y liquidación mensual automática.

### Visibilidad financiera
- **Dashboard del día**: cobros, en espera, atendidos, por cobrar, caja, deudas.
- **Reportes mensuales** y por doctor, exportables a Excel.

### Pacientes y clínica
- Ficha completa con búsqueda e **historia clínica** cronológica + adjuntos.
- **Recetas en PDF** con membrete y firma del doctor.

### Menos ausencias
- **Recordatorios** de cita y de deuda (cola asistida por WhatsApp + emails).
- **Contador de no-shows** y prepago automático para pacientes reincidentes.

### Aseguradoras y convenios
- Catálogo de **aseguradoras** y sus **categorías** (con % de cobertura).
- **Tarifas por servicio y por convenio**: el sistema separa solo cuánto paga el paciente
  y cuánto cubre el seguro, sin cálculos a mano.
- **Cobertura aplicada en la cita y el cobro** automáticamente.
- **Liquidaciones** a las aseguradoras y su reporte.

### Productos e inventario
- **Catálogo de productos** con control de stock.
- **Venta junto al cobro** de la consulta (consulta + productos en un mismo ticket).
- **Venta directa** de productos, sin necesidad de una cita.

### En el celular (PWA)
- Funciona como **app instalable** en el celular, incluso con internet inestable.

---

## Por qué este y no otro

- **No es un sistema hospitalario:** es rápido, visual y accionable; pensado para el
  mostrador, entre llamadas y pacientes.
- **No es software legacy:** interfaz moderna, clara, con modo oscuro y diseño cuidado.
- **No es un SaaS genérico:** está construido alrededor del flujo real de un consultorio.
- **Pensado para equipos:** varios doctores, cada uno con su agenda, sus servicios y sus
  precios; con aseguradoras y venta de productos incluidas, no como módulos aparte caros.
- **Seguro y aislado:** cada consultorio tiene sus datos separados; permisos por rol
  (admin, secretaria, doctor, caja).
- **Listo para crecer:** multi-consultorio desde la base.

---

## Estado actual

- ✔ **En producción**, accesible vía web y como app instalable (PWA).
- ✔ Etapas 1, 2, 2.5 y 3 (canal manual) **completas**; comisiones por doctor hechas.
- ✔ Suite de pruebas automatizadas (gates de API + pruebas de interfaz).
- ✔ Emails transaccionales con dominio propio verificado.

---

## Hacia dónde va (roadmap)

- **Corto plazo (decisiones del dueño):** WhatsApp Business API (recordatorios 100%
  automáticos), facturación electrónica, paquetes de citas prepagas.
- **Mediano plazo:** multi-sucursal (varias sedes bajo un mismo consultorio).
- **Largo plazo:** portal del paciente con **pagos online**, y verticales especializadas
  (ej. odontograma, consentimientos).

---

## Modelo de negocio

- **SaaS por licencia mensual**, multi-consultorio (cada cliente = un tenant aislado).
- Comercializado **by Toptech**.
- _(Completar con precios, planes por nº de profesionales/sucursales y política de
  onboarding según la estrategia comercial.)_

---

## Cierre / llamado a la acción

ConsulTech le da al consultorio **control del dinero, de la agenda y de los pacientes**
en una sola herramienta que la gente realmente usa. Está listo, probado y en producción.

**Siguiente paso sugerido:** una demo en vivo de 15 minutos sobre un consultorio de prueba
(agendar → cobrar → cerrar caja → ver reportes).

---

### Guion de demo (15 min)

1. **Agenda** — crear una cita; mostrar estados y vista del día. _(3 min)_
2. **Cobro** — cobrar la cita con pago parcial; mostrar la caja actualizándose. _(3 min)_
3. **Deudores** — ver quién debe y enviar recordatorio por WhatsApp. _(2 min)_
4. **Caja** — cierre con arqueo ciego; mostrar el control anti-fraude. _(3 min)_
5. **Dashboard y reportes** — cuánto entró, salió y se ganó; exportar a Excel. _(2 min)_
6. **Portal de reservas** — reservar como si fueras un paciente, online. _(2 min)_

_Pasos opcionales según el cliente:_ mostrar **varios doctores** con precios distintos
en la agenda, una cita con **aseguradora** (cobertura aplicada sola) y un cobro con
**productos** además de la consulta.
