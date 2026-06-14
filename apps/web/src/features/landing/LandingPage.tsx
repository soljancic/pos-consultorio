import { Link } from 'react-router-dom'
import {
  CalendarCheck, Wallet, Users, BarChart3, Globe, MessageCircle,
  ShieldCheck, ArrowRight, Check,
} from 'lucide-react'

// Landing publica de Consultech (raiz del dominio). Estatica, sin API.
// Estetica "clinical tech": superficie oscura con un unico acento cian de marca.
// Pasada de restraint (anti-slop): tipografia y espacio hacen el trabajo; sin
// gradient text, sin auroras borrosas, sin eyebrows en mayusculas, sin glows
// decorativos. La pieza es siempre oscura a proposito (independiente del tema app).

const FEATURES = [
  {
    icon: CalendarCheck,
    titulo: 'Agenda + reservas online',
    texto: 'Vista día, semana y mes. Tus pacientes reservan solos desde un enlace propio, con tu disponibilidad real.',
  },
  {
    icon: Wallet,
    titulo: 'Caja con arqueo ciego',
    texto: 'Apertura de turno, cobros parciales y cierre ciego. El resumen del turno llega por correo, automático.',
  },
  {
    icon: Users,
    titulo: 'Deudores y WhatsApp',
    texto: 'Deuda real por paciente y recordatorios de cita y de pago listos para enviar por WhatsApp en un toque.',
  },
  {
    icon: BarChart3,
    titulo: 'Reportes y comisiones',
    texto: 'Ingresos por forma de pago, gastos, resultado neto y comisiones por profesional. Exportás a Excel.',
  },
]

const PASOS = [
  { n: '1', titulo: 'Reservá', texto: 'El paciente elige día y hora online, o lo agenda la secretaria en segundos.' },
  { n: '2', titulo: 'Atendé', texto: 'Estados de cita en vivo, historia clínica y recetas en PDF con membrete.' },
  { n: '3', titulo: 'Cobrá', texto: 'Cobro por cita, caja del día por forma de pago y cierre con arqueo ciego.' },
]

const CAPACIDADES = ['Agenda', 'Reservas online', 'Caja', 'Deudores', 'WhatsApp', 'Recetas', 'Reportes', 'Multi-consultorio']

const INCLUYE = [
  'Agenda día, semana y mes',
  'Reservas online (portal propio)',
  'Caja con arqueo ciego',
  'Deudores y recordatorios por WhatsApp',
  'Historia clínica y recetas en PDF',
  'Reportes, comisiones y export a Excel',
  'Multi-consultorio',
  'App instalable (PWA)',
]

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-[#070d18] overflow-x-hidden antialiased selection:bg-cyan-400/30" style={{ color: '#cbd5e1' }}>
      <style>{`
        @keyframes ct-rise { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
        .ct-rise { opacity:0; animation:ct-rise .6s cubic-bezier(.16,1,.3,1) forwards }
        @media (prefers-reduced-motion: reduce) { .ct-rise { animation:none; opacity:1 } }
      `}</style>

      {/* ── NAV ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#070d18]/80 border-b border-white/5">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/brand/isotipo.png" alt="" className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight text-white">
              Consul<span className="text-cyan-400">Tech</span>
            </span>
          </div>
          <nav className="flex items-center gap-1">
            <a
              href="#precios"
              className="hidden sm:inline-flex items-center h-9 px-3 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            >
              Precios
            </a>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold text-slate-200 hover:text-white hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              Iniciar sesión
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative">
        {/* Grilla tecnica con mascara radial: precisa, no decorativa */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(75%_55%_at_50%_0%,black,transparent)]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.04) 1px, transparent 1px)',
            backgroundSize: '52px 52px',
          }}
        />

        <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-16 pb-20 sm:pt-24 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-10 items-center">
          {/* Columna texto */}
          <div className="text-center lg:text-left">
            <span className="ct-rise inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              Software de gestión para consultorios
            </span>

            <h1 className="ct-rise mt-6 text-[2.5rem] leading-[1.04] sm:text-6xl font-bold tracking-tight text-white text-balance" style={{ animationDelay: '60ms' }}>
              Tu consultorio,
              <br />
              de la reserva <span className="text-cyan-400">al cobro</span>
            </h1>

            <p className="ct-rise mx-auto lg:mx-0 mt-5 max-w-md text-base sm:text-lg leading-relaxed text-slate-400 text-pretty" style={{ animationDelay: '120ms' }}>
              Agenda, reservas online, caja con arqueo ciego, deudores y reportes
              en una sola plataforma. Para médicos, odontólogos, psicólogos y
              estéticas médicas.
            </p>

            <div className="ct-rise mt-8 flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3" style={{ animationDelay: '180ms' }}>
              <Link
                to="/login"
                className="group inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-cyan-400 text-[#06121f] text-base font-semibold w-full sm:w-auto hover:bg-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070d18]"
              >
                Iniciar sesión
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <a
                href="#funciones"
                className="inline-flex items-center justify-center h-12 px-6 rounded-xl text-base font-medium text-slate-300 w-full sm:w-auto hover:text-white hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
              >
                Ver funciones
              </a>
            </div>

            <div className="ct-rise mt-8 flex flex-wrap items-center lg:justify-start justify-center gap-x-6 gap-y-2" style={{ animationDelay: '240ms' }}>
              {[
                { icon: ShieldCheck, t: 'Multi-consultorio seguro' },
                { icon: Globe, t: 'Reservas 24/7' },
                { icon: MessageCircle, t: 'WhatsApp integrado' },
              ].map(({ icon: Icon, t }) => (
                <span key={t} className="inline-flex items-center gap-1.5 text-sm text-slate-400">
                  <Icon className="h-4 w-4 text-cyan-400" aria-hidden="true" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Columna preview del producto (mock real de la agenda) */}
          <div className="ct-rise" style={{ animationDelay: '160ms' }}>
            <div className="rounded-2xl border border-white/10 bg-[#0b1322] shadow-2xl shadow-black/40 overflow-hidden">
              {/* barra de ventana */}
              <div className="flex items-center gap-2 px-4 h-10 border-b border-white/5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-2 text-[11px] text-slate-400">Agenda · Hoy</span>
                <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-cyan-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> en vivo
                </span>
              </div>
              {/* citas mock */}
              <div className="p-4 space-y-2.5">
                {[
                  { h: '09:00', n: 'María González', e: 'Atendida', c: 'bg-emerald-400', t: 'text-emerald-300' },
                  { h: '09:30', n: 'Juan Pérez', e: 'En atención', c: 'bg-cyan-400', t: 'text-cyan-300' },
                  { h: '10:00', n: 'Lucía Rojas', e: 'Pendiente', c: 'bg-amber-400', t: 'text-amber-300' },
                  { h: '10:30', n: 'Diego Salas', e: 'Confirmada', c: 'bg-blue-400', t: 'text-blue-300' },
                ].map((r) => (
                  <div key={r.h} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
                    <span className="text-xs font-semibold tabular-nums text-slate-400 w-11">{r.h}</span>
                    <span className="text-sm text-white truncate flex-1">{r.n}</span>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${r.t}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${r.c}`} />
                      {r.e}
                    </span>
                  </div>
                ))}
              </div>
              {/* footer caja */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                  <Wallet className="h-3.5 w-3.5 text-cyan-400" /> Caja del día
                </span>
                <span className="text-sm font-bold tabular-nums text-white">Bs 4.250</span>
              </div>
            </div>
          </div>
        </div>

        {/* tira de capacidades */}
        <div className="border-y border-white/5">
          <div className="max-w-5xl mx-auto px-5 sm:px-8 py-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {CAPACIDADES.map((c, i) => (
              <span key={c} className="inline-flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-500">
                {i > 0 && <span className="h-1 w-1 rounded-full bg-slate-700" />}
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FUNCIONES ───────────────────────────────────────── */}
      <section id="funciones" className="max-w-5xl mx-auto px-5 sm:px-8 py-20 sm:py-28 scroll-mt-16">
        <div className="max-w-2xl mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white text-balance">
            Cuatro módulos que trabajan juntos
          </h2>
          <p className="mt-3 text-slate-400">Sin planillas sueltas, sin pasar datos de un lado a otro.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-9">
          {FEATURES.map(({ icon: Icon, titulo, texto }) => (
            <div key={titulo} className="flex gap-4">
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 border border-cyan-400/20 text-cyan-300">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-white">{titulo}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{texto}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMO FUNCIONA (secuencia real reserva → cobro) ──── */}
      <section className="border-y border-white/5 bg-white/[0.015]">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-12">De la reserva al cobro</h2>
          <ol className="grid sm:grid-cols-3 gap-x-6 gap-y-8">
            {PASOS.map(({ n, titulo, texto }) => (
              <li key={n} className="relative">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/30 text-sm font-bold tabular-nums text-cyan-400">
                    {n}
                  </span>
                  <h3 className="text-lg font-semibold text-white">{titulo}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── PRECIOS ─────────────────────────────────────────── */}
      <section id="precios" className="max-w-5xl mx-auto px-5 sm:px-8 py-20 sm:py-28 scroll-mt-16">
        <div className="max-w-2xl mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white text-balance">
            Un precio, todo incluido
          </h2>
          <p className="mt-3 text-slate-400">Sin módulos pagos aparte ni sorpresas. Todas las funciones, desde el primer día.</p>
        </div>

        <div className="grid lg:grid-cols-[1fr_1.15fr] rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          {/* precio */}
          <div className="p-8 sm:p-10">
            <p className="text-sm font-medium text-cyan-400">Plan único</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-5xl sm:text-6xl font-bold tabular-nums text-white">$50</span>
              <span className="text-slate-400">USD / mes</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Por consultorio, con tu equipo y profesionales incluidos.
            </p>
            <Link
              to="/login"
              className="group mt-7 inline-flex w-full items-center justify-center gap-2 h-12 px-7 rounded-xl bg-cyan-400 text-[#06121f] text-base font-semibold hover:bg-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070d18]"
            >
              Empezar
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <p className="mt-3 text-center text-xs text-slate-500">Multi-tenant · datos aislados por consultorio</p>
          </div>
          {/* incluye */}
          <div className="p-8 sm:p-10 border-t lg:border-t-0 lg:border-l border-white/10 bg-white/[0.015]">
            <p className="text-sm font-medium text-white">Todo lo que incluye</p>
            <ul className="mt-5 grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm text-slate-300">
              {INCLUYE.map((x) => (
                <li key={x} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" aria-hidden="true" />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 sm:px-8 py-24 text-center">
        <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white text-balance">
          Empezá a ordenar tu consultorio hoy
        </h2>
        <p className="mx-auto mt-4 max-w-md text-slate-400">
          Ingresá con tu cuenta y tené agenda, caja y reportes en un solo lugar.
        </p>
        <div className="mt-8">
          <Link
            to="/login"
            className="group inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl bg-cyan-400 text-[#06121f] text-base font-semibold hover:bg-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070d18]"
          >
            Iniciar sesión
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
        <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-slate-500">
          <Check className="h-3.5 w-3.5 text-cyan-400" /> Multi-tenant · datos aislados por consultorio
        </p>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────── */}
      <footer className="border-t border-white/5 bg-[#060a12]">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-2.5">
            <img src="/brand/isotipo.png" alt="" className="h-7 w-7" />
            <div className="leading-tight">
              <p className="text-sm font-bold text-white">Consul<span className="text-cyan-400">Tech</span></p>
              <p className="text-[11px] text-slate-500">Software para consultorios</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-xs text-slate-500">© {new Date().getFullYear()} Consultech</p>
            <a
              href="https://toptech.com.bo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <span>by</span>
              <span className="grid place-items-center rounded bg-white px-2 py-1">
                <img src="/brand/toptech.png" alt="Toptech" className="h-4 w-auto" />
              </span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
