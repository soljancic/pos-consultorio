import { cn } from '../../lib/utils'

// Avatar del doctor: si tiene foto la muestra, si no el circulo de color con
// sus iniciales (el color de agenda). Usado en agenda dia, horarios y catalogo.

interface Props {
  nombre: string
  colorAgenda: string
  fotoUrl?: string | null
  size?: number // px
  className?: string
}

export function DoctorAvatar({ nombre, colorAgenda, fotoUrl, size = 28, className }: Props) {
  const dim = { width: size, height: size }
  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt=""
        style={dim}
        className={cn('rounded-full object-cover shrink-0 ring-1 ring-black/5', className)}
      />
    )
  }
  const iniciales = nombre.replace(/^dr\.?a?\s*/i, '').slice(0, 2).toUpperCase()
  return (
    <span
      style={{ ...dim, backgroundColor: colorAgenda, fontSize: Math.round(size * 0.38) }}
      className={cn('rounded-full text-white font-bold flex items-center justify-center shrink-0', className)}
      aria-hidden="true"
    >
      {iniciales}
    </span>
  )
}
