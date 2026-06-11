import { test, expect } from '@playwright/test'

// E2-M7: menu "..." de la cita — cancelar (con motivo) y reprogramar.

const API = 'http://localhost:3000/api/v1'
const ts = Date.now().toString().slice(-6)
const EMAIL = `e2m7${ts}@test.com`
const PASS = 'Password123!'

let pacienteCancelarId: number
let pacienteReprogId: number

test.beforeAll(async ({ request }) => {
  await request.post(`${API}/auth/register`, {
    data: { consultorioNombre: `E2M7 ${ts}`, adminNombre: 'Admin', email: EMAIL, password: PASS },
  })
  const login = await request.post(`${API}/auth/login`, { data: { email: EMAIL, password: PASS } })
  const { accessToken } = await login.json()
  const auth = { Authorization: `Bearer ${accessToken}` }
  const srv = await (
    await request.post(`${API}/servicios`, {
      headers: auth,
      data: { nombre: 'Consulta', duracionMin: 30, precioBase: 1000 },
    })
  ).json()
  const doc = await (
    await request.post(`${API}/doctores`, { headers: auth, data: { nombre: 'Dr. Accion' } })
  ).json()

  const pacCancelar = await (
    await request.post(`${API}/pacientes`, {
      headers: auth,
      data: { nombre: 'Carla', apellido: 'Cancelable' },
    })
  ).json()
  pacienteCancelarId = pacCancelar.id
  const pacReprog = await (
    await request.post(`${API}/pacientes`, {
      headers: auth,
      data: { nombre: 'Rita', apellido: 'Reprogramable' },
    })
  ).json()
  pacienteReprogId = pacReprog.id

  const hoy9 = new Date()
  hoy9.setHours(9, 0, 0, 0)
  await request.post(`${API}/citas`, {
    headers: auth,
    data: { pacienteId: pacienteCancelarId, doctorId: doc.id, servicioId: srv.id, fechaHora: hoy9.toISOString() },
  })
  const hoy10 = new Date()
  hoy10.setHours(10, 0, 0, 0)
  await request.post(`${API}/citas`, {
    headers: auth,
    data: { pacienteId: pacienteReprogId, doctorId: doc.id, servicioId: srv.id, fechaHora: hoy10.toISOString() },
  })
})

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /^ingresar$/i }).click()
  await page.waitForURL(/\/agenda$/)
}

// Card raiz de la cita en la vista lista (CitaCard tiene bg-card en el root)
function cardDe(page: import('@playwright/test').Page, nombre: string) {
  return page.locator('div.bg-card').filter({ hasText: nombre }).first()
}

test('cancelar una cita desde el menu deja el badge Cancelada', async ({ page }) => {
  await login(page)

  const card = cardDe(page, 'Cancelable, Carla')
  await card.getByRole('button', { name: 'Más acciones' }).click()
  await page.getByRole('menuitem', { name: 'Cancelar cita' }).click()

  await page.getByLabel(/motivo/i).fill('aviso que no viene')
  await page.getByRole('button', { name: 'Cancelar cita' }).click()

  // la card de Carla ahora muestra el estado Cancelada
  await expect(cardDe(page, 'Cancelable, Carla').getByText('Cancelada')).toBeVisible()
})

test('reprogramar cambia la hora y vuelve a Pendiente', async ({ page }) => {
  await login(page)

  const card = cardDe(page, 'Reprogramable, Rita')
  await card.getByRole('button', { name: 'Más acciones' }).click()
  await page.getByRole('menuitem', { name: 'Reprogramar' }).click()

  await page.getByLabel('Nueva hora').fill('15:30')
  await page.getByRole('button', { name: 'Reprogramar', exact: true }).click()

  // hora nueva visible en la card y estado Pendiente
  await expect(cardDe(page, 'Reprogramable, Rita').getByText('15:30')).toBeVisible()
  await expect(cardDe(page, 'Reprogramable, Rita').getByText('Pendiente')).toBeVisible()
})
