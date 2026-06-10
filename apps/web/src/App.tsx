import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth.store'
import { AppShell } from './components/shared/AppShell'
import { LoginPage } from './features/auth/LoginPage'
import { AgendaPage } from './features/agenda/AgendaPage'
import { PacientesPage } from './features/pacientes/PacientesPage'
import { PacienteDetallePage } from './features/pacientes/PacienteDetallePage'
import { CajaPage } from './features/caja/CajaPage'
import { DeudoresPage } from './features/deudores/DeudoresPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { CatalogoPage } from './features/catalogo/CatalogoPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppShell />
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="pacientes" element={<PacientesPage />} />
        <Route path="pacientes/:id" element={<PacienteDetallePage />} />
        <Route path="caja" element={<CajaPage />} />
        <Route path="deudores" element={<DeudoresPage />} />
        <Route path="catalogo" element={<CatalogoPage />} />
      </Route>
    </Routes>
  )
}
