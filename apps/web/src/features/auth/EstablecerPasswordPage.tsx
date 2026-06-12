import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Stethoscope, AlertCircle, CheckCircle2 } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, errorUI } from '../../lib/ui'

// Pagina publica (E2-M10): destino del link de invitacion / reset de contraseña
export function EstablecerPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [listo, setListo] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/password/establecer', { token, password })
      setListo(true)
    } catch (err: any) {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'No se pudo establecer la contraseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-4 justify-center">
          <Stethoscope className="h-7 w-7 text-primary" aria-hidden="true" />
          <span className="text-lg font-semibold text-foreground">Consultech</span>
        </div>

        <div className="bg-card rounded-xl border shadow-sm p-8">
          {listo ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="h-10 w-10 text-accent mx-auto" aria-hidden="true" />
              <h2 className="text-xl font-bold text-foreground">Contraseña guardada</h2>
              <p className="text-sm text-muted-foreground">
                Ya podés ingresar al sistema con tu correo y tu nueva contraseña.
              </p>
              <Link to="/login" className={cn(btnPrimaryUI, 'w-full inline-flex')}>
                Ir a ingresar
              </Link>
            </div>
          ) : !token ? (
            <div className="text-center space-y-3">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto" aria-hidden="true" />
              <h2 className="text-xl font-bold text-foreground">Enlace incompleto</h2>
              <p className="text-sm text-muted-foreground">
                Abrí el enlace tal como llegó en el correo. Si el problema sigue, pedí uno nuevo desde
                "¿Olvidaste tu contraseña?" en la pantalla de ingreso.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-foreground mb-1">Definí tu contraseña</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Elegila de al menos 8 caracteres. El enlace es de un solo uso.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="np-password" className="block text-sm font-medium text-foreground mb-1.5">
                    Nueva contraseña
                  </label>
                  <input
                    id="np-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputUI}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="np-confirmar" className="block text-sm font-medium text-foreground mb-1.5">
                    Repetir contraseña
                  </label>
                  <input
                    id="np-confirmar"
                    type="password"
                    autoComplete="new-password"
                    value={confirmar}
                    onChange={(e) => setConfirmar(e.target.value)}
                    className={inputUI}
                    required
                  />
                </div>

                {error && (
                  <p role="alert" className={errorUI}>
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {error}
                  </p>
                )}

                <button type="submit" disabled={loading} className={cn(btnPrimaryUI, 'w-full')}>
                  {loading ? 'Guardando...' : 'Guardar contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
