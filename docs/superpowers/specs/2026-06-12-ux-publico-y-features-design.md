# Spec: UX publico y features (calendario Calendly, vista Mes, email de cierre, landing)

> Fecha: 2026-06-12 · Estado: IMPLEMENTADO 2026-06-13 (las 4 features, un commit
> cada una: portal Calendly 0796302, vista Mes a023f47, email de cierre 4e421a2,
> landing 4ea7969). tsc api/web limpios; gates extendidos (e25b 3b/9b, e2m9 5b/9c)
> y E2E (agenda-vistas vista Mes, landing.spec).
> Cuatro features independientes, un commit cada una, en este orden:
> 1) calendario Calendly en el portal, 2) vista Mes en Agenda,
> 3) email de cierre de caja, 4) landing Consultech en `/`.
>
> Requisito del owner para TODA la UI de este spec: usar los skills
> `frontend-design` y `ui-ux-pro-max` al implementar.

---

## 1. Portal de reservas: calendario mensual estilo Calendly

### Problema

`ReservarPage` usa `<input type="date">`: el cliente elige fechas a ciegas
(no sabe que dias atiende el doctor) y recien al buscar descubre que no hay
horarios. Calendly resuelve esto mostrando el mes con los dias disponibles
marcados.

### Backend: endpoint de dias disponibles del mes

```
GET /public/:slug/dias?doctorId=&servicioId=&mes=YYYY-MM
→ { dias: string[] }   // ['2026-06-15', '2026-06-16', ...] solo dias con >=1 slot libre
```

- Mismo guard que `/slots`: consultorio activo + `portalActivo` + el doctor
  atiende el servicio (si no lo atiende → `{ dias: [] }`).
- Implementacion en `DoctoresService.getDiasDisponibles(consultorioId,
  doctorId, mes, duracionMin)`: **2 queries** (disponibilidades DISPONIBLE +
  bloqueos del mes; citas no canceladas del mes) y la aritmetica de
  intervalos existente de `getDisponibilidad` aplicada en memoria por dia.
  NO iterar `getDisponibilidad` 30 veces (seria ~60 queries).
- Dias pasados se excluyen; el dia de hoy cuenta solo si le quedan slots
  futuros (reusar la logica de `filtrarSlotsPasados`).
- Fechas como strings `YYYY-MM-DD` y rangos UTC con `Z` segun la regla de
  fechas del proyecto (sin `setHours`).
- DTO con class-validator para `mes` (regex `^\d{4}-\d{2}$`), `doctorId` y
  `servicioId` numericos.

### Frontend: `ReservarPage`

Con servicio + profesional elegidos, reemplazar el input de fecha por:

- **Mini calendario mensual propio** (date-fns + grilla Tailwind, sin
  libreria nueva; patron visual de la captura de Calendly que paso el owner):
  - Dias con disponibilidad: circulo relleno suave (clickeables).
  - Dia seleccionado: circulo solido primary.
  - Resto: gris deshabilitado.
  - Flechas ‹ › para cambiar de mes (query por `mes`, cachea por queryKey
    `['portal-dias', slug, doctorId, servicioId, mes]`).
- Al elegir dia aparecen los horarios (la grilla de slots existente).
- Al tocar un horario, el boton se parte en dos: `[ 11:30 | Siguiente ]`
  (como Calendly). "Siguiente" revela el formulario de datos personales.
  Tocar otro horario mueve el split.
- Layout mobile-first: columna unica (calendario arriba, horarios abajo);
  en `sm+` dos columnas (calendario izquierda, horarios derecha).
- Cambiar servicio/doctor resetea dia y hora (comportamiento actual).
- El flujo con `?p=` (link precargado) no cambia: solo cambia como se elige
  fecha y hora.

### Verificacion

- Gate del portal (E2.5b) extendido: caso para `/dias` (mes con
  disponibilidad → contiene el dia sembrado; doctor que no atiende el
  servicio → vacio).
- `npx tsc --noEmit` en api y web. Revision visual del portal.

---

## 2. Agenda: vista Mes

### Problema

El doctor (y todos los roles) solo ve Lista/Dia/Semana. Pidio ver su mes
completo de atencion. La Agenda ya filtra al rol DOCTOR a sus propias citas.

### Diseno

- Nueva vista `mes` en `AgendaPage` (`Vista = 'lista' | 'dia' | 'semana' |
  'mes'`), boton con icono en el switcher existente, persistida en el mismo
  `localStorage` key.
- Nuevo componente `AgendaMesGrid` (hermano de `AgendaSemanaGrid`):
  - Grilla 7 columnas x 4-6 filas (semanas del mes, lunes primero).
  - Cada celda: numero del dia + hasta 3 chips compactos (hora + apellido
    del paciente, con el color del doctor) + "+N mas" si desborda.
  - Click en un dia → cambia a vista Dia en esa fecha (`setFecha` +
    `cambiarVista('dia')`).
  - Dias fuera del mes en gris; hoy resaltado.
- Query: endpoint existente de citas por rango
  (`/citas?fecha=&hasta=`), queryKey `['citas', 'mes', mesStr, doctorId]`.
- La navegacion ‹ › mueve de a un mes cuando la vista es `mes`.
- Sin cambios de backend.

### Verificacion

- `npx tsc --noEmit` en web. Spec Playwright corto: cambiar a vista Mes y
  ver una cita sembrada en la celda del dia.

---

## 3. Email de resumen al cerrar caja

### Problema

El cierre de caja (arqueo ciego) queda solo en el sistema. El owner quiere
un correo automatico con el resumen del turno a una direccion configurable.

### Diseno

- **Schema**: `Consultorio.emailCierreCaja String?` + migracion
  (`npx prisma migrate dev`).
- **Configuracion** (tab consultorio de `ConfiguracionPage`): input email
  opcional "Email para cierres de caja". DTO del update con `@IsEmail()`
  `@IsOptional()`; el frontend manda `undefined` si esta vacio.
- **CajaService.cerrar**: despues de la transaccion exitosa, si
  `emailCierreCaja` esta configurado, enviar via `MailService.enviar`
  **fire-and-forget** (mismo patron de los emails existentes: un fallo de
  Resend NO rompe ni demora el cierre; queda en el log del server).
- **Contenido** (nuevo `MailService.htmlCierreCaja`, mismo estilo inline de
  los templates existentes):
  - Consultorio, fecha y turno.
  - Quien abrio / quien cerro, hora de apertura y cierre.
  - Monto inicial.
  - Ingresos por metodo de pago (efectivo, tarjeta, QR, transferencia).
  - Gastos del turno.
  - Esperado vs contado y diferencia de arqueo (resaltada si != 0).
  - Cantidad de cobros del turno.
  - Montos con `Decimal` de Prisma formateados al final (nunca float).
- Reabrir y volver a cerrar la caja envia otro email (es otro cierre).

### Verificacion

- Gate de caja (E2-M9) extendido: configurar `emailCierreCaja`, cerrar caja
  → el cierre responde OK aunque Resend no este configurado (el envio es
  fire-and-forget); limpiar el campo → cierre sigue OK.
- `npx tsc --noEmit` en api y web.

---

## 4. Landing Consultech en `/`

### Problema

Hoy `/` exige login: el dominio pelado no muestra nada del producto. De cara
al deploy, la raiz debe ser una pagina publica del producto (decision del
owner: landing de Consultech, opcion marketing).

### Diseno

- **Routing** (`App.tsx`):
  - `/` → `HomeGate`: con token redirige a `/inicio`; sin token renderiza
    `LandingPage`.
  - Dashboard se muda de index a `/inicio`; el item "Inicio" del sidebar
    apunta a `/inicio`.
  - Las rutas del POS pasan a un layout route sin path
    (`<Route element={<PrivateRoute><AppShell/></PrivateRoute>}>`) con las
    mismas paths hijas actuales (no cambian URLs de agenda, caja, etc.).
- **`LandingPage`** (`features/landing/`): estatica, sin llamadas a la API.
  - Hero: imagotipo de `public/brand/`, tagline del producto, CTA
    **Iniciar sesion** → `/login`.
  - 3-4 bloques de features: agenda + portal de reservas online, caja con
    arqueo ciego, deudores y recordatorios WhatsApp, reportes.
  - Footer con marca Toptech (`brand/toptech.png`).
  - Sin links de reservar/QR de consultorios (eso vive en los links por
    slug que comparte cada consultorio).
- **Branding global**: cablear favicon, apple-touch-icon y webmanifest de
  `public/brand/` en `index.html` + titulo "Consultech".
- Copy visible en espanol correcto con tildes.

### Verificacion

- `npx tsc --noEmit` en web.
- Playwright corto: `/` sin token muestra la landing y el CTA navega a
  `/login`; con token `/` redirige a `/inicio`; `/agenda` sigue protegida.
- Revision visual.

---

## Fuera de alcance

- Deploy en Railway (sesion separada, ya planificado).
- Vista mensual de la pagina Horarios/disponibilidad (el owner eligio
  Agenda-Mes).
- Boton "Reservar" o selector de consultorios en la landing.
- Pagina de marketing con formulario de contacto/leads (estatica por ahora).
