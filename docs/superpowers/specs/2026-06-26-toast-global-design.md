# Diseño: sistema de toast/snackbar global

Fecha: 2026-06-26
Estado: aprobado (pendiente plan de implementación)

## Problema

Hoy los errores de acción del backend (ej. "La caja de hoy ya esta cerrada: no se
pueden registrar movimientos" al cobrar) se muestran como texto rojo inline al pie
del modal/página. El usuario tiene que bajar para verlos y pasan desapercibidos. Se
quiere mostrarlos como un **toast** top-center que aparece, se auto-cierra y se puede
descartar.

Especificación visual del owner: toast top-center, estilo warning, botón X a la
derecha, auto-dismiss a los 5 segundos, esquinas redondeadas (8px), descartable con la X.

## Estado actual (verificado)

- No hay librería de toast instalada. Los errores se manejan inline con `useState` +
  texto `text-destructive` en cada modal/página.
- `main.tsx`: `QueryClientProvider > BrowserRouter > App + OfflineBanner +
  PwaUpdatePrompt`. Es el punto único para montar un contenedor global.
- Patrón de error en mutaciones: `const msg = err.response?.data?.message` →
  `setState`/render inline (ej. `AgendaPage.accionError` línea 99/538;
  `CobroModal` líneas 133/148/172; `DevolverItemModal`; `CancelarCitaModal`, etc.).
- Hay store Zustand (`stores/auth.store.ts`) como patrón a espejar.
- Modales usan `z-50`; las animaciones existentes son clases CSS `modal-fade`/`modal-pop`.
- `ValidationPipe` del backend puede devolver `message` como string o string[]
  (validación class-validator).

## Enfoque elegido

Store Zustand (`toast.store.ts`) + componente `Toaster` (montado una vez en `main.tsx`)
+ helper `toast` llamable desde cualquier módulo. Sin librería nueva.

Descartado:
- React Context + `useToast` hook → el hook solo se llama desde componentes; no sirve
  para llamar desde módulos no-React (ej. interceptores). Zustand se llama desde
  cualquier lado.
- Librería (sonner / react-hot-toast) → dependencia innecesaria para un spec simple;
  un toast propio respeta los tokens del design system exactamente.

## Decisiones tomadas (con el owner)

- **Alcance**: infra + migrar a toast los errores de **acción**: cobro/pago ("caja
  cerrada"), acciones de la agenda (cambiar estado, cancelar, no-asistió, reprogramar)
  y la devolución de producto. Las **validaciones de campo** de formularios quedan
  inline (migración posterior, fuera de alcance).
- **Variantes**: tres — `error` (rojo), `warning` (ámbar), `success` (verde).
- **Mapeo de errores de mutación** (`toast.fromError`): si el backend mandó
  `response.data.message` (regla de negocio, ej. "caja cerrada") → **warning** (ámbar);
  si no hay mensaje (fallo inesperado/red) → **error** (rojo) con un fallback.
- Posición top-center; auto-dismiss 5s; descartable con X; esquinas 8px; apila varios.

## Diseño

### `apps/web/src/stores/toast.store.ts`

```ts
import { create } from 'zustand'

export type ToastTipo = 'error' | 'warning' | 'success'
export interface Toast { id: number; tipo: ToastTipo; mensaje: string }

interface ToastState {
  toasts: Toast[]
  dismiss: (id: number) => void
  _push: (tipo: ToastTipo, mensaje: string) => void
}

let nextId = 1
const DURACION_MS = 5000

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  _push: (tipo, mensaje) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, tipo, mensaje }] }))
    setTimeout(() => get().dismiss(id), DURACION_MS)
  },
}))

// Helper llamable desde cualquier modulo (NO es un hook).
function mensajeDeError(err: unknown): string | null {
  const raw = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message
  if (Array.isArray(raw)) return raw.join(', ')
  return raw ?? null
}

export const toast = {
  error: (mensaje: string) => useToastStore.getState()._push('error', mensaje),
  warning: (mensaje: string) => useToastStore.getState()._push('warning', mensaje),
  success: (mensaje: string) => useToastStore.getState()._push('success', mensaje),
  // Regla de negocio del backend -> warning; fallo inesperado -> error.
  fromError: (err: unknown, fallback: string) => {
    const msg = mensajeDeError(err)
    if (msg) useToastStore.getState()._push('warning', msg)
    else useToastStore.getState()._push('error', fallback)
  },
}
```

### `apps/web/src/components/shared/Toaster.tsx`

- Se suscribe a `useToastStore` (`toasts` + `dismiss`).
- Contenedor `fixed` top-center, `z-[60]` (por encima de los modales `z-50`),
  apila los toasts verticalmente con gap, `pointer-events-none` en el contenedor y
  `pointer-events-auto` en cada toast (para no bloquear la UI debajo).
- `aria-live="polite"` en el contenedor (los `error` usan `role="alert"`).
- Cada toast: `rounded-lg` (8px), fondo/acento por tipo (icono + color + forma, no
  solo color): `error` rojo (AlertCircle), `warning` ámbar (AlertTriangle), `success`
  verde (CheckCircle2). Mensaje + botón **X** (≥44px de área, focus-visible) que llama
  `dismiss(id)`. Animación de entrada slide-down + fade (respeta
  `prefers-reduced-motion`). Transición 150-300ms.
- Tokens del design system; copy del usuario en español con acentos.

### Montaje

En `main.tsx`, agregar `<Toaster/>` junto a `<OfflineBanner/>` dentro del
`QueryClientProvider` (una sola instancia global).

### Migración (errores de acción)

Reemplazar el manejo inline por `toast.fromError(err, fallback)` en `onError`:

- `features/agenda/AgendaPage.tsx`: `cambiarEstado` → `toast.fromError(...)`; eliminar
  el estado `accionError` y su bloque de render inline (líneas ~99, ~276, ~538). Esto
  cubre los cambios de estado disparados desde la card, incluido "No asistió" (no hay
  modal dedicado: la acción va por `cambiarEstado`).
- `features/agenda/CobroModal.tsx`: `registrarPago` (caja cerrada), `ajustarTotal`,
  `anularPago` → toast. (El `errorAjuste` inline del ajuste de total se reemplaza por
  toast; mantener cualquier validación de campo puramente local si la hay.)
- `features/inventario/DevolverItemModal.tsx`: `onError` → `toast.fromError`; eliminar
  el `<p>` de error inline.
- `features/agenda/CancelarCitaModal.tsx` y `features/agenda/ReprogramarCitaModal.tsx`
  (cada uno con su propia mutación): errores de operación → toast (mantener la
  validación de campo inline si la tienen, p.ej. motivo/fecha requeridos).

Quedan **inline** (fuera de alcance): validaciones de campo en `NuevaCitaModal`,
`RecetaModal`, y los campos de `AtencionModal`.

### UI / a11y (obligatorio antes del JSX)

Pasar por los skills `impeccable` + `ui-ux-pro-max` + `frontend-design`. Checklist:
touch target de la X ≥44px, focus-visible ring, color + forma por tipo, contraste AA,
transición 150-300ms, `prefers-reduced-motion`, `aria-live`/`role` correctos, no tapar
acciones debajo (pointer-events).

## Testing

- `cd apps/web && npx tsc --noEmit` limpio.
- Verificación manual del owner: con la caja cerrada, intentar cobrar → aparece un
  toast warning top-center "La caja de hoy ya esta cerrada…", se auto-cierra a los 5s
  y se puede cerrar con la X. Disparar una acción fallida en agenda → toast.
- (El front no tiene runner de unit tests; la lógica del store es mínima. Si se quiere
  regresión automatizada, un spec de Playwright lo cubre — lo corre el owner.)

## Fuera de alcance

- Migrar las validaciones de campo de formularios a toast.
- onError global de TanStack Query (auto-toast de toda mutación).
- Toasts de éxito en flujos existentes (la variante `success` queda disponible, pero
  no se cablean confirmaciones nuevas en este trabajo).
- Pausar el auto-dismiss al pasar el mouse / cola con límite máximo (YAGNI).
