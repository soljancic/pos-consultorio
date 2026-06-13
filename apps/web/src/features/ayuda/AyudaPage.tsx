import { useState } from 'react'
import { HelpCircle, ImageIcon } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import { cn } from '../../lib/utils'
import { cardUI, chipIconUI } from '../../lib/ui'
import { AYUDA } from './contenido'

// Manual de usuario in-app, organizado por rol. Preselecciona el rol del usuario;
// cualquiera puede explorar las demas secciones (el contenido de ayuda no es
// sensible). El contenido vive en contenido.ts; aca solo se renderiza.

// La captura de cada tema vive en /ayuda/<id>.png (convencion). Si el archivo no
// existe todavia, cae a un placeholder. `key={tema.id}` resetea el error al cambiar.
function Captura({ id, imagen, titulo }: { id: string; imagen?: string; titulo: string }) {
  const [error, setError] = useState(false)
  const src = imagen ?? `/ayuda/${id}.png`
  return (
    <div className={cn(cardUI, 'mt-6 overflow-hidden')}>
      {error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground/70 bg-muted/30">
          <ImageIcon className="h-7 w-7" aria-hidden="true" />
          <p className="text-sm">Captura próximamente</p>
        </div>
      ) : (
        <img src={src} alt={`Captura: ${titulo}`} className="w-full" onError={() => setError(true)} />
      )}
    </div>
  )
}

export function AyudaPage() {
  const user = useAuthStore((s) => s.user)
  const rolInicial = AYUDA.find((s) => s.rol === user?.rol)?.rol ?? AYUDA[0].rol
  const [rolSel, setRolSel] = useState(rolInicial)
  const seccion = AYUDA.find((s) => s.rol === rolSel) ?? AYUDA[0]
  const [temaId, setTemaId] = useState(seccion.temas[0].id)
  const tema = seccion.temas.find((t) => t.id === temaId) ?? seccion.temas[0]

  function elegirRol(rol: typeof rolSel) {
    setRolSel(rol)
    const s = AYUDA.find((x) => x.rol === rol)
    if (s) setTemaId(s.temas[0].id)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-4 border-b bg-card">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className={chipIconUI}>
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
          </span>
          Ayuda
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Guía paso a paso del sistema. Elegí tu rol y el tema que te interesa.
        </p>
        {/* Selector de rol */}
        <div className="flex flex-wrap gap-1.5 mt-3" role="tablist" aria-label="Rol">
          {AYUDA.map(({ rol, label, icono: Icono }) => (
            <button
              key={rol}
              onClick={() => elegirRol(rol)}
              role="tab"
              aria-selected={rolSel === rol}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                rolSel === rol ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Icono className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row gap-6 max-w-5xl mx-auto">
          {/* Indice de temas del rol */}
          <nav className="lg:w-72 shrink-0">
            <ul className="space-y-1">
              {seccion.temas.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setTemaId(t.id)}
                    aria-current={t.id === temaId ? 'true' : undefined}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                      t.id === temaId
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground hover:bg-muted',
                    )}
                  >
                    {t.titulo}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contenido del tema */}
          <article className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-foreground">{tema.titulo}</h2>
            {tema.intro && <p className="mt-1.5 text-muted-foreground">{tema.intro}</p>}

            <ol className="mt-5 space-y-3">
              {tema.pasos.map((paso, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary text-xs font-bold tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-sm text-foreground leading-relaxed pt-0.5">{paso}</span>
                </li>
              ))}
            </ol>

            {/* Captura: por convencion /ayuda/<id>.png; si no existe, placeholder */}
            <Captura key={tema.id} id={tema.id} imagen={tema.imagen} titulo={tema.titulo} />
          </article>
        </div>
      </div>
    </div>
  )
}
