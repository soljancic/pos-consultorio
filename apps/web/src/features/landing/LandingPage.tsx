import { Link } from 'react-router-dom'
import {
  CalendarCheck, Wallet, Users, BarChart3, Globe, ShieldCheck,
  ArrowRight, MessageCircle, Stethoscope,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI, cardUI } from '../../lib/ui'

// Landing publica de Consultech (raiz del dominio). Estatica, sin llamadas a la
// API. Reusa los tokens del design system (primary cyan, card, foreground) y
// hereda el dark mode. Copy en espanol con acentos.

const FEATURES = [
  {
    icon: CalendarCheck,
    titulo: 'Agenda y portal de reservas',
    texto: 'Agenda diaria, semanal y mensual con estados de cita. Tus pacientes reservan online desde un enlace propio, estilo Calendly.',
  },
  {
    icon: Wallet,
    titulo: 'Caja con arqueo ciego',
    texto: 'Apertura de turno, cobros parciales y cierre con arqueo ciego. El resumen del turno llega por correo automáticamente.',
  },
  {
    icon: Users,
    titulo: 'Deudores y recordatorios',
    texto: 'Deuda real por paciente y recordatorios de cita y de pago listos para enviar por WhatsApp en un toque.',
  },
  {
    icon: BarChart3,
    titulo: 'Reportes y comisiones',
    texto: 'Ingresos por forma de pago, gastos, resultado neto y comisiones por profesional. Exportá a Excel cuando quieras.',
  },
]

const HIGHLIGHTS = [
  { icon: ShieldCheck, texto: 'Multi-consultorio seguro' },
  { icon: Globe, texto: 'Reservas online 24/7' },
  { icon: MessageCircle, texto: 'WhatsApp integrado' },
]

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground overflow-x-hidden">
      <style>{`
        @keyframes ct-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        .ct-rise { opacity: 0; animation: ct-rise 0.6s cubic-bezier(0.22,1,0.36,1) forwards; }
        @media (prefers-reduced-motion: reduce) { .ct-rise { animation: none; opacity: 1; } }
      `}</style>

      {/* Barra superior */}
      <header className="relative z-10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <img src="/brand/imagotipo.png" alt="Consultech" className="h-8 w-auto" />
          <Link to="/login" className={cn(btnPrimaryUI, 'h-9')}>
            Iniciar sesión
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* Hero con atmosfera: gradientes radiales en cian + grilla sutil */}
      <section className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 70%), radial-gradient(40% 40% at 85% 20%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 70%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.4] [mask-image:radial-gradient(70%_50%_at_50%_0%,black,transparent)]"
          style={{
            backgroundImage:
              'linear-gradient(to right, color-mix(in oklab, var(--foreground) 8%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 8%, transparent) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-14 pb-20 sm:pt-24 sm:pb-28 text-center">
          <span
            className="ct-rise inline-flex items-center gap-2 rounded-full border bg-card/70 backdrop-blur px-3 py-1 text-xs font-medium text-muted-foreground"
            style={{ animationDelay: '0ms' }}
          >
            <Stethoscope className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            El sistema para tu consultorio
          </span>

          <h1
            className="ct-rise mt-6 text-4xl sm:text-6xl font-bold tracking-tight text-balance"
            style={{ animationDelay: '80ms' }}
          >
            Gestioná tu consultorio
            <span className="block text-primary">sin perder el pulso</span>
          </h1>

          <p
            className="ct-rise mx-auto mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground text-pretty"
            style={{ animationDelay: '160ms' }}
          >
            Agenda, reservas online, caja con arqueo ciego, deudores y reportes en
            un solo lugar. Pensado para médicos, odontólogos, psicólogos y estéticas
            médicas.
          </p>

          <div
            className="ct-rise mt-9 flex flex-col sm:flex-row items-center justify-center gap-3"
            style={{ animationDelay: '240ms' }}
          >
            <Link to="/login" className={cn(btnPrimaryUI, 'h-11 px-6 text-base w-full sm:w-auto')}>
              Iniciar sesión
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a href="#funciones" className={cn(btnOutlineUI, 'h-11 px-6 text-base w-full sm:w-auto')}>
              Ver funciones
            </a>
          </div>

          <div
            className="ct-rise mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
            style={{ animationDelay: '320ms' }}
          >
            {HIGHLIGHTS.map(({ icon: Icon, texto }) => (
              <span key={texto} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                {texto}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Funciones */}
      <section id="funciones" className="max-w-6xl mx-auto px-5 sm:px-8 pb-20 sm:pb-28 scroll-mt-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Todo lo que tu día necesita</h2>
          <p className="mt-2 text-muted-foreground">Cuatro módulos que trabajan juntos, sin planillas sueltas.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {FEATURES.map(({ icon: Icon, titulo, texto }) => (
            <article
              key={titulo}
              className={cn(cardUI, 'p-6 transition-shadow duration-200 hover:shadow-md')}
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{titulo}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{texto}</p>
            </article>
          ))}
        </div>

        {/* CTA de cierre */}
        <div className={cn(cardUI, 'mt-12 p-8 sm:p-10 text-center relative overflow-hidden')}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ background: 'radial-gradient(50% 120% at 50% 0%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 70%)' }}
          />
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Empezá hoy mismo</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            Ingresá con tu cuenta y tené la agenda, la caja y los reportes de tu
            consultorio bajo control.
          </p>
          <Link to="/login" className={cn(btnPrimaryUI, 'mt-6 h-11 px-6 text-base')}>
            Iniciar sesión
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Footer con marca Toptech */}
      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Consultech. Todos los derechos reservados.
          </p>
          <a
            href="https://toptech.com.bo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>by</span>
            <img src="/brand/toptech.png" alt="Toptech" className="h-5 w-auto" />
          </a>
        </div>
      </footer>
    </div>
  )
}
