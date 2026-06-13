# Spec: pulido de UI (landing, modales, estados vacios, responsive)

> Fecha: 2026-06-13 · Estado: IMPLEMENTADO (documentado retroactivamente).
> Lote de mejoras visuales/UX pedidas por el owner. Regla transversal: toda UI
> pasa por los skills `ui-ux-pro-max` + `frontend-design` (asentada en CLAUDE.md,
> commit 463097e).

---

## 1. Landing mas "tech" (commit e526048)
Rediseno "clinical tech" de la `LandingPage`: hero oscuro luminoso (auroras
cian/azul + grilla con mascara radial), preview del producto en glass (mock
agenda + caja), titulo con gradiente, cards glass con glow, 3 pasos, CTA con halo,
footer "by Toptech". Marca con isotipo (visible en dark) + wordmark. Movimiento
CSS con `prefers-reduced-motion`.

## 2. Modales parejos (commits 6f08ee8, d8340c4, 57efcdc, 9b89922, dab8f26)
- Pulido global del shell: scrim `bg-slate-950/55 backdrop-blur-sm` + fade; panel
  `rounded-2xl shadow-2xl ring` + entrada `modal-pop` (keyframes en index.css,
  anulados por reduced-motion). Aplicado por sed a los 21 modales.
- Componente compartido `ModalHeader` (chip de icono primary/destructive + barra
  con tinte + titulo/subtitulo + cerrar, sticky/opaco). **Todos** los modales lo
  usan (convencion: los nuevos tambien). Subtitulo con `line-clamp-2` (movil).

## 3. Estados vacios (commits 361dcad, c073284)
Componente `EmptyState` (icono en circulo + titulo + descripcion + accion opcional)
en Agenda, Deudores, Pacientes, Caja, Gastos, Catalogo, ficha de paciente,
Mensajes, Actividad, Calendario y Agenda-Dia (con boton "Ir al Catalogo"). Los
vacios chicos de Reportes quedan inline (sub-secciones, no vacios de pagina).

## 4. Catalogo en 2 tabs (commit becebd8)
"Servicios y doctores" | "Tipos de gasto y cuenta" (el 2do solo ADMIN), patron de
Configuracion, para que la pagina no quede larguisima.

## 5. UX del portal y la agenda (commits 60e59b4, d8d7e21, 67925ee)
- Portal: horarios en grilla auto-fill (columnas dinamicas), "Siguiente" de ancho
  completo que revela el form y baja el scroll, refresh de dias/slots cada 60s.
- Agenda: auto-refresco de citas cada 30s (refetchInterval, parcial via React,
  sin recargar) + selector de orden Estado/Hora en la vista Lista (con "Hora" la
  tarjeta no salta al cambiar de estado).

## 6. Revision responsive movil
Verificada a 390px con capturas (landing, modal, caja): stackea sin scroll
horizontal.

## Verificacion
tsc api/web limpios; suite E2E 20/20 tras cada lote.
