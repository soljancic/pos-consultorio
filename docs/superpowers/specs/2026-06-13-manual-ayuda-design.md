# Spec: Manual de usuario in-app (/ayuda)

> Fecha: 2026-06-13 · Estado: APROBADO (a implementar). Decisiones del owner:
> manual DENTRO de la app (seccion /ayuda navegable), organizado POR ROL, CON
> capturas de pantalla desde el arranque.

---

## Problema
No hay manual de usuario. Cada onboarding de secretaria/doctor/caja se hace a
pulmon. El owner quiere una ayuda a un clic, dentro del sistema, que cada persona
lea segun su rol, con capturas.

## Decisiones (owner)
1. **In-app**, no PDF ni markdown suelto: seccion `/ayuda` en la web.
2. **Por rol**: Administrador, Secretaria, Doctor, Caja. Cada uno entra y ve lo
   suyo; el ADMIN puede ver todos.
3. **Con capturas**: cada paso clave con su screenshot.

## Diseno

### Ruta y acceso
- `/ayuda` bajo `AppShell` (autenticado, todos los roles). Item "Ayuda"
  (icono `HelpCircle`) en el nav + un boton "?" en la topbar para llegar a un clic.
- Al entrar, preselecciona la seccion del rol del usuario logueado; un selector
  permite cambiar de rol (util para el ADMIN o para capacitar).

### Estructura de la pagina
- Layout 2 columnas (responsive: indice colapsable en movil):
  - **Indice** lateral: roles (chips/tabs) -> lista de temas de ese rol (ancla por
    tema para deep-link `/ayuda#cobrar-una-cita`).
  - **Contenido**: por tema, titulo + intro corta + **pasos numerados** + la captura.
- Copy en espanol con tildes; tono directo, orientado a tareas ("Como cobrar una
  cita") no a referencia.

### Modelo de contenido (data-driven)
- `features/ayuda/contenido.ts`: arreglo tipado
  `{ rol, icono, temas: [{ id, titulo, intro?, pasos: string[], imagen?: string }] }`.
- `AyudaPage` + componentes genericos renderizan ese dato. Asi el contenido se
  edita en un solo lugar y a futuro una "ayuda contextual" (un ? por pantalla)
  puede reusar los mismos temas.

### Capturas
- En `public/ayuda/*.png`. Se generan con un script Playwright
  (`scripts/capturar-ayuda` o un spec de e2e) que: registra un consultorio,
  siembra datos via API, navega cada flujo y saca el screenshot. **Regenerables**
  cuando cambia la UI (resuelve el costo de mantenimiento).

### Contenido por rol (outline)
- **Secretaria**: agendar cita (incl. desde slot vacio), reprogramar / cancelar /
  no asistio, cobrar (parcial y dividido), abrir y cerrar caja (arqueo ciego),
  registrar gasto, deudores + recordatorio por WhatsApp, cola de Mensajes, alta de
  paciente, enviar link de reserva del portal.
- **Doctor**: su agenda, registrar atencion (motivo/diagnostico/tratamiento),
  historia clinica, recetas PDF, agendar proximo control, su Calendario de atencion
  (horarios y bloqueos).
- **Caja**: abrir/cerrar turno, cobrar, arqueo ciego, (anular pago si corresponde).
- **Administrador**: todo lo anterior + Catalogo (servicios; doctores con precio por
  servicio y foto; tipos de gasto/cuenta), usuarios y roles, Configuracion (datos,
  logo, QR, plantillas de WhatsApp, portal, email de cierre de caja), Reportes y
  comisiones, Actividad (logs).

### Verificacion
- E2E: `/ayuda` carga, cambia de rol y muestra un tema con su imagen.
- Revision responsive a 390px.

## Fuera de alcance (v1)
- Busqueda full-text dentro de la ayuda.
- Multiidioma / video tutoriales.
- Ayuda contextual por pantalla (queda habilitada por el modelo de datos, se hace
  despues si se quiere).
