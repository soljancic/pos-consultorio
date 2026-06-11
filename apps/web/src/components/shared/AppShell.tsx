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
  Menu,
  X,
  Receipt,
  CalendarClock,
} from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import { aplicarTema, temaActual, type Tema } from '../../lib/theme'
import { cn } from '../../lib/utils'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Inicio', end: true },
  { to: '/agenda', icon: Calendar, label: 'Agenda' },
  { to: '/calendario-atencion', icon: CalendarClock, label: 'Horarios' },
  { to: '/pacientes', icon: Users, label: 'Pacientes' },
  { to: '/deudores', icon: AlertCircle, label: 'Deudores' },
  { to: '/caja', icon: DollarSign, label: 'Caja' },
  { to: '/gastos', icon: Receipt, label: 'Gastos' },
  { to: '/catalogo', icon: Settings, label: 'Catalogo' },
  { to: '/configuracion', icon: Cog, label: 'Configuracion', soloAdmin: true },
]

const COLAPSADO_KEY = 'pos-sidebar-colapsado'

export function AppShell() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  // Desktop: colapsado a iconos (persistido). Movil: drawer abierto/cerrado.
  const [colapsado, setColapsado] = useState(
    () => localStorage.getItem(COLAPSADO_KEY) === 'true',
  )
  const [abiertoMovil, setAbiertoMovil] = useState(false)
  const [tema, setTema] = useState<Tema>(temaActual)

  function toggleColapsado() {
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

  // En movil el drawer siempre se ve expandido; "colapsado" solo aplica en lg+
  const ocultarTexto = colapsado ? 'lg:hidden' : ''
  const centrarItem = colapsado ? 'lg:justify-center lg:px-0' : ''

  return (
    <div className="flex h-screen bg-background">
      {/* Backdrop del drawer (solo movil) */}
      {abiertoMovil && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setAbiertoMovil(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: drawer en movil, columna fija colapsable en desktop */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-60 flex flex-col bg-teal-950 text-teal-50 transition-transform duration-200',
          'lg:static lg:translate-x-0 lg:visible lg:transition-[width]',
          // invisible ademas del translate: saca el drawer cerrado del orden
          // de tabulacion y de los checks de visibilidad
          abiertoMovil ? 'translate-x-0' : '-translate-x-full invisible',
          colapsado ? 'lg:w-16' : 'lg:w-60',
        )}
      >
        {/* Header: toggle + logo */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-4 border-b border-white/10',
            colapsado && 'lg:justify-center lg:px-0',
          )}
        >
          {/* Cerrar drawer (movil) */}
          <button
            onClick={() => setAbiertoMovil(false)}
            aria-label="Cerrar menu"
            className="lg:hidden p-2 rounded-md text-teal-200 hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors duration-150"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          {/* Colapsar (desktop) */}
          <button
            onClick={toggleColapsado}
            title={colapsado ? 'Expandir menu' : 'Colapsar menu'}
            aria-label={colapsado ? 'Expandir menu' : 'Colapsar menu'}
            className="hidden lg:block p-2 rounded-md text-teal-200 hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors duration-150"
          >
            {colapsado ? (
              <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
          <span className={cn('flex items-center gap-2 min-w-0', ocultarTexto)}>
            <Stethoscope className="h-5 w-5 text-cyan-400 shrink-0" aria-hidden="true" />
            <span className="text-sm font-semibold text-white truncate">
              {user?.consultorioNombre || 'POS Consultorio'}
            </span>
          </span>
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
                onClick={() => setAbiertoMovil(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                    centrarItem,
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-teal-200/80 hover:bg-white/10 hover:text-white',
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className={cn('truncate', ocultarTexto)}>{label}</span>
              </NavLink>
            ),
          )}
        </nav>

        {/* Pie: Mi cuenta + tema */}
        <div className="p-2 border-t border-white/10 space-y-1">
          {/* Mi cuenta */}
          <div
            title={colapsado ? `${user?.nombre} (${user?.rol})` : undefined}
            className={cn('flex items-center gap-3 px-2 py-2 rounded-lg bg-white/5', centrarItem)}
          >
            <span
              className="h-8 w-8 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              {iniciales}
            </span>
            <span className={cn('flex-1 min-w-0', ocultarTexto)}>
              <span className="block text-sm font-medium text-white truncate">
                {user?.nombre}
              </span>
              <span className="block text-xs text-teal-300/70 truncate">Mi cuenta</span>
            </span>
            <button
              onClick={handleLogout}
              title="Cerrar sesion"
              aria-label="Cerrar sesion"
              className={cn(
                'p-1.5 rounded-md text-teal-300/70 hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors duration-150',
                ocultarTexto,
              )}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Toggle tema */}
          <button
            onClick={toggleTema}
            role="switch"
            aria-checked={tema === 'dark'}
            title={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium text-teal-200/80 hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors duration-150',
              centrarItem,
            )}
          >
            <span className="h-8 w-8 flex items-center justify-center shrink-0" aria-hidden="true">
              {tema === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </span>
            <span className={cn('flex-1 text-left', ocultarTexto)}>Modo oscuro</span>
            <span
              aria-hidden="true"
              className={cn(
                'h-5 w-9 rounded-full p-0.5 transition-colors duration-150',
                tema === 'dark' ? 'bg-primary' : 'bg-white/20',
                ocultarTexto,
              )}
            >
              <span
                className={cn(
                  'block h-4 w-4 rounded-full bg-white transition-transform duration-150',
                  tema === 'dark' && 'translate-x-4',
                )}
              />
            </span>
          </button>

          {/* Logout visible cuando esta colapsado (solo desktop) */}
          {colapsado && (
            <button
              onClick={handleLogout}
              title="Cerrar sesion"
              aria-label="Cerrar sesion"
              className="hidden lg:flex w-full items-center justify-center py-2 rounded-lg text-teal-200/80 hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors duration-150"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </aside>

      {/* Columna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar movil */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-teal-950 text-white shrink-0">
          <button
            onClick={() => setAbiertoMovil(true)}
            aria-label="Abrir menu"
            className="p-2 -ml-2 rounded-md text-teal-200 hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <Stethoscope className="h-5 w-5 text-cyan-400 shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold truncate">
            {user?.consultorioNombre || 'POS Consultorio'}
          </span>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
