import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth.store'
import { AppShell } from './components/shared/AppShell'
import { LoginPage } from './features/auth/LoginPage'
import { EstablecerPasswordPage } from './features/auth/EstablecerPasswordPage'
import { AgendaPage } from './features/agenda/AgendaPage'
import { PacientesPage } from './features/pacientes/PacientesPage'
import { PacienteDetallePage } from './features/pacientes/PacienteDetallePage'
import { CajaPage } from './features/caja/CajaPage'
import { GastosPage } from './features/gastos/GastosPage'
import { CalendarioAtencionPage } from './features/calendario/CalendarioAtencionPage'
import { ActividadPage } from './features/actividad/ActividadPage'
import { ReservarPage } from './features/portal/ReservarPage'
import { QrPage } from './features/portal/QrPage'
import { DeudoresPage } from './features/deudores/DeudoresPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ConfiguracionPage } from './features/configuracion/ConfiguracionPage'
import { ReportesPage } from './features/reportes/ReportesPage'
import { MensajesPage } from './features/mensajes/MensajesPage'
import { CatalogoPage } from './features/catalogo/CatalogoPage'
import { LandingPage } from './features/landing/LandingPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

// Raiz del dominio: con sesion va al panel; sin sesion muestra la landing publica
function HomeGate() {
  const token = useAuthStore((s) => s.accessToken)
  return token ? <Navigate to="/inicio" replace /> : <LandingPage />
}

// Guard de UX: la seguridad real es el @Roles(ADMIN) del backend
function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  return user?.rol === 'ADMIN' ? <>{children}</> : <Navigate to="/agenda" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Publicas: sin auth ni AppShell */}
      <Route path="/reservar/:slug" element={<ReservarPage />} />
      <Route path="/qr/:slug" element={<QrPage />} />
      <Route path="/establecer-password" element={<EstablecerPasswordPage />} />
      {/* Raiz publica: landing del producto (o panel si hay sesion) */}
      <Route path="/" element={<HomeGate />} />
      {/* POS protegido bajo el shell (layout sin path: las URLs no cambian) */}
      <Route
        element={
          <PrivateRoute>
            <AppShell />
          </PrivateRoute>
        }
      >
        <Route path="inicio" element={<DashboardPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="calendario-atencion" element={<CalendarioAtencionPage />} />
        <Route path="pacientes" element={<PacientesPage />} />
        <Route path="pacientes/:id" element={<PacienteDetallePage />} />
        <Route path="caja" element={<CajaPage />} />
        <Route path="gastos" element={<GastosPage />} />
        <Route path="deudores" element={<DeudoresPage />} />
        <Route path="mensajes" element={<MensajesPage />} />
        <Route path="catalogo" element={<CatalogoPage />} />
        <Route path="configuracion" element={<AdminRoute><ConfiguracionPage /></AdminRoute>} />
        <Route path="reportes" element={<AdminRoute><ReportesPage /></AdminRoute>} />
        <Route path="actividad" element={<AdminRoute><ActividadPage /></AdminRoute>} />
      </Route>
    </Routes>
  )
}
