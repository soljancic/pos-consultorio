import { useNavigate } from 'react-router-dom'
import { SearchX, ArrowLeft, Home } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import { btnPrimaryUI, btnOutlineUI } from '../../lib/ui'
import { cn } from '../../lib/utils'

export function NotFoundPage() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.accessToken)

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-8 text-center">
      <div className="modal-fade flex flex-col items-center">
        {/* Watermark 404 con icono encima */}
        <div className="relative mb-8 select-none">
          <span className="text-[9rem] sm:text-[12rem] font-black leading-none text-primary/[0.07] tracking-tight tabular-nums pointer-events-none">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl bg-primary/10 p-5 ring-[6px] ring-primary/5">
              <SearchX className="h-11 w-11 text-primary" strokeWidth={1.5} />
            </div>
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
          Página no encontrada
        </h1>
        <p className="text-muted-foreground max-w-sm mb-8 leading-relaxed">
          La dirección que ingresó no existe o fue removida. Verifique la URL o regrese al inicio.
        </p>

        <div className="flex gap-3 flex-wrap justify-center">
          <button onClick={() => navigate(-1)} className={cn(btnOutlineUI)}>
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <button
            onClick={() => navigate(token ? '/inicio' : '/')}
            className={cn(btnPrimaryUI)}
          >
            <Home className="h-4 w-4" />
            Ir al inicio
          </button>
        </div>
      </div>
    </div>
  )
}
