// Tema light/dark persistido. Se aplica como clase en <html> (tailwind darkMode: class).
const KEY = 'pos-theme'

export type Tema = 'light' | 'dark'

export function temaActual(): Tema {
  return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
}

export function aplicarTema(tema: Tema) {
  document.documentElement.classList.toggle('dark', tema === 'dark')
  localStorage.setItem(KEY, tema)
}

// Llamar una vez al boot (main.tsx) antes del primer render
export function iniciarTema() {
  document.documentElement.classList.toggle('dark', temaActual() === 'dark')
}
