import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  Calendar,
  Users,
  DollarSign,
  Settings,
  LogOut,
  Stethoscope,
  AlertCircle,
  LayoutDashboard,
  Cog,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
} from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import { aplicarTema, temaActual, type Tema } from '../../lib/theme'
import { cn } from '../../lib/utils'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Inicio', end: true },
  { to: '/agenda', icon: Calendar, label: 'Agenda' },
  { to: '/pacientes', icon: Users, label: 'Pacientes' },
  { to: '/deudores', icon: AlertCircle, label: 'Deudores' },
  { to: '/caja', icon: DollarSign, label: 'Caja' },
  { to: '/catalogo', icon: Settings, label: 'Catalogo' },
  { to: '/configuracion', icon: Cog, label: 'Configuracion', soloAdmin: true },
]

const COLAPSADO_KEY = 'pos-sidebar-colapsado'

export function AppShell() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [colapsado, setColapsado] = useState(
    () => localStorage.getItem(COLAPSADO_KEY) === 'true',
  )
  const [tema, setTema] = useState<Tema>(temaActual)

  function toggleSidebar() {
    setColapsado((c) => {
      localStorage.setItem(COLAPSADO_KEY, String(!c))
      return !c
    })
  }

  function toggleTema() {
    const nuevo: Tema = tema === 'dark' ? 'light' : 'dark'
    aplicarTema(nuevo)
    setTema(nuevo)
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const iniciales = (user?.nombre ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const esAdmin = user?.rol === 'ADMIN'

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col bg-teal-950 text-teal-50 transition-[width] duration-200',
          colapsado ? 'w-16' : 'w-60',
        )}
      >
        {/* Header: toggle + logo */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-4 border-b border-white/10',
            colapsado && 'justify-center px-0',
          )}
        >
          <button
            onClick={toggleSidebar}
            title={colapsado ? 'Expandir menu' : 'Colapsar menu'}
            aria-label={colapsado ? 'Expandir menu' : 'Colapsar menu'}
            className="p-2 rounded-md text-teal-200 hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors duration-150"
          >
            {colapsado ? (
              <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
          {!colapsado && (
            <span className="flex items-center gap-2 min-w-0">
              <Stethoscope className="h-5 w-5 text-cyan-400 shrink-0" aria-hidden="true" />
              <span className="text-sm font-semibold text-white truncate">
                {user?.consultorioNombre || 'POS Consultorio'}
              </span>
            </span>
          )}
        </div>

        {/* Navegacion */}
        <nav className="flex-1 py-3 space-y-1 px-2 overflow-y-auto">
          {NAV_ITEMS.filter((item) => !item.soloAdmin || esAdmin).map(
            ({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={colapsado ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                    colapsado && 'justify-center px-0',
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-teal-200/80 hover:bg-white/10 hover:text-white',
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {!colapsado && <span className="truncate">{label}</span>}
              </NavLink>
            ),
          )}
        </nav>

        {/* Pie: Mi cuenta + tema */}
        <div className="p-2 border-t border-white/10 space-y-1">
          {/* Mi cuenta */}
          <div
            title={colapsado ? `${user?.nombre} (${user?.rol})` : undefined}
            className={cn(
              'flex items-center gap-3 px-2 py-2 rounded-lg bg-white/5',
              colapsado && 'justify-center px-0',
            )}
          >
            <span
              className="h-8 w-8 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              {iniciales}
            </span>
            {!colapsado && (
              <>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-white truncate">
                    {user?.nombre}
                  </span>
                  <span className="block text-xs text-teal-300/70 truncate">Mi cuenta</span>
                </span>
                <button
                  onClick={handleLogout}
                  title="Cerrar sesion"
                  aria-label="Cerrar sesion"
                  className="p-1.5 rounded-md text-teal-300/70 hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors duration-150"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          {/* Toggle tema */}
          <button
            onClick={toggleTema}
            role="switch"
            aria-checked={tema === 'dark'}
            title={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium text-teal-200/80 hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors duration-150',
              colapsado && 'justify-center px-0',
            )}
          >
            <span className="h-8 w-8 flex items-center justify-center shrink-0" aria-hidden="true">
              {tema === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </span>
            {!colapsado && (
              <>
                <span className="flex-1 text-left">Modo oscuro</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-5 w-9 rounded-full p-0.5 transition-colors duration-150',
                    tema === 'dark' ? 'bg-primary' : 'bg-white/20',
                  )}
                >
                  <span
                    className={cn(
                      'block h-4 w-4 rounded-full bg-white transition-transform duration-150',
                      tema === 'dark' && 'translate-x-4',
                    )}
                  />
                </span>
              </>
            )}
          </button>

          {/* Logout visible cuando esta colapsado */}
          {colapsado && (
            <button
              onClick={handleLogout}
              title="Cerrar sesion"
              aria-label="Cerrar sesion"
              className="w-full flex items-center justify-center py-2 rounded-lg text-teal-200/80 hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors duration-150"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
