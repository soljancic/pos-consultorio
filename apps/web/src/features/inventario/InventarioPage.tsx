import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Package } from 'lucide-react'
import { cn } from '../../lib/utils'
import { chipIconUI } from '../../lib/ui'
import { useAuthStore } from '../../stores/auth.store'
import { CampanaHeader } from '../notificaciones/CampanaHeader'
import { ProductosTab } from './ProductosTab'
import { VentasDetalleTab } from './VentasDetalleTab'

type TabId = 'productos' | 'ventas' | 'compras' | 'ajustes'

// Compras (P2) y Ajustes (P3) llegan en etapas siguientes: se muestran como
// pestañas deshabilitadas para señalar el roadmap sin prometer lo que no existe.
const TABS: { id: TabId; label: string; disponible: boolean }[] = [
  { id: 'productos', label: 'Productos', disponible: true },
  { id: 'ventas', label: 'Ventas', disponible: true },
  { id: 'compras', label: 'Compras', disponible: false },
  { id: 'ajustes', label: 'Ajustes', disponible: false },
]

export function InventarioPage() {
  const vendeProductos = useAuthStore((s) => s.user?.vendeProductos)
  const [tab, setTab] = useState<TabId>('productos')

  // Guard de UX: la seguridad real es el @Roles(ADMIN) del backend. Si el
  // consultorio no vende productos, esta sección no aplica.
  if (vendeProductos === false) return <Navigate to="/inicio" replace />

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <span className={chipIconUI}>
              <Package className="h-4 w-4" aria-hidden="true" />
            </span>
            Inventario
          </h1>
          <div className="flex gap-1" role="tablist" aria-label="Secciones de inventario">
            {TABS.map((t) =>
              t.disponible ? (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  role="tab"
                  aria-selected={tab === t.id}
                  className={cn(
                    'px-4 py-1.5 rounded-md text-sm font-medium cursor-pointer focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                    tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t.label}
                </button>
              ) : (
                <span
                  key={t.id}
                  role="tab"
                  aria-selected={false}
                  aria-disabled="true"
                  title="Próximamente"
                  className="px-4 py-1.5 rounded-md text-sm font-medium text-muted-foreground/45 cursor-not-allowed select-none"
                >
                  {t.label}
                  <span className="ml-1.5 align-middle text-[10px] uppercase tracking-wide text-muted-foreground/50">
                    Pronto
                  </span>
                </span>
              ),
            )}
          </div>
        </div>
        <CampanaHeader />
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 max-w-5xl mx-auto w-full">
        {tab === 'productos' && <ProductosTab />}
        {tab === 'ventas' && <VentasDetalleTab />}
      </div>
    </div>
  )
}
