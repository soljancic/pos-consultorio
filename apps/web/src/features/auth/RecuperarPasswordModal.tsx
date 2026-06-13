import { useState } from 'react'
import { X, AlertCircle, MailCheck } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

interface Props {
  emailInicial?: string
  onClose: () => void
}

// Olvido de contraseña (E2-M10): la respuesta es la misma exista o no la
// cuenta (el backend no revela cuentas), por eso el mensaje es generico
export function RecuperarPasswordModal({ emailInicial, onClose }: Props) {
  const [email, setEmail] = useState(emailInicial ?? '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/password/solicitar', { email })
      setEnviado(true)
    } catch (err: any) {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'No se pudo enviar el correo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">Recuperar contraseña</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6">
          {enviado ? (
            <div className="text-center space-y-4">
              <MailCheck className="h-10 w-10 text-accent mx-auto" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Si existe una cuenta con ese correo, te enviamos un enlace para elegir una nueva
                contraseña. Revisá también la carpeta de spam.
              </p>
              <button onClick={onClose} className={cn(btnPrimaryUI, 'w-full')}>
                Entendido
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <p className="text-sm text-muted-foreground">
                Ingresá el correo de tu cuenta y te enviamos un enlace para restablecerla.
              </p>
              <div>
                <label htmlFor="rec-email" className="block text-sm font-medium text-foreground mb-1.5">
                  Email
                </label>
                <input
                  id="rec-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} className={btnOutlineUI}>
                  Cancelar
                </button>
                <button type="submit" disabled={loading || !email} className={cn(btnPrimaryUI, 'flex-1')}>
                  {loading ? 'Enviando...' : 'Enviar enlace'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
