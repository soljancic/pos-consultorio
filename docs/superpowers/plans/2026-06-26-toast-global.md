# Toast/snackbar global — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar los errores de acción del backend como un toast top-center (warning ámbar, auto-dismiss 5s, X, esquinas 8px) en vez del texto rojo inline al pie.

**Architecture:** Store Zustand (`toast.store.ts`) con un helper `toast` llamable desde cualquier módulo + un componente `Toaster` montado una vez en `main.tsx`. Las mutaciones de acción redirigen su `onError` a `toast.fromError(err, fallback)`, que muestra warning si el backend mandó `message` y error si fue un fallo inesperado.

**Tech Stack:** React 19 + TypeScript + Vite + Zustand + Tailwind + TanStack Query v5 (apps/web). Sin librería de toast nueva. lucide-react para iconos.

## Global Constraints

- Sin librería de toast: implementación propia con Zustand (espeja `stores/auth.store.ts`).
- Variantes: `error` (rojo), `warning` (ámbar), `success` (verde). Icono + color + forma (no solo color).
- `toast.fromError(err, fallback)`: si `err.response.data.message` existe (string o string[]) → **warning**; si no → **error** con `fallback`.
- Posición top-center, `z-[60]` (por encima de modales `z-50`), auto-dismiss **5000ms**, descartable con **X** (área ≥44px), esquinas **8px** (`rounded-lg`), apila varios.
- a11y: `aria-live="polite"` en el contenedor, `role="alert"` en error/warning y `role="status"` en success; `prefers-reduced-motion`; focus-visible en la X; contenedor `pointer-events-none`, toast `pointer-events-auto`.
- Alcance: migrar SOLO errores de acción (mutaciones); las validaciones de campo de formularios quedan inline.
- UI: copy visible en español CON acentos; nada de `window.confirm/alert`. Pasar por los skills `impeccable` + `ui-ux-pro-max` + `frontend-design` ANTES del JSX del `Toaster`.
- Verificación: `cd apps/web && npx tsc --noEmit` limpio. No deployar. Trabajar en master.

**Nota:** el front no tiene runner de unit tests (solo Playwright E2E + tsc). La verificación de cada task es `tsc` limpio + revisión visual del owner.

---

### Task 1: Infra del toast (store + Toaster + montaje)

**Files:**
- Create: `apps/web/src/stores/toast.store.ts`
- Create: `apps/web/src/components/shared/Toaster.tsx`
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `toast.store.ts` exporta: `type ToastTipo = 'error'|'warning'|'success'`, `interface Toast`, `useToastStore` (Zustand), y el helper `toast` con `error(msg)`, `warning(msg)`, `success(msg)`, `fromError(err, fallback)`. Lo consume Task 2.
  - `Toaster` (componente sin props).

- [ ] **Step 1: Crear el store `toast.store.ts`**

Crear `apps/web/src/stores/toast.store.ts`:

```ts
import { create } from 'zustand'

export type ToastTipo = 'error' | 'warning' | 'success'
export interface Toast {
  id: number
  tipo: ToastTipo
  mensaje: string
}

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

function mensajeDeError(err: unknown): string | null {
  const raw = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message
  if (Array.isArray(raw)) return raw.join(', ')
  return raw ?? null
}

// Helper llamable desde cualquier modulo (NO es un hook).
export const toast = {
  error: (mensaje: string) => useToastStore.getState()._push('error', mensaje),
  warning: (mensaje: string) => useToastStore.getState()._push('warning', mensaje),
  success: (mensaje: string) => useToastStore.getState()._push('success', mensaje),
  // Regla de negocio del backend -> warning; fallo inesperado/red -> error.
  fromError: (err: unknown, fallback: string) => {
    const msg = mensajeDeError(err)
    if (msg) useToastStore.getState()._push('warning', msg)
    else useToastStore.getState()._push('error', fallback)
  },
}
```

- [ ] **Step 2: Verificar tipos del store**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Pasar por los skills de UI (obligatorio antes del JSX del Toaster)**

Invocar `impeccable` + `ui-ux-pro-max` + `frontend-design` para un stack de toasts top-center con acción destructiva-mínima (X), tres variantes (error/warning/success), entrada animada y a11y. Aplicar su guía al JSX del paso siguiente sin regresar la base.

- [ ] **Step 4: Crear el componente `Toaster.tsx`**

Crear `apps/web/src/components/shared/Toaster.tsx`. Reusa las clases de animación `modal-fade modal-pop` que ya existen en el CSS (las usan `ProductoModal`/`DevolverItemModal`):

```tsx
import { AlertCircle, AlertTriangle, CheckCircle2, X, type LucideIcon } from 'lucide-react'
import { useToastStore, type ToastTipo } from '../../stores/toast.store'
import { cn } from '../../lib/utils'

const ESTILO: Record<ToastTipo, { icon: LucideIcon; clase: string; rol: 'alert' | 'status' }> = {
  error: {
    icon: AlertCircle,
    clase: 'border-destructive/30 bg-destructive/10 text-destructive',
    rol: 'alert',
  },
  warning: {
    icon: AlertTriangle,
    clase: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    rol: 'alert',
  },
  success: {
    icon: CheckCircle2,
    clase: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    rol: 'status',
  },
}

// Stack de toasts top-center. Montado una sola vez en main.tsx. El contenedor no
// captura clicks (pointer-events-none); cada toast si (pointer-events-auto).
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) => {
        const { icon: Icon, clase, rol } = ESTILO[t.tipo]
        return (
          <div
            key={t.id}
            role={rol}
            className={cn(
              'modal-fade modal-pop pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-lg backdrop-blur-sm',
              clase,
            )}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="flex-1 text-sm font-medium leading-snug text-foreground">{t.mensaje}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Cerrar aviso"
              className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 cursor-pointer transition-colors duration-150"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Montar `<Toaster/>` en `main.tsx`**

En `apps/web/src/main.tsx`, importar el componente y agregarlo junto a `<OfflineBanner/>`:

- Agregar el import (junto a los otros de `components/shared`):
```tsx
import { Toaster } from './components/shared/Toaster'
```
- Cambiar el bloque `appContent` para incluir `<Toaster/>`:
```tsx
const appContent = (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
      <OfflineBanner />
      <PwaUpdatePrompt />
      <Toaster />
    </BrowserRouter>
  </QueryClientProvider>
)
```

- [ ] **Step 6: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/stores/toast.store.ts apps/web/src/components/shared/Toaster.tsx apps/web/src/main.tsx
git commit -m "feat(toast): store + Toaster global montado en main"
```

(Recordar el trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` en el commit. No push.)

---

### Task 2: Migrar los errores de acción a toast

**Files:**
- Modify: `apps/web/src/features/agenda/AgendaPage.tsx`
- Modify: `apps/web/src/features/agenda/CobroModal.tsx`
- Modify: `apps/web/src/features/caja/AnularPagoModal.tsx`
- Modify: `apps/web/src/features/inventario/DevolverItemModal.tsx`
- Modify: `apps/web/src/features/agenda/CancelarCitaModal.tsx`
- Modify: `apps/web/src/features/agenda/ReprogramarCitaModal.tsx`

**Interfaces:**
- Consumes: `toast` de `../../stores/toast.store` (Task 1).
- Produces: nada nuevo.

Regla general: cada archivo importa `import { toast } from '../../stores/toast.store'` (todos están dos niveles bajo `src`, así que la ruta es `../../stores/toast.store`). Tras editar, correr `tsc`; si marca variables/imports sin usar (p.ej. `errorUI`, `AlertCircle`), eliminarlos.

- [ ] **Step 1: AgendaPage — `cambiarEstado` (quita `accionError`, error-only de esa mutación)**

En `apps/web/src/features/agenda/AgendaPage.tsx`:

1. Agregar el import de `toast`.
2. Eliminar el estado: `const [accionError, setAccionError] = useState<string | null>(null)`.
3. En `cambiarEstado.onSuccess`, quitar la línea `setAccionError(null)`.
4. Reemplazar el `onError`:
```tsx
    onError: (err: any) => {
      setAccionError(
        err?.response?.data?.message || 'No se pudo actualizar la cita. Revisá la conexión y reintentá.',
      )
    },
```
por:
```tsx
    onError: (err: any) => {
      toast.fromError(err, 'No se pudo actualizar la cita. Revisá la conexión y reintentá.')
    },
```
5. Eliminar el bloque de render del aviso inline (es el único uso restante de `accionError`):
```tsx
      {/* Aviso de accion fallida (cambio de estado) */}
      {accionError && (
        <div className="px-4 sm:px-6 pt-3">
          <div className={cn(errorUI, 'justify-between')} role="alert">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {accionError}
            </span>
            <button
              type="button"
              onClick={() => setAccionError(null)}
              aria-label="Cerrar aviso"
              className="shrink-0 rounded p-0.5 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-colors duration-150"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
```
6. Correr `cd apps/web && npx tsc --noEmit`; si `errorUI`, `AlertTriangle` o `X` quedan sin uso en este archivo, quitarlos del import. (No tocar otros usos si existen.)

- [ ] **Step 2: CobroModal — `registrarPago` y `ajustarTotal` (mantener los states, solo cambia el onError)**

En `apps/web/src/features/agenda/CobroModal.tsx` (los states `errorPago`/`errorAjuste` SIGUEN: se usan para validaciones de campo del lado cliente; solo cambia el cuerpo del `onError` de cada mutación):

1. Agregar el import de `toast`.
2. Reemplazar el `onError` de `registrarPago`:
```tsx
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setErrorPago(Array.isArray(msg) ? msg.join(', ') : msg ?? 'No se pudo registrar el pago')
    },
```
por:
```tsx
    onError: (err: any) => {
      toast.fromError(err, 'No se pudo registrar el pago')
    },
```
3. Reemplazar el `onError` de `ajustarTotal`:
```tsx
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setErrorAjuste(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al ajustar el precio')
    },
```
por:
```tsx
    onError: (err: any) => {
      toast.fromError(err, 'Error al ajustar el precio')
    },
```
4. NO tocar `setLineasMut` (errorLineas) ni las validaciones de campo (`setErrorPago('Guardá los productos...')`, `setErrorAjuste('Ingrese un precio valido')`, etc.): quedan inline.
5. `cd apps/web && npx tsc --noEmit` limpio.

- [ ] **Step 3: AnularPagoModal — `anular` (quita `error`, error-only de esa mutación)**

En `apps/web/src/features/caja/AnularPagoModal.tsx`:

1. Agregar el import de `toast`.
2. Eliminar el estado `const [error, setError] = useState('')`.
3. Reemplazar el `onError`:
```tsx
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al anular el pago')
    },
```
por:
```tsx
    onError: (err: any) => {
      toast.fromError(err, 'Error al anular el pago')
    },
```
4. En el botón "Anular pago", cambiar `onClick={() => { setError(''); anular.mutate() }}` por `onClick={() => anular.mutate()}`.
5. Eliminar el bloque de render inline:
```tsx
          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
```
6. NO tocar el panel de `advertencia` (éxito con nota "Pago anulado. …"): queda como está.
7. `tsc`; si `errorUI` o `AlertCircle` quedan sin uso, quitarlos del import (ojo: `AlertCircle` también se usa en el panel de advertencia línea 58 — ahí SÍ sigue usándose, así que probablemente NO se quita).

- [ ] **Step 4: DevolverItemModal — agregar `onError` y quitar el error inline**

En `apps/web/src/features/inventario/DevolverItemModal.tsx`:

1. Agregar el import de `toast`.
2. Agregar `onError` a la mutación (después de `onSuccess`):
```tsx
    onError: (err) =>
      toast.fromError(err, 'No se pudo deshacer la venta. Revisá que la caja esté abierta e intentá de nuevo.'),
```
3. Eliminar el bloque de error inline:
```tsx
          {/* Error del backend */}
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {(
                mutation.error as {
                  response?: { data?: { message?: string } }
                }
              )?.response?.data?.message ??
                'No se pudo deshacer la venta. Revisá que la caja esté abierta e intentá de nuevo.'}
            </p>
          )}
```
4. `cd apps/web && npx tsc --noEmit` limpio.

- [ ] **Step 5: CancelarCitaModal — `cancelar` (quita `error`, error-only de esa mutación)**

En `apps/web/src/features/agenda/CancelarCitaModal.tsx`:

1. Agregar el import de `toast`.
2. Eliminar el estado `const [error, setError] = useState('')`.
3. Reemplazar el `onError`:
```tsx
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar')
    },
```
por:
```tsx
    onError: (err: any) => {
      toast.fromError(err, 'Error al guardar')
    },
```
4. Eliminar el bloque de render inline:
```tsx
          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
```
5. En los 3 botones que hacen `{ setError(''); cancelar.mutate(X) }`, quitar el `setError('');` (quedan `cancelar.mutate(false)` / `cancelar.mutate(true)`).
6. `tsc`; quitar del import lo que quede sin uso: `errorUI` y `AlertCircle` (verificar que `AlertCircle` no se use en otro lado del archivo; `AlertTriangle`/`UserX` siguen usándose como icono del header).

- [ ] **Step 6: ReprogramarCitaModal — `reprogramar` (mantener `error`: lo usa el copiar-link)**

En `apps/web/src/features/agenda/ReprogramarCitaModal.tsx` (el estado `error` SIGUE: lo usa el catch de copiar-link; solo cambia el `onError` de la mutación):

1. Agregar el import de `toast`.
2. Reemplazar el `onError` de `reprogramar`:
```tsx
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al reprogramar')
    },
```
por:
```tsx
    onError: (err: any) => {
      toast.fromError(err, 'Error al reprogramar')
    },
```
3. NO tocar el `setError('No se pudo copiar el link')` del catch de `copiarLink`, ni el `setError('')` de `handleSubmit`, ni el render inline `{error && ...}`: quedan para el caso de copiar-link.
4. `cd apps/web && npx tsc --noEmit` limpio.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/agenda/AgendaPage.tsx apps/web/src/features/agenda/CobroModal.tsx apps/web/src/features/caja/AnularPagoModal.tsx apps/web/src/features/inventario/DevolverItemModal.tsx apps/web/src/features/agenda/CancelarCitaModal.tsx apps/web/src/features/agenda/ReprogramarCitaModal.tsx
git commit -m "feat(toast): migrar errores de accion (cobro/caja/agenda/devolucion) a toast"
```

(Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. No push.)

---

## Verificación final (owner)

- `cd apps/web && npx tsc --noEmit` limpio.
- Manual: con la caja cerrada, intentar cobrar → toast warning top-center "La caja de hoy ya esta cerrada…", se auto-cierra a los 5s y se cierra con la X. Disparar un cambio de estado fallido en agenda y una anulación inválida → toast. La devolución con caja cerrada → toast.
- Queda listo para deploy (sin deployar; avisar al owner).

## Fuera de alcance (recordatorio)

- Validaciones de campo de formularios (NuevaCita, Receta, campos de Atención) y `errorLineas` de CobroModal: siguen inline.
- onError global de TanStack Query; toasts de éxito en flujos existentes; pausa-on-hover.
