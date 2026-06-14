import { test, expect } from '@playwright/test'

// E2-M2: cierre de caja con arqueo ciego + revision del admin.

const API = 'http://localhost:3000/api/v1'
const ts = Date.now().toString().slice(-6)
const EMAIL = `arqueo${ts}@test.com`
const PASS = 'Password123!'

test.beforeAll(async ({ request }) => {
  await request.post(`${API}/auth/register`, {
    data: { consultorioNombre: `Arqueo ${ts}`, adminNombre: 'Admin', email: EMAIL, password: PASS },
  })
  const login = await request.post(`${API}/auth/login`, { data: { email: EMAIL, password: PASS } })
  const { accessToken } = await login.json()
  const auth = { Authorization: `Bearer ${accessToken}` }
  await request.post(`${API}/caja/abrir`, { headers: auth, data: { montoInicial: 0 } }) // E2-M9
  const srv = await (
    await request.post(`${API}/servicios`, {
      headers: auth,
      data: { nombre: 'Consulta', duracionMin: 30, precioBase: 2000 },
    })
  ).json()
  const doc = await (
    await request.post(`${API}/doctores`, { headers: auth, data: { nombre: 'Dr. Arqueo' } })
  ).json()
  const pac = await (
    await request.post(`${API}/pacientes`, {
      headers: auth,
      data: { nombre: 'Ana', apellido: 'Arqueada' },
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

test('cierre ciego con faltante queda pendiente y el admin lo revisa', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /^ingresar$/i }).click()
  await page.waitForURL(/\/agenda$/)

  await page.goto('/caja')
  await page.getByRole('button', { name: 'Cerrar caja' }).click()

  // El modal es ciego: pide el contado y no muestra el esperado
  await expect(page.getByText(/arqueo ciego/i)).toBeVisible()
  await page.getByLabel(/efectivo contado/i).fill('1500')
  // el boton del modal comparte nombre con el del header: usar el del formulario
  await page.locator('form').getByRole('button', { name: 'Cerrar caja' }).click()

  // Resultado: diferencia visible y aviso de revisión pendiente
  await expect(page.getByText('Diferencia', { exact: true })).toBeVisible()
  await expect(page.getByText(/pendiente de revisión/i)).toBeVisible()
  await page.getByRole('button', { name: 'Entendido' }).click()

  // Historial: badge pendiente + revisar como ADMIN
  await page.getByRole('tab', { name: 'historial' }).click()
  await expect(page.getByText('Pendiente revisión')).toBeVisible()
  await page.getByRole('button', { name: /revisar cierre del/i }).click()
  await page.getByLabel(/nota de revisión/i).fill('faltante asumido por el admin')
  await page.getByRole('button', { name: 'Aprobar revision' }).click()
  await expect(page.getByText('Revisada')).toBeVisible()
})
