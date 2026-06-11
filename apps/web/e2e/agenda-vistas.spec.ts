import { test, expect } from '@playwright/test'

// Vistas de agenda: Lista (default), Día (columnas por doctor), Semana.

const API = 'http://localhost:3000/api/v1'
const ts = Date.now().toString().slice(-6)
const EMAIL = `vista${ts}@test.com`
const PASS = 'Password123!'

test.beforeAll(async ({ request }) => {
  await request.post(`${API}/auth/register`, {
    data: { consultorioNombre: `Vistas ${ts}`, adminNombre: 'Admin', email: EMAIL, password: PASS },
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
    await request.post(`${API}/doctores`, { headers: auth, data: { nombre: 'Dr. Grilla' } })
  ).json()
  const pac = await (
    await request.post(`${API}/pacientes`, {
      headers: auth,
      data: { nombre: 'Gema', apellido: 'Grid' },
    })
  ).json()
  const hoy = new Date()
  hoy.setHours(10, 0, 0, 0)
  await request.post(`${API}/citas`, {
    headers: auth,
    data: { pacienteId: pac.id, doctorId: doc.id, servicioId: srv.id, fechaHora: hoy.toISOString() },
  })
})

test('vista Día muestra columnas por doctor y la cita en la grilla', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /ingresar/i }).click()
  await page.waitForURL(/\/agenda$/)

  // Cambiar a vista Día: columna del doctor + cita posicionada
  await page.getByRole('button', { name: 'Día' }).click()
  // .last(): el nombre tambien aparece como opcion del filtro de doctores
  await expect(page.getByText('Dr. Grilla').last()).toBeVisible()
  await expect(page.getByText(/Grid, Gema/)).toBeVisible()

  // Click en la cita abre el detalle con acciones
  await page.getByText(/Grid, Gema/).click()
  await expect(page.getByRole('button', { name: /confirmada/i })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

  // Vista Semana: encabezados de dias y la cita compacta
  await page.getByRole('button', { name: 'Semana' }).click()
  await expect(page.getByText(/Grid/).first()).toBeVisible()

  // Volver a Lista para no alterar el resto de la suite
  await page.getByRole('button', { name: 'Lista' }).click()
  await expect(page.getByText(/Grid, Gema/)).toBeVisible()
})
