import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Calendar, Users, DollarSign, Settings, LogOut, Stethoscope, AlertCircle, LayoutDashboard, Cog } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
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

export function AppShell() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-16 lg:w-56 flex flex-col bg-slate-900 text-slate-100">
        <div className="flex items-center gap-2 px-4 py-5 border-b border-slate-700">
          <Stethoscope className="h-6 w-6 text-blue-400 shrink-0" />
          <span className="hidden lg:block text-sm font-semibold text-white truncate">
            {user?.consultorioNombre || 'POS Consultorio'}
          </span>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {NAV_ITEMS.filter((item) => !item.soloAdmin || user?.rol === 'ADMIN').map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="hidden lg:block text-xs text-slate-500 mb-2 truncate">
            {user?.nombre} ({user?.rol})
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm w-full"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="hidden lg:block">Salir</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
