# Pacientes: paginacion server-side + bulk XLSX + restyle header

Fecha: 2026-06-18
Estado: aprobado (diseno), pendiente plan de implementacion
Modulo: `apps/api/src/modules/pacientes` + `apps/web/src/features/pacientes`

## Problema

La lista de pacientes hoy carga TODO el padron del consultorio en una sola
query (`findMany` sin `take`/`skip`) y renderiza todas las filas en el DOM
(`<table>` plano, sin virtualizacion ni paginacion). Con cientos/miles de
pacientes el render inicial laguea (sobre todo en celular, es PWA) y cada
busqueda re-renderiza toda la lista. Ademas falta carga/baja masiva (XLSX).

## Objetivos

1. Acotar carga y DOM con paginacion server-side + scroll infinito.
2. Carga masiva desde XLSX (crear y, opcional, actualizar existentes).
3. Exportar el padron a XLSX.
4. Restyle del header: buscador centrado + split button (Nuevo / Importar / Exportar).

## Decisiones (cerradas con el owner)

- **Match de import (actualizar existentes):** DNI si la fila lo trae, sino
  nombre+apellido (consistente con la identidad unica actual del paciente).
- **Columnas del Excel (importar = ejemplo = exportar):** set completo —
  nombre*, apellido*, dni, telefono, pais, email, sexo (M/F/X), fechaNacimiento
  (ISO `YYYY-MM-DD`), direccion, notas. (* obligatorio)
- **Lista:** scroll infinito, paginas de 50.
- **Export:** TODOS siempre (activos + archivados), ignora el buscador.
- **Roles:** import / export / sample = **ADMIN** unicamente.
- **Libreria XLSX:** `exceljs` (mantenida en npm, lee+escribe, sin binarios
  nativos). Se evita SheetJS `xlsx` (congelado en npm). Version exacta se fija
  al instalar.

## A. Backend — paginacion de la lista

`GET /pacientes` pasa a paginado offset (simple, suficiente a escala consultorio).

- Query: `page` (default 1), `limit` (default 50, max 100), `search?`,
  `incluirInactivos?`.
- Respuesta: `{ items: Paciente[]; total: number }`.
- Mismo `where` / `select` actuales. `orderBy: [{ apellido: 'asc' }, { nombre:
  'asc' }, { id: 'asc' }]` (id como desempate estable para que offset no salte
  filas). `skip = (page-1)*limit`, `take = limit`.
- `total` via `prisma.paciente.count` con el mismo `where` (en paralelo con el
  findMany).
- Multi-tenant: `consultorioId` del JWT (sin cambios).

### Breaking change de shape — consumidores a migrar
`GET /pacientes` pasa de devolver `Paciente[]` a `{ items, total }`. Hay 3
consumidores en el front, TODOS pasan a leer `.items`:
- `features/pacientes/PacientesPage.tsx` (lista principal → scroll infinito).
- `features/agenda/NuevaCitaModal.tsx:55` (picker de paciente al crear cita).
- `features/reportes/components/ReportFilters.tsx:40` (filtro de paciente).
Los dos pickers son busquedas acotadas: con `limit=50` default alcanza (se
escribe para filtrar). Solo cambian `.data` → `.data.items`.

## B. Frontend — scroll infinito

- `useInfiniteQuery` con `queryKey: ['pacientes', debouncedSearch]`.
- `getNextPageParam`: hay siguiente si `sum(items cargados) < total` →
  `page+1`, sino `undefined`.
- Sentinela al final de la tabla con `IntersectionObserver` → `fetchNextPage()`.
- Filas = `data.pages.flatMap(p => p.items)`. Spinner de "cargando mas" al pie.
- Virtualizacion del DOM: FUERA de scope (YAGNI). El scroll infinito acota la
  carga inicial y el payload; si a futuro el DOM acumulado molesta, se agrega
  virtualizacion sin tocar el backend.

## C. Backend — import / export / sample

Endpoints nuevos en el modulo pacientes, todos `@Roles(Rol.ADMIN)`:

### `POST /pacientes/import`
- Multipart, archivo XLSX en memoria (multer memoryStorage, igual que fotos).
- Body: `actualizarExistentes: boolean` (default false).
- Parseo con `exceljs`; mapea columnas por header (nombres del set completo).
- Validacion por fila reusando las mismas reglas del `CreatePacienteDto`
  (class-validator sobre un objeto por fila; nombre+apellido obligatorios,
  sexo ∈ M/F/X, fechaNacimiento ISO, etc.).
- Match key: si `dni` no vacio → busca por `{consultorioId, dni}`; sino por
  `{consultorioId, nombre, apellido}` (case-insensitive como el bloqueo actual).
- `actualizarExistentes=false`: si matchea → **omite** (lo reporta), no pisa.
- `actualizarExistentes=true`: matchea → **UPDATE** solo de los campos
  presentes en la fila (no borra lo que viene vacio).
- Todo dentro de `prisma.$transaction`. Una fila invalida NO corta el resto:
  se acumula en `errores`.
- Respuesta: `{ creados: number; actualizados: number; omitidos: number;
  errores: Array<{ fila: number; motivo: string }> }`.
- Registra la operacion en `logs` (accion CREATE/UPDATE, entidad 'paciente_import').

### `GET /pacientes/export`
- Genera XLSX de TODOS los pacientes del consultorio (activos + archivados,
  `deletedAt: null`), columnas = set completo, y lo descarga
  (`Content-Disposition: attachment`).

### `GET /pacientes/import/sample`
- Devuelve XLSX plantilla: fila de headers (set completo) + 1 fila de ejemplo.
- Unico origen de la definicion de columnas (front linkea aca).

## D. Frontend — header restyle + split button

Header en 3 zonas:
- Izq: titulo "Pacientes" (chip icon actual).
- Centro: **buscador** (sube desde el body; debounce 300ms, server-side).
- Der: **split button** + campana.

Split button (estilo del screenshot de referencia):
- Accion primaria: **"Nuevo paciente"** (abre `PacienteModal`).
- Caret → menu accesible nuevo: **↑ Importar XLSX** (abre modal import) /
  **↓ Exportar** (dispara descarga). Solo visible/operativo para ADMIN.
- Menu accesible: `role="menu"`, foco al abrir, navegacion teclado, Esc cierra,
  click-fuera cierra. Componente nuevo en `components/shared/` (no existe uno).

## E. Frontend — modal Import (referencia del screenshot)

- Header "Importar contactos" (`ModalHeader`).
- Descripcion + barra de progreso durante el upload.
- Checkbox **"Actualizar datos existentes"**.
- Boton **Seleccionar archivo** (input file XLSX oculto + boton estilizado).
- Link **Descargar archivo de ejemplo** → `GET /pacientes/import/sample`.
- Footer: Cancelar / Importar (Importar deshabilitado sin archivo).
- Al terminar: resumen creados/actualizados/omitidos + lista de errores por fila.
- Copy en espanol con tildes. Sin `window.confirm/alert` nativos.

## Regla UI obligatoria

Todo el JSX nuevo (split button, menu, modal import, header, lista infinita)
pasa por los skills **impeccable + ui-ux-pro-max + frontend-design** ANTES de
escribirse, en la fase de implementacion. Respeta tokens de `lib/ui.ts`,
FloatingInput/Select/Textarea donde aplique, touch >=44px, focus-visible,
tabular-nums en montos.

## Manejo de errores

- Import: archivo no XLSX / vacio → 400 con mensaje claro. Filas invalidas →
  no cortan, van a `errores[]`. Limite de tamano de archivo (multer) razonable.
- Export/sample: si no hay pacientes igual baja el XLSX (solo headers).
- Front: estados de carga (barra), error (banner del design system), exito
  (resumen).

## Testing

- Unit (API): parseo de filas (validas, invalidas, dni vacio → match por
  nombre+apellido), modo crear vs actualizar, no-pisar-vacios.
- Gate `.ps1`: crea tenant ADMIN, sube sample, importa, verifica
  creados/actualizados, exporta y reimporta (round-trip).
- E2E (opcional): flujo del modal import feliz + con errores.

## Fases de implementacion

1. Paginacion + scroll infinito (backend `GET` + lista front).
2. Header restyle + split button + buscador centrado.
3. Import / Export / Sample (backend + modal front).

## Fuera de scope

- Virtualizacion del DOM (futuro, si hace falta).
- Import CSV (solo XLSX).
- Mapeo de columnas configurable por el usuario (headers fijos).
