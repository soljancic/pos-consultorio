import { Link } from 'react-router-dom'
import {
  CalendarCheck, Wallet, Users, BarChart3, Globe, MessageCircle,
  ShieldCheck, ArrowRight, Clock, Sparkles, Check,
} from 'lucide-react'

// Landing publica de Consultech (raiz del dominio). Estatica, sin API.
// Estetica "clinical tech": superficie oscura luminosa con acentos cian/azul de
// la marca (isotipo), glassmorphism y movimiento sutil. Es una pieza de
// marketing independiente del tema de la app (siempre oscura, a proposito).
// UI pasada por frontend-design + ui-ux-pro-max.

const FEATURES = [
  {
    icon: CalendarCheck,
    titulo: 'Agenda + reservas online',
    texto: 'Vista día, semana y mes. Tus pacientes reservan solos desde un enlace propio, estilo Calendly, con disponibilidad real.',
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
    texto: 'Ingresos por forma de pago, gastos, resultado neto y comisiones por profesional. Exportá a Excel.',
  },
]

const PASOS = [
  { n: '01', titulo: 'Reservá', texto: 'El paciente elige día y hora online, o lo agenda la secretaria en segundos.' },
  { n: '02', titulo: 'Atendé', texto: 'Estados de cita en vivo, historia clínica y recetas en PDF con membrete.' },
  { n: '03', titulo: 'Cobrá', texto: 'Cobro por cita, caja del día por forma de pago y cierre con arqueo ciego.' },
]

const CAPACIDADES = ['Agenda', 'Reservas online', 'Caja', 'Deudores', 'WhatsApp', 'Recetas', 'Reportes', 'Multi-consultorio']

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-[#060c17] text-slate-200 overflow-x-hidden antialiased selection:bg-cyan-400/30">
      <style>{`
        @keyframes ct-rise { from { opacity:0; transform:translateY(18px) } to { opacity:1; transform:none } }
        @keyframes ct-float { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-14px) } }
        @keyframes ct-glow { 0%,100% { opacity:.45 } 50% { opacity:.85 } }
        @keyframes ct-ping { 0% { transform:scale(1); opacity:.7 } 80%,100% { transform:scale(2.4); opacity:0 } }
        .ct-rise { opacity:0; animation:ct-rise .7s cubic-bezier(.22,1,.36,1) forwards }
        .ct-float { animation:ct-float 7s ease-in-out infinite }
        .ct-glow { animation:ct-glow 6s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) {
          .ct-rise,.ct-float,.ct-glow { animation:none; opacity:1 }
        }
      `}</style>

      {/* ── NAV ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#060c17]/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/brand/isotipo.png" alt="" className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight text-white">
              Consul<span className="text-cyan-400">Tech</span>
            </span>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-white/5 border border-white/10 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
          >
            Iniciar sesión
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative">
        {/* Atmosfera: auroras + grilla con mascara radial */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="ct-glow absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[820px] rounded-full bg-cyan-500/20 blur-[120px]" />
          <div className="ct-glow absolute top-10 -left-40 h-[380px] w-[380px] rounded-full bg-blue-600/20 blur-[110px]" style={{ animationDelay: '1.5s' }} />
          <div className="ct-glow absolute top-24 -right-32 h-[360px] w-[360px] rounded-full bg-teal-400/15 blur-[110px]" style={{ animationDelay: '3s' }} />
          <div
            className="absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(80%_60%_at_50%_0%,black,transparent)]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.045) 1px, transparent 1px)',
              backgroundSize: '46px 46px',
            }}
          />
        </div>

        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 pb-20 sm:pt-24 lg:pt-28 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-8 items-center">
          {/* Columna texto */}
          <div className="text-center lg:text-left">
            <span className="ct-rise inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300" style={{ animationDelay: '0ms' }}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400" style={{ animation: 'ct-ping 2.2s cubic-bezier(0,0,.2,1) infinite' }} />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
              </span>
              Sistema de gestión para consultorios
            </span>

            <h1 className="ct-rise mt-6 text-4xl sm:text-6xl font-bold leading-[1.05] tracking-tight text-white text-balance" style={{ animationDelay: '80ms' }}>
              Tu consultorio,
              <span className="block bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                bajo control total
              </span>
            </h1>

            <p className="ct-rise mx-auto lg:mx-0 mt-5 max-w-xl text-base sm:text-lg text-slate-400 text-pretty" style={{ animationDelay: '160ms' }}>
              Agenda, reservas online, caja con arqueo ciego, deudores y reportes
              en una sola plataforma. Para médicos, odontólogos, psicólogos y
              estéticas médicas.
            </p>

            <div className="ct-rise mt-9 flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3" style={{ animationDelay: '240ms' }}>
              <Link
                to="/login"
                className="group inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-cyan-400 text-[#06121f] text-base font-semibold w-full sm:w-auto shadow-[0_0_40px_-8px_rgba(34,211,238,.7)] hover:bg-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060c17]"
              >
                Iniciar sesión
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <a
                href="#funciones"
                className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl border border-white/15 text-base font-medium text-white w-full sm:w-auto hover:bg-white/5 transition-colors"
              >
                Ver funciones
              </a>
            </div>

            <div className="ct-rise mt-9 flex flex-wrap items-center lg:justify-start justify-center gap-x-6 gap-y-2" style={{ animationDelay: '320ms' }}>
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

          {/* Columna preview del producto (glass, flotando) */}
          <div className="ct-rise relative" style={{ animationDelay: '200ms' }}>
            <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-cyan-500/20 to-blue-600/10 blur-2xl" />
            <div className="ct-float rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
              {/* barra de ventana */}
              <div className="flex items-center gap-2 px-4 h-10 border-b border-white/5 bg-white/[0.02]">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-2 text-[11px] text-slate-400">Agenda · Hoy</span>
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-cyan-300">
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
                  <div key={r.h} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5">
                    <span className="text-xs font-semibold tabular-nums text-slate-300 w-11">{r.h}</span>
                    <span className="text-sm text-white truncate flex-1">{r.n}</span>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${r.t}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${r.c}`} />
                      {r.e}
                    </span>
                  </div>
                ))}
              </div>
              {/* footer caja */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 bg-gradient-to-r from-cyan-500/10 to-transparent">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                  <Wallet className="h-3.5 w-3.5 text-cyan-400" /> Caja del día
                </span>
                <span className="text-sm font-bold tabular-nums text-white">$ 4.250</span>
              </div>
            </div>

            {/* chip flotante */}
            <div className="ct-float absolute -bottom-5 -left-4 sm:-left-6 hidden sm:flex items-center gap-2 rounded-xl border border-white/10 bg-[#0a1424]/90 backdrop-blur px-3 py-2 shadow-xl" style={{ animationDelay: '1s' }}>
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-400/15 text-cyan-300">
                <CalendarCheck className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <p className="text-[11px] text-slate-400">Reserva online</p>
                <p className="text-xs font-semibold text-white">Confirmada ✓</p>
              </div>
            </div>
          </div>
        </div>

        {/* tira de capacidades */}
        <div className="border-y border-white/5 bg-white/[0.015]">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {CAPACIDADES.map((c, i) => (
              <span key={c} className="inline-flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-500">
                {i > 0 && <span className="h-1 w-1 rounded-full bg-slate-600" />}
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FUNCIONES ───────────────────────────────────────── */}
      <section id="funciones" className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-28 scroll-mt-16">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            <Sparkles className="h-3.5 w-3.5" /> Todo en un lugar
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white text-balance">
            Cuatro módulos que trabajan juntos
          </h2>
          <p className="mt-3 text-slate-400">Sin planillas sueltas, sin pasar datos de un lado a otro.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {FEATURES.map(({ icon: Icon, titulo, texto }) => (
            <article
              key={titulo}
              className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-7 overflow-hidden transition-colors hover:border-cyan-400/30"
            >
              <div aria-hidden="true" className="pointer-events-none absolute -top-20 -right-16 h-40 w-40 rounded-full bg-cyan-500/0 blur-3xl transition-colors duration-300 group-hover:bg-cyan-500/15" />
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-blue-500/10 border border-white/10 text-cyan-300">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-white">{titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{texto}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── COMO FUNCIONA ───────────────────────────────────── */}
      <section className="relative border-y border-white/5 bg-white/[0.015]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              <Clock className="h-3.5 w-3.5" /> Tu día, simple
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white">De la reserva al cobro</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            {PASOS.map(({ n, titulo, texto }) => (
              <div key={n} className="relative rounded-2xl border border-white/10 bg-[#0a1424]/40 p-6">
                <span className="text-4xl font-bold bg-gradient-to-br from-cyan-300 to-blue-500 bg-clip-text text-transparent tabular-nums">{n}</span>
                <h3 className="mt-3 text-lg font-semibold text-white">{titulo}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="ct-glow absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[300px] w-[700px] rounded-full bg-cyan-500/20 blur-[120px]" />
        </div>
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-24 text-center">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white text-balance">
            Empezá a ordenar tu consultorio hoy
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Ingresá con tu cuenta y tené agenda, caja y reportes en un solo lugar.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/login"
              className="group inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl bg-cyan-400 text-[#06121f] text-base font-semibold w-full sm:w-auto shadow-[0_0_50px_-10px_rgba(34,211,238,.8)] hover:bg-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060c17]"
            >
              Iniciar sesión
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Check className="h-3.5 w-3.5 text-cyan-400" /> Multi-tenant · datos aislados por consultorio
          </p>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────── */}
      <footer className="border-t border-white/5 bg-[#050a13]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-5">
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
