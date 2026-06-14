import { test, expect } from '@playwright/test'

// E2-M1: anular un pago desde la caja crea la reversa visible y restaura todo.

const API = 'http://localhost:3000/api/v1'
const ts = Date.now().toString().slice(-6)
const EMAIL = `e2m1ui${ts}@test.com`
const PASS = 'Password123!'

test.beforeAll(async ({ request }) => {
  await request.post(`${API}/auth/register`, {
    data: { consultorioNombre: `E2M1UI ${ts}`, adminNombre: 'Admin', email: EMAIL, password: PASS },
  })
  const login = await request.post(`${API}/auth/login`, { data: { email: EMAIL, password: PASS } })
  const { accessToken } = await login.json()
  const auth = { Authorization: `Bearer ${accessToken}` }
  await request.post(`${API}/caja/abrir`, { headers: auth, data: { montoInicial: 0 } }) // E2-M9
  const srv = await (
    await request.post(`${API}/servicios`, {
      headers: auth,
      data: { nombre: 'Consulta', duracionMin: 30, precioBase: 5000 },
    })
  ).json()
  const doc = await (
    await request.post(`${API}/doctores`, { headers: auth, data: { nombre: 'Dr. Caja' } })
  ).json()
  const pac = await (
    await request.post(`${API}/pacientes`, {
      headers: auth,
      data: { nombre: 'Pia', apellido: 'Pagadora' },
    })
  ).json()
  const hoy9 = new Date()
  hoy9.setHours(9, 0, 0, 0)
  const cita = await (
    await request.post(`${API}/citas`, {
      headers: auth,
      data: { pacienteId: pac.id, doctorId: doc.id, servicioId: srv.id, fechaHora: hoy9.toISOString() },
    })
  ).json()
  for (const estado of ['CONFIRMADA', 'LLEGO', 'EN_ATENCION', 'ATENDIDA']) {
    await request.put(`${API}/citas/${cita.id}/estado`, { headers: auth, data: { estado } })
  }
  const cobro = await (await request.get(`${API}/cobros/cita/${cita.id}`, { headers: auth })).json()
  const tcs = (await (await request.get(`${API}/tipos-cuenta`, { headers: auth })).json()) as Array<{ id: number; esEfectivo: boolean }>
  const tcEfectivo = tcs.find((t) => t.esEfectivo)!.id
  await request.post(`${API}/cobros/${cobro.id}/pagos`, {
    headers: auth,
    data: { monto: 2000, tipoCuentaId: tcEfectivo },
  })
})

test('anular un pago desde la caja muestra la reversa y el original anulado', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /^ingresar$/i }).click()
  await page.waitForURL(/\/agenda$/)

  await page.goto('/caja')
  await expect(page.getByText('Pagadora, Pia').first()).toBeVisible()

  await page.getByRole('button', { name: /anular pago de/i }).click()
  await page.getByLabel(/motivo/i).fill('monto equivocado')
  await page.getByRole('button', { name: 'Anular pago', exact: true }).click()

  // fila de reversa con badge + original marcado anulado
  await expect(page.getByText('Reversa')).toBeVisible()
  await expect(page.getByText('Anulado')).toBeVisible()
  // el boton de anular ya no se ofrece (ni para la reversa ni el anulado)
  await expect(page.getByRole('button', { name: /anular pago de/i })).toHaveCount(0)
})
