// Bip corto de notificacion via Web Audio (sin asset: anda offline en la PWA).
// El AudioContext exige un gesto de usuario previo; se crea perezosamente.
const SONIDO_KEY = 'pos-notif-sonido'

let ctx: AudioContext | null = null

export function sonidoActivado(): boolean {
  return localStorage.getItem(SONIDO_KEY) !== 'off'
}

export function setSonidoActivado(on: boolean) {
  localStorage.setItem(SONIDO_KEY, on ? 'on' : 'off')
}

export function reproducirBip() {
  if (!sonidoActivado()) return
  try {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext
    if (!AC) return
    ctx = ctx ?? new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    const t = ctx.currentTime
    // ataque corto + release suave para evitar el click
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.15, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.2)
  } catch {
    // sin audio disponible: ignorar
  }
}
