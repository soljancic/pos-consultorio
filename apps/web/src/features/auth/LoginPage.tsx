import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'
import { api } from '../../lib/api-client'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { CalendarCheck, Wallet, BellRing, AlertCircle } from 'lucide-react'
import { RecuperarPasswordModal } from './RecuperarPasswordModal'

const BENEFICIOS = [
  { icon: CalendarCheck, texto: 'Agenda del día con estados en un vistazo' },
  { icon: Wallet, texto: 'Cobros, deudas y caja siempre cuadrados' },
  { icon: BellRing, texto: 'Recordatorios por WhatsApp en un click' },
]

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recuperando, setRecuperando] = useState(false)
  const { setTokens, setUser } = useAuthStore()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setTokens(data.accessToken, data.refreshToken)
      setUser(data.user)
      navigate('/agenda')
    } catch {
      setError('Email o contrasena incorrectos')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSuccess(response: CredentialResponse) {
    if (!response.credential) {
      setError('Google no devolvio credencial valida')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/auth/google', { credential: response.credential })
      setTokens(data.accessToken, data.refreshToken)
      setUser(data.user)
      navigate('/agenda')
    } catch {
      setError('No se pudo iniciar sesion con Google. Verificar que tu cuenta este registrada.')
    } finally {
      setLoading(false)
    }
  }

  function handleGoogleError() {
    setError('No se pudo iniciar sesion con Google')
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Panel de marca (desktop) */}
      <div className="hidden lg:flex lg:w-[45%] bg-primary text-primary-foreground flex-col justify-center p-12">
        <div className="space-y-8 max-w-md">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-lg p-2">
              <img src="/brand/isotipo.png" alt="" className="h-14 w-auto" />
            </div>
            <span className="text-5xl font-bold tracking-tight">ConsulTech</span>
          </div>
          <h1 className="text-3xl font-bold leading-snug">
            El día a día de tu consultorio, en una sola pantalla
          </h1>
          <ul className="space-y-4">
            {BENEFICIOS.map(({ icon: Icon, texto }) => (
              <li key={texto} className="flex items-center gap-3 text-cyan-50">
                <span className="bg-white/15 rounded-md p-1.5 shrink-0">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-sm">{texto}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-cyan-100/80">
            Para consultorios de 1 a 10 profesionales
          </p>
        </div>
      </div>

      {/* Formulario */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-6 lg:hidden">
            <img src="/brand/imagotipo.png" alt="ConsulTech" className="h-24 w-auto" />
          </div>

          <div className="bg-card rounded-xl border shadow-sm p-8">
            <h2 className="text-xl font-bold text-foreground mb-1">Ingresar</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Accede con tu cuenta del consultorio
            </p>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-foreground mb-1.5">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 border border-input bg-card rounded-md px-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:border-ring transition-colors duration-150"
                  placeholder="admin@consultorio.com"
                  required
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="block text-sm font-medium text-foreground">
                    Contraseña
                  </label>
                  <button
                    type="button"
                    onClick={() => setRecuperando(true)}
                    className="text-xs font-medium text-primary cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 border border-input bg-card rounded-md px-3 text-base sm:text-sm text-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:border-ring transition-colors duration-150"
                  required
                />
              </div>

              {error && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-primary text-primary-foreground rounded-md text-sm font-semibold cursor-pointer hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150"
              >
                {loading ? 'Ingresando...' : 'Ingresar'}
              </button>

              {googleClientId && (
                <>
                  <div className="flex items-center gap-3 my-1">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">o</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <div className="flex justify-center">
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={handleGoogleError}
                      width="100%"
                      text="signin_with"
                    />
                  </div>
                </>
              )}
            </form>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-s text-muted-foreground">
            by
            <img src="/brand/toptech.png" alt="Toptech" className="h-14 w-auto" />
          </p>
        </div>
      </div>

      {recuperando && (
        <RecuperarPasswordModal emailInicial={email} onClose={() => setRecuperando(false)} />
      )}
    </div>
  )
}
