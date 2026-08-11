# Lienzo manuscrito — barra compacta (2 bandas en vez de 3)

Archivo tocado: `apps/web/src/features/agenda/LienzoManuscrito.tsx` (solo
presentacion: header, barra de hojas y footer). Nada de logica, estado,
refs, mutex ni el efecto del `ResizeObserver` se tocó.

## Que aportó cada skill

- **impeccable** (`context.mjs --target LienzoManuscrito.tsx`): cargó
  `PRODUCT.md` del proyecto y confirmó el registro `product` (no marketing).
  De ahí saqué dos principios que gobernaron las decisiones de contenido:
  "Calma sobre densidad" (jerarquía clara, no un tablero saturado) y
  "Accesible por defecto" (touch targets >=44px, color + forma, no solo
  color). También marcó que no hay `DESIGN.md` — este es un refinamiento de
  la implementación incumbente, no un rediseño desde cero, así que mantuve
  el lenguaje visual existente (tokens `btnIconUI`/`btnOutlineUI`/
  `btnPrimaryUI`, pills redondeadas para el selector de herramienta) en vez
  de inventar uno nuevo.
- **ui-ux-pro-max** (`search.py "toolbar touch target spacing" --domain
  ux`): la regla concreta que cambió el diseño fue **"mínimo 8px de gap
  entre touch targets adyacentes"** con el anti-patrón explícito `gap-0 o
  gap-1`. El código original usaba `gap-1` (4px) dentro de casi todos los
  grupos de botones (pill de herramienta, colores, grosores,
  deshacer/rehacer). Los subí todos a `gap-2` (8px) — esto le costó ~30px
  extra al ancho total de la barra inferior, que ya tenía margen de sobra
  (ver cálculo de ancho abajo), así que no comprometió el ajuste a 738px.
- **frontend-design**: como este es "reshaping an existing toolbar", no
  "new work", la guía fue de restricción: dejar que el canvas domine,
  gastar la "audacia" en un solo lugar y mantener todo lo demás en calma.
  Aporte concreto: usar separadores finos (1px, `bg-border`) en vez de
  fondos de pill para TODOS los grupos de la barra inferior (solo el
  toggle lápiz/borrador conserva su pill, que ya existía) — evita que una
  fila de 10 controles se sienta como cuatro widgets distintos peleando
  por atención. También la idea de escalonar el peso visual del indicador
  de guardado: texto solo en los estados que piden atención
  (guardando/sin guardar), ícono solo en el estado calmo (guardado) — la
  reserva de "gasta la audacia en un lugar" aplicada al revés: la mayoría
  del tiempo el indicador debe ser casi invisible.

## Layout final

### Barra superior (antes: header de 2 líneas + barra de hojas separada)

Una sola fila, `h-14` (56px, mismo alto que el header viejo), de izquierda
a derecha:

1. **Cerrar** (X, icon-only, `aria-label="Cerrar nota manuscrita"`, 44px) — sin cambios de nombre/comportamiento.
2. **"Nota manuscrita"** — `<h1>` visible pero compacto (`text-sm`,
   `truncate`, `flex-1`). Se soltó el ícono-avatar (36px) y el subtítulo
   "Cita #{citaId}" — el dueño ya pidió tratarlos como lo más barato de
   recortar, y el doctor ya sabe qué atención abrió.
3. Según estado:
   - Cargando: texto "Cargando…".
   - Sin hojas: botón primario "Primera hoja" (sin cambios de texto/handler).
   - Con hojas: **grupo Navegar hojas** (anterior 44px / contador "Hoja N / M" tabular-nums, `min-w-[6rem]` sin cambios / siguiente 44px) + **grupo agregar/eliminar** ("+ Hoja" con nombre accesible exacto "Hoja", ahora con padding reducido `px-2.5 sm:px-3` en vez de `px-4` / eliminar 44px, `aria-label="Eliminar hoja actual"`) + **indicador de guardado** reubicado del viejo subtítulo: mismo `aria-live="polite"`, mismos 3 estados (ícono distinto por estado — Loader2/dot/Check, nunca solo color), pero con texto visible SOLO en "guardando"/"sin guardar"; en "guardado" el texto pasa a `sr-only` (el lector de pantalla sigue anunciando todo igual).

Aviso de "Máximo 20 hojas por atención": antes era un texto siempre
visible junto al botón; ahora vive solo en el `title` (tooltip nativo) del
botón deshabilitado + el propio estado `disabled`. Es la única pérdida de
texto visible del rediseño — edge case (tope de 20 hojas), no crítico.

### Barra inferior (antes: 3 filas apiladas)

Una sola fila, `py-2` + botones de 44px (~60px de alto), 4 grupos
separados por líneas finas de 1px:

`[Lápiz | Borrador]` (pill) — separador — `[Negro | Azul | Rojo]` (color,
ring + check mark) — separador — `[Fino | Medio | Grueso]` (grosor, ring +
check mark) — separador — `[Deshacer | Rehacer]`.

Ningún aria-label, aria-pressed ni el formato del contador cambiaron.

## Espacio vertical ganado

Aritmética a partir de las clases Tailwind reales:

- **Antes**: header `h-14` (56px) + borde 1px = 57px; barra de hojas
  `py-2` + botones 44px + borde = 61px (asumiendo una sola línea; el
  dueño reportó que el FOOTER de 3 filas era el que realmente se
  apilaba); footer de 3 filas: `py-2.5` (20px) + 3×44px (132px) + 2×`gap-y-2`
  (16px) + borde = 169px. Total código: **287px**.
- **Después**: barra superior 57px + barra inferior (`py-2` 16px + 44px +
  borde 1px = 61px). Total: **118px**.
- **Ganancia mínima por aritmética de código: ~169px.** Si se parte de la
  cifra que reportó el dueño en el dispositivo real (~450px de chrome,
  probablemente inflada por escalado de fuente de Android que mi cálculo
  estático no captura), la ganancia real ronda **~330px** de alto de
  canvas en el mismo teléfono de 738px.

## Ajuste al viewport más angosto (738px)

Diez controles a 44px mínimo son 440px de solo botones — innegociable, no
se puede bajar de ahí. Con la corrección de touch-spacing (8px, no 4px)
entre CADA par de botones adyacentes:

- Barra inferior: 4 grupos (100+148+148+96 = 492px de botones+gaps
  internos) + 3 separadores (~3px) + gaps entre los 7 hijos del footer
  (6×8px = 48px) + padding horizontal (`px-3` = 24px) ≈ **571px** de
  contenido contra 738px disponibles → **~167px de margen**.
- Barra superior (peor caso: 20 hojas + estado "Guardando…" simultáneo,
  el más ancho posible): cerrar (44) + navegar hojas (~192) + agregar/
  eliminar (~130) + indicador (~94) + gaps (32) + padding (32) ≈ 524px,
  dejando ~214px para el título, que solo necesita ~120px → sobra incluso
  en el peor caso.

**No hizo falta mover ningún control a un popover** — el presupuesto de
ancho a 738px sobra en ambas barras incluso con espaciado de 8px
correcto. Se mantuvo `flex-wrap` en ambos contenedores como red de
seguridad pasiva (nunca dispara scroll horizontal de página; en el peor
caso, si un teléfono más angosto que 738px no entra, la fila se parte en
dos en vez de desbordar) — no se espera que se active en el ancho
objetivo.

## Confirmaciones

- **Lógica intacta**: no se tocó ningún estado, ref, mutex, efecto,
  handler de puntero, ni el `ResizeObserver`. Solo se reordenó/reestilizó
  JSX de header/barra-de-hojas/footer y se movió la barra de hojas
  (misma JSX, mismos handlers) dentro del `<header>`.
- **Elemento medido por el ResizeObserver** (`areaRef`): sin padding
  propio, sin cambios — el padding sigue en el wrapper externo
  (`p-4 sm:p-6`), exactamente el patrón que ya exigía el proyecto.
- **Nombres accesibles que usa el E2E** (`apps/web/e2e/manuscrito.spec.ts`),
  todos intactos:
  - `heading` nivel 1 "Nota manuscrita" — sigue visible.
  - Texto "Hoja {n} / {m}" — mismo formato exacto.
  - Botón `name: 'Deshacer'`, `name: 'Hoja'` (exact, el "+ Hoja"),
    `name: 'Primera hoja'`, `name: 'Cerrar nota manuscrita'`,
    `name: 'Eliminar hoja actual'` — todos preservados literalmente.
  - No hizo falta tocar el spec.

## Verificación

```
cd apps/web && npx tsc --noEmit
```

Exit code 0, sin salida (limpio).

---

# Segunda pasada — la barra inferior se partía en 2 filas en el teléfono real

La barra superior quedó bien (una fila, tal cual se pidió). La inferior, no:
en el Android real de 738px se partía en 2 filas (fila 1: lápiz, borrador,
separador, los 3 colores, separador; fila 2: los 3 grosores, separador,
deshacer, rehacer). Mi estimado de la 1ra pasada (~571px de contenido
contra 738px disponibles, ~167px/23% de margen) no sobrevivió al
dispositivo real y `flex-wrap` actuó tal como estaba diseñado — pero el
resultado fue exactamente las 2 filas que la tarea buscaba eliminar.

Pedido del owner, textual: *"Para celular la parte de abajo quiero q sea en
una sola línea, q el color y el grosor sea como un combobox o selector"*.

## Qué patrón de popover ya existía (se reusó, no se inventó uno nuevo)

Encontré el mismo mecanismo repetido, sin abstraer, en **tres** componentes
del proyecto: `apps/web/src/components/shared/SplitButton.tsx`,
`apps/web/src/components/shared/SelectorPais.tsx` y
`apps/web/src/features/reportes/components/RangoFechasPicker.tsx`. Los
tres hacen exactamente lo mismo:

- `useState` local para abierto/cerrado + `useRef` en el contenedor raíz.
- Un `useEffect` (solo mientras está abierto) que escucha `mousedown` en
  `document` y cierra si el click cayó fuera de `raiz.current`, y
  `keydown` para cerrar con Escape.
- Botón disparador con `aria-haspopup` + `aria-expanded={abierto}`.
- Panel `absolute`, `z-50`, `bg-card border rounded-* shadow-lg`, con
  `ChevronDown` que rota al abrir.

Como el patrón se repite tres veces SIN un hook compartido, seguí la misma
convención (duplicar el efecto de 12 líneas en cada selector nuevo) en vez
de crear una abstracción que no existe en ningún otro lado del código —
consistencia con lo que ya hay, no invención.

## Los dos pickers nuevos

`SelectorColor` y `SelectorGrosor` (definidos arriba de
`LienzoManuscrito`, mismo archivo — son de uso exclusivo de este editor).

- **Disparador**: botón `h-11` (44px alto, ancho automático ~58px),
  `rounded-full`, con el swatch/punto del valor ACTIVO siempre visible
  (círculo de color de 24px para color; punto del tamaño real del grosor
  activo, centrado en una caja fija de 24px para que el botón no cambie de
  ancho al cambiar de grosor) + `ChevronDown` de 14px que rota 180° al
  abrir. `aria-label` dinámico: `"Color: Azul"` / `"Grosor: Medio"` (con
  `title` igual, para el tooltip de escritorio). El doctor sabe qué color y
  qué grosor tiene puestos sin tocar nada — requisito explícito.
- **Panel** (`abierto`): `absolute bottom-full ... mb-2` (se abre HACIA
  ARRIBA desde la barra inferior, nunca hacia abajo — se saldría de la
  pantalla), centrado bajo el botón (`left-1/2 -translate-x-1/2`), con
  `max-w-[calc(100vw-2rem)]` de defensa extra contra desborde horizontal.
  Adentro van las MISMAS 3 opciones de siempre, **sin cambiar una sola
  línea de su JSX**: mismo `aria-label` ("Color {nombre}" / "Grosor
  {nombre}"), mismo `aria-pressed`, mismo anillo + check mark (nunca solo
  el tono/tamaño) — literalmente el código que ya existía suelto en la
  barra, solo movido adentro de un panel condicional.
- Cierra al elegir (el `onClick` de cada opción llama `onElegir` y
  `setAbierto(false)`), al tocar afuera y con Escape — las tres formas
  pedidas.
- Targets: 44px en el panel (las opciones, sin cambios); el botón
  disparador es 44px de alto (ancho mayor, no es un problema — el piso es
  un mínimo, no un máximo).

## Layout final de la barra inferior: 6 controles, 1 fila

`[Lápiz | Borrador]` (pill) — separador — `[● Color ⌄ | ▪ Grosor ⌄]`
(los dos disparadores) — separador — `[Deshacer | Rehacer]`.

## Aritmética de ajuste (verificada, no estimada a ojo)

Clases reales, sumadas control por control, a 738px de viewport
(`sm:` activo porque 738 > 640):

| Bloque | Cálculo | px |
|---|---|---|
| Pill lápiz/borrador | `p-1`(8) + 44 + `gap-2`(8) + 44 | 104 |
| Separador 1 | `w-px` | 1 |
| Selector color (disparador) | `px-2`(16) + swatch 24 + `gap-1`(4) + chevron 14 | 58 |
| Selector grosor (disparador) | igual | 58 |
| Grupo color+grosor | 58 + `gap-2`(8) + 58 | 124 |
| Separador 2 | `w-px` | 1 |
| Deshacer/Rehacer | 44 + `gap-2`(8) + 44 | 96 |
| Suma de los 5 hijos directos del footer | 104+1+124+1+96 | 326 |
| `gap-2` entre esos 5 hijos (4 huecos × 8px) | | 32 |
| Padding horizontal del footer (`sm:px-4`, 16px × 2) | | 32 |
| **Total** | | **390** |

**390px de contenido contra 738px de viewport → 348px de margen (47%).**

Por qué confío en este número después de que el de la 1ra pasada falló:
el estimado anterior (~571px) dejaba solo 167px/23% de margen, y aun así
no alcanzó en el dispositivo real — la explicación más probable es un
factor que mi aritmética "de 16px raíz" no captura: escalado de fuente/
tamaño de Android (accesibilidad → tamaño de letra), que infla TODAS las
medidas en `rem` (incluidas `h-11`, `gap-2`, `px-*`) sin cambiar el ancho
del viewport. Con un 30% de inflación hipotética, 571px pasan a ~742px
(coincide con el desborde observado). Aplicando el mismo 30% a esta
pasada: 390 × 1.3 ≈ 507px, todavía 231px (31%) por debajo de 738. Incluso
al 40% de inflación: 546px, 192px de margen. La diferencia frente a la 1ra
pasada no es un ajuste fino de píxeles, es una reducción real de 10
controles a 6 -- por eso el margen sobrevive a un factor de error que la
vez pasada no sobrevivió.

`flex-wrap` se deja en el footer únicamente como red pasiva; con este
margen no debería activarse en el dispositivo real.

## El aviso de "Máximo 20 hojas" ya no depende de hover

La 1ra pasada lo había dejado solo como `title` (tooltip) + `disabled` —
en touch eso es invisible: el doctor toca "+ Hoja" en el límite y no pasa
nada, sin pista. Ahora hay una etiqueta SIEMPRE visible ("Máx. 20",
`tabular-nums`, mismo tono que el resto de badges secundarios) al lado del
botón cuando `estaEnLimite`, además del `title` (que sigue ahí para el
mouse de escritorio). Es un cambio puramente aditivo de JSX: no toca
`nuevaHoja()` ni ninguna otra función.

## Confirmaciones

- **Lógica intacta**: los dos selectores nuevos son componentes de
  PRESENTACIÓN puros -- reciben `color`/`grosor` y un callback
  (`setColor`/`setGrosor`, los mismos setters de `useState` de siempre) y
  solo administran su propio estado de abierto/cerrado. No tocan
  `sucio`/`sucioRef`, `bloqueoDibujoRef`, `baseServidorRef`, las pilas de
  deshacer/rehacer, los handlers de puntero, el guardado de borrador ni el
  pintado del canvas. El único cambio "de comportamiento" en toda esta
  pasada es aditivo y aislado: el badge "Máx. 20" (JSX condicional, cero
  líneas nuevas en ninguna función existente).
- **Nombres accesibles del E2E**: releí `apps/web/e2e/manuscrito.spec.ts`
  completo otra vez. Ninguno de los 7 tests interactúa con los controles
  de color o grosor (ni por rol ni por texto) -- confirmado por grep sobre
  el archivo completo. Los nombres que sí usa el spec (`Deshacer`, `Hoja`
  exacto, `Primera hoja`, `Cerrar nota manuscrita`, `Eliminar hoja actual`,
  el `heading` "Nota manuscrita", el texto "Hoja N / M") no se tocaron en
  esta pasada tampoco. **No hizo falta modificar el spec.**
- **Área medida por el `ResizeObserver`**: sin cambios de estructura
  (mismo wrapper con padding afuera, mismo `areaRef` sin padding propio);
  al bajar la barra inferior de 2 filas (en el dispositivo real) a 1, el
  canvas gana el alto correspondiente automáticamente vía `flex-1`, sin
  tocar el efecto.

## Verificación (2da pasada)

```
cd apps/web && npx tsc --noEmit
```

Exit code 0, sin salida (limpio) -- incluye el fix de tipos de
`GROSORES_LAPIZ.findIndex()` (se necesitó `findIndex` con predicado en vez
de `.indexOf()`, porque `GROSORES_LAPIZ` es `as const` -- tupla `readonly
[2, 4, 7]` -- y `grosor` es `number` a propósito, igual que el estado
original del componente padre).
