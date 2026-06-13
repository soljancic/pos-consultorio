# Spec: precio por doctor/servicio + foto del doctor

> Fecha: 2026-06-13 · Estado: IMPLEMENTADO (documentado retroactivamente).
> Dos features de la pantalla de doctores (Catalogo), pedidos directos del owner.

---

## 1. Precio por doctor para un servicio (override del precioBase)

### Problema
Hoy se elige que servicios atiende cada doctor (M2M), pero todos cobran el
`precioBase` del servicio. El owner quiere que cada doctor pueda tener su propio
precio por servicio: vacio = precio del servicio; con precio, al **crear la cita**
el cobro toma ese precio (override).

### Diseno
- **Tabla aditiva** `doctor_servicio_precios` (doctorId, servicioId, precio,
  `@@unique([doctorId, servicioId])`). NO se toca el M2M implicito doctor-servicio
  (membresia): bajo riesgo, sin migracion de datos. La fila existe solo si hay
  override.
- `SetServiciosDto` acepta `precios?: { servicioId, precio }[]` (nested DTO con
  `@ValidateNested` + `@Type`). `setServicios` reconcilia los overrides (reemplazo
  completo: borra los del doctor y crea los provistos, solo servicios del tenant),
  ademas de la membresia. `findAll`/`setServicios` devuelven `preciosServicio`.
- `citas.create`: el cobro usa el override del doctor para el servicio si existe,
  si no el `precioBase`. Mismo criterio al **cambiar de servicio** en reprogramar
  (`citas.service`) y en la atencion (`atenciones.service`) para consistencia.
- `DoctorModal`: junto a cada servicio marcado, input de precio opcional con el
  `precioBase` como placeholder; al guardar manda solo los que tienen precio.

### Verificacion
- Gate `gate-doctor-servicios` casos 10-13: set override, listado lo expone, cita
  con override -> cobro 1500 (base 1000), cita sin override -> cobro 500 (base).

---

## 2. Foto del doctor

### Problema
La agenda por dia y los horarios muestran un circulo de color por doctor. El owner
quiere poder cargar la foto del doctor y que esa foto salga en lugar del circulo;
sin foto, el circulo de color (fallback).

### Diseno
- Schema `Doctor.fotoUrl String?` + `@pos/types` Doctor con `fotoUrl`.
- `POST /doctores/:id/foto` (ADMIN, multer) sube a Cloudinary (folder `doctores`,
  public_id estable por doctor con overwrite), mismo patron que el logo del
  consultorio; guarda `fotoUrl`.
- Componente compartido `DoctorAvatar`: muestra la foto (object-cover + ring) o el
  circulo de color con iniciales si no hay foto. Cableado en `AgendaDiaGrid`,
  `CalendarioAtencionPage` (Horarios) y las cards de doctores del Catalogo.
- `DoctorModal`: seccion de foto con preview + boton subir/cambiar; la foto se sube
  despues de crear/editar el doctor (vale para alta y edicion).

### Verificacion
- tsc api/web + suite E2E 20/20 (el fallback al circulo lo cubren los specs de
  agenda). La subida real a Cloudinary reusa el flujo probado del logo/QR.

## Fuera de alcance
- Convertir el M2M doctor-servicio a join explicito (se eligio tabla aditiva).
- Recorte/edicion de la imagen en el cliente (Cloudinary la sirve tal cual).
