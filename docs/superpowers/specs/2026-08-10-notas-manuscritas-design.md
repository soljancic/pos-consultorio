# Spec: notas manuscritas con lapiz en la atencion

> Fecha: 2026-08-10 · Estado: DISENADO (pendiente de plan e implementacion).
> Pedido del owner: en el modal de Atencion, junto a "Evolucion / notas", un boton
> que abra una pantalla completa donde el doctor (psicologo) escriba a mano con
> Apple Pencil o lapiz Android. Escribir es **solo tablet y celular**; leer es en
> cualquier dispositivo.

---

## 1. Contexto y decisiones tomadas

Decisiones del owner durante el brainstorm (2026-08-10):

| Pregunta | Decision |
|---|---|
| Uso principal | La nota de sesion **completa** se escribe a mano. El manuscrito ES la nota clinica. |
| Busqueda en la historia | Se guarda la hoja **y ademas** se manda a OCR. |
| Destino del texto del OCR | Cae en el campo **Evolucion / notas** que ya existe, para revisar. |
| Edicion posterior | **Siempre editable**: se reabre, se corrige y se sigue escribiendo. |
| Organizacion | **Hojas tipo A4 paginadas** ("+ Hoja"), no lienzo infinito. |
| Almacenamiento | **Enfoque A**: trazos vectoriales en Postgres, imagen generada al vuelo. |

### Por que trazos y no una imagen

- **Durabilidad.** Los adjuntos actuales viven en disco local (`UPLOADS_DIR`,
  `atenciones.service.ts`) y no hay volumen declarado en el repo. En Railway el
  disco del contenedor es efimero salvo volumen montado. Postgres si tiene backup.
  (Ver §8: verificar aparte si los adjuntos existentes se estan perdiendo.)
- **Editable por definicion.** Un PNG aplanado contradice la decision de arriba.
- **Peso.** ~30-80 KB de JSON por hoja contra 300-800 KB de PNG legible.
- **Re-renderizable.** Alta resolucion para el OCR, miniatura para la historia
  clinica, y a futuro PDF, todo desde la misma fuente.
- **Re-transcribible.** Si algun dia hay un reconocedor local decente, lee la
  tinta original (mas preciso que releer una imagen).

### Por que el OCR es un modelo de lenguaje y no un OCR clasico

Se evaluaron alternativas "sin IA" a pedido del owner:

- **Tesseract (local, open source):** 20-45% de acierto en cursiva. Su segmentacion
  espera letras separadas; la cursiva las liga y se rompe. Inutilizable.
- **Handwriting Recognition API del navegador** (`navigator.createHandwritingRecognizer`):
  reconoce desde trazos, local y offline — ideal sobre el papel. Pero es propuesta
  WICG solo de Chromium, nacio atada a ChromeOS y **no existe en Safari de iPad**,
  que es el caso principal (Apple Pencil). Descartada por plataforma.
- **Google Cloud Vision / Azure Document Intelligence:** mejores que Tesseract, pero
  siguen siendo ML, los datos igual salen del servidor y flaquean con cursiva ligada.
  Misma exposicion de privacidad por menos precision.
- **iPadOS Scribble / teclado Samsung:** genuinamente local, gratis y privado.
  Scribble anda en los campos de texto de contenido web en Safari, o sea que el
  doctor ya puede tipear con el lapiz en "Evolucion" hoy, sin una linea de codigo.
  Pero convierte a texto *dentro de un campo*; no guarda la hoja. Y peor: **en el
  lienzo estorba** (ver §4, "Scribble se pelea con el lienzo"). No es una
  alternativa al OCR, es su competencia directa por el mismo lapiz.

Conclusion: "sin IA" no es el eje real — toda transcripcion de manuscrito es un
modelo entrenado. El eje es donde corre. Se elige `claude-opus-5` por precision en
cursiva, detras de una interfaz que permita cambiar de proveedor tocando un archivo.

### Por que no se usan las APIs nativas de dibujo del iPad / Android

`PencilKit` (iPadOS) y `androidx.ink` (Android) resuelven todo esto de fabrica:
paleta de herramientas, tinta afinada por el fabricante, el doble toque del Pencil 2.
**Ninguna es alcanzable desde una PWA**: son frameworks nativos, no hay puente en
JavaScript. Llegar a ellas exige envolver la app en un shell nativo y publicar en
App Store y Play Store — cuentas de desarrollador, revisiones, builds y dos canales
de distribucion mas, para un negocio de 5-10 personas que ya tiene la PWA en
produccion.

La ganancia real seria chica: Pointer Events en Safari y Chrome ya exponen presion,
inclinacion y (desde Safari 18.2) los eventos agrupados del Pencil. Lo unico que se
pierde de verdad es el doble toque del Pencil 2, que la web no expone. Cambiar de
plataforma por un atajo de herramienta no cierra.

**Nota de privacidad (asumida y aceptada por el owner):** la hoja sale del servidor
propio hacia la API de Anthropic (retencion 30 dias, no se usa para entrenamiento).
Son notas de psicologia. El owner lo decidio al pedir el OCR.

---

## 2. Modelo de datos

Tabla nueva colgada de `Atencion` (aditiva, sin tocar nada existente):

```prisma
model HojaManuscrita {
  id            Int       @id @default(autoincrement())
  atencionId    Int
  atencion      Atencion  @relation(fields: [atencionId], references: [id])
  orden         Int       // numero de hoja dentro de la atencion: 1, 2, 3...
  trazos        Json      // ver formato abajo
  transcripcion String?   // ultimo texto devuelto por el OCR (auditoria)
  transcritoAt  DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  @@unique([atencionId, orden])
  @@index([atencionId])
  @@map("hojas_manuscritas")
}
```

`Atencion` suma `hojas HojaManuscrita[]`. Migracion **aditiva** (crea tabla + FK):
segura de aplicar en produccion.

### Formato de `trazos`

```jsonc
{
  "v": 1,              // version del formato, para migrar sin romper
  "w": 1240,           // ancho logico de la hoja (A4 vertical a ~150dpi)
  "h": 1754,           // alto logico
  "strokes": [
    {
      "c": "#111827",  // color
      "s": 3,          // grosor base
      "p": [[120.4, 88.1, 0.62], ...]   // [x, y, presion]
    }
  ]
}
```

- Coordenadas redondeadas a **1 decimal**, presion a **2**. Recorta el JSON casi a
  la mitad sin diferencia visible en el trazo.
- Coordenadas en **espacio logico de la hoja**, no en pixeles de pantalla: la misma
  hoja se ve igual en iPad, celular y PC.
- `v` permite cambiar el formato mas adelante sin romper hojas ya guardadas.

### Topes (validados en el service, no solo en el DTO)

| Tope | Valor | Motivo |
|---|---|---|
| Hojas por atencion | 20 | Una sesion no llena mas; evita filas patologicas. |
| Tamano de `trazos` por hoja | 2 MB | Postgres comprime via TOAST, pero el tope protege igual. |
| Puntos por trazo | 10 000 | Corta un bucle de captura descontrolado. |

### `orden` y el borrado soft (cuidado)

`@@unique([atencionId, orden])` convive con `deletedAt`: una hoja borrada **sigue
ocupando su `orden`**. Si el service calculara `max(orden) + 1` solo sobre las hojas
vivas, borrar la ultima hoja y crear otra chocaria contra la fila borrada.

Regla: **`orden` se calcula como `max(orden) + 1` sobre TODAS las filas de la
atencion, incluidas las que tienen `deletedAt`.** El `orden` es un identificador
estable, no una posicion visual; la UI numera las hojas por su posicion en la lista
ordenada, no por el valor de `orden`.

---

## 3. API

Sigue el patron exacto de adjuntos y recetas: `citaId` en la ruta, `consultorioId`
**siempre del JWT**, mismo `citaConGuardDeEscritura` (ADMIN o el doctor de la cita),
`log` en cada escritura, borrado soft.

```
GET    /atenciones/cita/:citaId/hojas             lista (metadata + trazos)
POST   /atenciones/cita/:citaId/hojas             crea hoja
PUT    /atenciones/cita/:citaId/hojas/:id         actualiza trazos
DELETE /atenciones/cita/:citaId/hojas/:id         soft delete (deletedAt)
POST   /atenciones/cita/:citaId/hojas/:id/transcribir   OCR de esa hoja
```

- **Requieren atencion guardada**, igual que adjuntos y recetas ("Registre la
  atencion antes de escribir a mano").
- **Lectura** abierta al staff del consultorio (mismo criterio que `findByCita`);
  **escritura** con el guard duro.
- DTOs con decoradores `class-validator` (sin ellos el `ValidationPipe` global da
  400): `@IsInt()` en `orden`, `@IsObject()` en `trazos`, y validacion explicita
  del shape y los topes en el service.
- Rutas literales antes que parametrizadas donde aplique (gotcha conocido de Nest).
- El `orden` lo asigna el service (max + 1), no el cliente, para evitar choques con
  el `@@unique`.

### Transcripcion

`POST .../hojas/:id/transcribir` recibe el PNG que el cliente rasterizo (multipart,
mismo patron que `subirAdjunto`, con tope de tamano en el interceptor).

- El backend llama al modelo de vision con la imagen y un prompt de transcripcion
  de manuscrito clinico en espanol.
  > **Cambio posterior (2026-08-11).** Se implemento con `claude-opus-5`, pero el
  > owner ya tenia facturacion en OpenAI, asi que el proveedor paso a
  > `gpt-5.6-luna` (SDK `openai`, Responses API) por costo: $0,20 / $1,20 por
  > MTok contra $5 / $25, o sea ~20x mas barato por hoja. La tabla de costos de
  > mas abajo quedo historica. La decision de mantener la llamada detras de una
  > interfaz chica es justo lo que hizo que el cambio tocara un solo archivo.
- Guarda `transcripcion` + `transcritoAt` en la hoja y escribe en `log`.
- Devuelve el texto al frontend.
- **La imagen no se persiste en ningun lado.** Es un intermedio de la request.
- La llamada vive detras de una interfaz chica (`TranscripcionService` con un solo
  metodo) para poder cambiar de proveedor sin tocar el controller.
- `OPENAI_API_KEY` en `apps/api/.env` (gitignoreado) y en las variables de
  Railway. **Nunca en el frontend ni en un commit.**
- Si falta la key, el endpoint responde un error claro y el boton de transcribir
  se muestra deshabilitado con el motivo (no se rompe el resto del modulo).

---

## 4. El lienzo (frontend)

Dos piezas, para no duplicar el dibujado:

- `apps/web/src/components/manuscrito/HojaRenderer.tsx` — **solo lectura**. Recibe
  `trazos` y los pinta. Lo usan la miniatura del modal, el visor de la historia
  clinica y el propio editor para la capa de trazos ya cerrados.
- `apps/web/src/features/agenda/LienzoManuscrito.tsx` — el **editor** a pantalla
  completa, por encima del `AtencionModal`. Suma la captura, la capa del trazo en
  curso y la barra de herramientas.

Dependencia nueva: `perfect-freehand` en `apps/web` (`pnpm add` desde el workspace;
el owner corre `pnpm install`).

### Captura

- **Pointer Events**: `pointerdown` / `pointermove` / `pointerup` / `pointercancel`.
- `e.pressure` modula el grosor.
- `getCoalescedEvents()` recupera los puntos que el navegador agrupa entre frames
  (el Pencil muestrea por encima de 120 Hz). **Safari lo soporta recien desde la
  18.2** (iPadOS 18.2), asi que va con deteccion de capacidad:
  `typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]`.
  En un iPad viejo el trazo pierde algo de finura en movimientos rapidos, pero
  funciona.
- `touch-action: none` y `overscroll-behavior: none` en el lienzo: sin scroll ni
  zoom accidental del navegador mientras se escribe.
- **Rechazo de palma**: apenas se ve un `pointerType === 'pen'` en la sesion, los
  punteros `touch` dejan de dibujar y pasan a mover/acercar la hoja. En celular sin
  lapiz, el dedo dibuja.
- `setPointerCapture` en el `pointerdown` para no perder el trazo al salir del canvas.

### Scribble se pelea con el lienzo (gotcha grande, iPad)

**iPadOS Scribble corre a nivel de sistema y vigila el Apple Pencil globalmente.**
Cuando detecta un patron que parece escritura, **intercepta el trazo antes de que
llegue al canvas**. El caso reportado es un trazo vertical-horizontal-vertical (una
"H", un "4"): el tercer segmento se pierde. Escribir texto cursivo sobre un canvas
es exactamente el patron que Scribble intenta capturar, o sea que este es el peor
caso posible, no un borde raro.

No hay opt-out desde la web. Los apps nativos pueden rechazar Scribble por vista
(`UIScribbleInteraction`); una PWA no tiene equivalente. `touch-action: none` no
alcanza porque la intercepcion pasa por encima del navegador.

**Consecuencia y decision:** para escribir la nota en el lienzo hay que apagar
Scribble en el iPad (Ajustes → Apple Pencil → Scribble → Off). Eso resigna la
conversion gratis de lapiz a texto dentro de los campos de texto — que es
justamente lo que nuestro OCR reemplaza. El intercambio cierra:

| | Scribble ON | Scribble OFF (recomendado) |
|---|---|---|
| Lienzo manuscrito | trazos perdidos al escribir letras | confiable |
| Lapiz en campos de texto | convierte a texto gratis, local | no convierte |
| Manuscrito a texto | — | via el boton "Transcribir" |

Dado que la decision es que **el manuscrito ES la nota**, Scribble OFF es lo
correcto. A implementar:

- Una nota en el `/ayuda` del proyecto con el paso a paso para apagarlo.
- Un aviso una sola vez la primera vez que se abre el lienzo en un iPad, con la
  ruta de Ajustes. Descartable y recordado en `localStorage`.
- **Verificar en hardware real si el problema sigue vigente** en la version de
  iPadOS del doctor antes de dar el aviso por necesario: el reporte es de un
  tercero, no de la documentacion de Apple, y Apple pudo haberlo ajustado.

### Render

- **`perfect-freehand` v1.2.3 (MIT)** convierte los puntos con presion en el
  contorno del trazo. Se pinta con Canvas 2D.
- **Dos canvas superpuestos**: uno con los trazos ya cerrados (se redibuja solo
  cuando cambian) y otro con el trazo en curso. Mantiene la escritura fluida aunque
  la hoja acumule cientos de trazos.
- `devicePixelRatio` para que el trazo no se vea pixelado en pantallas retina.

### Herramientas (v1, nada mas)

- Lapiz con 3 grosores.
- Borrador **por trazo** (coherente con vectorial), no por pixel.
- Deshacer / rehacer.
- 3 colores: negro, azul, rojo.
- Zoom y desplazamiento con dos dedos.

### Hojas

Barra inferior con "Hoja 1 / 3", flechas y "+ Hoja". Proporcion A4 vertical
(1240 x 1754 logicos). Eliminar hoja pide confirmacion con `ConfirmarModal`
(prohibido `window.confirm`).

### Guardado

- Automatico cada ~10 s con cambios pendientes, y al salir de la pantalla.
- Ademas, copia en **IndexedDB** cada pocos trazos. Es una nota clinica que se
  escribe en vivo frente al paciente: perderla por un corte de red no es aceptable.
  Al reabrir, si hay borrador local mas nuevo que el servidor, se ofrece recuperarlo.
- Indicador de estado discreto ("Guardado" / "Guardando...") en la barra superior.

### UI / accesibilidad (regla dura del proyecto)

Pasar por los skills **impeccable + ui-ux-pro-max + frontend-design antes de
escribir el JSX**. Tokens de `lib/ui.ts`, dark mode, touch targets >= 44 px,
`focus-visible` ring, color + forma (no solo color) en los selectores de color,
transiciones 150-300 ms. Sin overflow horizontal en ninguna vista.

---

## 5. Integracion en la UI existente

### `AtencionModal`

- Junto al campo "Evolucion / notas", boton **"Escribir a mano"**.
  - Visible solo en dispositivos tactiles: `(pointer: coarse)` o
    `navigator.maxTouchPoints > 0`. Escribir es solo tablet y celular.
  - Deshabilitado con leyenda si la atencion todavia no se guardo (mismo criterio
    que adjuntos y recetas).
- Debajo del campo, lista de hojas con miniatura y fecha, **en cualquier
  dispositivo** (la miniatura se dibuja desde los trazos, no hay imagen que cargar).
- Boton **"Transcribir a texto"** cuando hay al menos una hoja.

### Flujo de transcripcion en la UI

1. El cliente redibuja cada hoja a PNG de **2576 px de lado largo** (maximo que
   aprovecha la vision de Claude) y la manda al endpoint, hoja por hoja.
2. Las transcripciones se unen en orden de hoja, separadas por linea en blanco.
3. Si "Evolucion" esta vacio, se llena. Si ya tenia texto, se pregunta con un modal
   del design system: **reemplazar** o **agregar abajo**.
4. Aviso inline mientras el texto esta sin revisar: *"Texto generado desde tu
   escritura. Revisalo antes de guardar."* Sin estado persistido: el aviso vive en
   el componente hasta que el doctor guarda.

### Historia clinica

`HistoriaClinicaTimeline` y `PacienteDetallePage` muestran las hojas en **solo
lectura desde cualquier dispositivo, incluida la PC**: miniatura en la linea de
tiempo y visor a pantalla completa al tocarla.

### Cache de TanStack Query

Clave jerarquica `['hojas', citaId]` (nunca plana). Se invalida al crear,
actualizar, borrar y transcribir. `AtencionModal` ya invalida `['atencion', citaId]`
y las claves de citas/deudores; las hojas suman su propia clave sin pisar nada.

---

## 6. Costos

Por hoja transcrita, a precios de lista:

| Modelo | Entrada (~4784 tokens de imagen) | Salida (~800 tokens) | Total aprox. |
|---|---|---|---|
| `claude-opus-5` ($5 / $25 por MTok) | $0,024 | $0,020 | **~$0,044** |
| `claude-sonnet-5` ($3 / $15 por MTok) | $0,014 | $0,012 | **~$0,026** |

Se elige Opus 5: la cursiva es lo mas dificil para cualquier reconocedor y el
volumen es de unas pocas sesiones por dia. El modelo queda configurable por env
(`TRANSCRIPCION_MODEL`) para poder bajar a Sonnet 5 sin deploy de codigo.

---

## 7. Verificacion

- `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit` antes de
  cada commit.
- Gate nuevo `scripts/gate-manuscrito.ps1` (crea su propio tenant, como el resto):
  - Crear hoja exige atencion guardada (400 si no existe).
  - `consultorioId` sale del JWT: una hoja de otro tenant da 404, no se lee ni se pisa.
  - Guard de escritura: un doctor ajeno a la cita recibe 403; el doctor de la cita
    y el ADMIN escriben.
  - `orden` se asigna solo y respeta el `@@unique` con varias hojas.
  - Topes: JSON > 2 MB y hoja 21 son rechazados con 400.
  - DELETE marca `deletedAt` y la hoja deja de listarse, pero la fila sigue.
  - Cada create/update/delete deja fila en `logs`.
  - Transcribir sin `OPENAI_API_KEY` da error claro y no rompe el resto.
- Spec E2E de Playwright para el lienzo, cubriendo el camino que si se puede
  automatizar con puntero generico: abrir, trazar, deshacer, agregar hoja, guardar,
  cerrar y reabrir con los trazos intactos.
  - **La presion y el `pointerType: 'pen'` no se simulan con la API estandar de
    Playwright.** Si hace falta cubrirlos, hay que bajar a CDP; verificar la API
    exacta al escribir el test en vez de asumirla. Si resulta caro, dejarlos fuera
    del E2E y cubrirlos en la prueba manual de abajo, que igual es obligatoria.
- Prueba manual obligatoria en hardware real (iPad con Apple Pencil y un Android con
  lapiz). Un emulador no valida nada de esto:
  - Rechazo de palma apoyando la mano mientras se escribe.
  - Presion: el trazo tiene que engrosar al apretar.
  - **Escribir un parrafo largo de cursiva con Scribble ENCENDIDO y contar si se
    pierden trazos.** Es el gotcha de §4 y define si el aviso de apagar Scribble es
    necesario o si Apple ya lo corrigio.
  - Repetir con Scribble apagado y confirmar que no se pierde ninguno.
  - Version de iPadOS del dispositivo del doctor, para saber si `getCoalescedEvents`
    esta disponible (18.2+) o si cae al fallback.

---

## 8. Fuera de alcance de v1

- Exportar hojas a PDF (las recetas ya tienen generador; se suma despues sin tocar
  el modelo de datos).
- Escribir encima de un adjunto existente (marcar sobre un test escaneado).
- Plantillas de hoja rayada o cuadriculada; v1 va lisa.
- Reconocimiento de figuras, regla, o formas geometricas.
- Busqueda por trazo dentro del manuscrito.
- Escribir desde PC con mouse (leer si, escribir no: decision del owner).

## Pendiente independiente de este spec

**Verificar si el servicio de la API en Railway tiene un volumen montado en
`UPLOADS_DIR`.** No hay ninguno declarado en el repo y no se pudo comprobar desde la
sesion (el MCP de Railway pide login). Si no lo hay, los adjuntos clinicos ya
subidos se pierden en cada deploy. Este spec no depende del disco, pero el hallazgo
merece atencion aparte.
