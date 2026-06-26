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
