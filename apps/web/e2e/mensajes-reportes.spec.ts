import { test, expect } from '@playwright/test'

// E3 item 41a (cola de mensajes manual asistida) + item 29/21 (reportes con
// comisiones): flujo UI completo sobre datos sembrados via API.

const API = 'http://localhost:3000/api/v1'
const ts = Date.now().toString().slice(-6)
const EMAIL = `msjrep${ts}@test.com`
const PASS = 'Password123!'

test.beforeAll(async ({ request }) => {
  await request.post(`${API}/auth/register`, {
    data: { consultorioNombre: `MsjRep ${ts}`, adminNombre: 'Admin', email: EMAIL, password: PASS },
  })
  const login = await request.post(`${API}/auth/login`, { data: { email: EMAIL, password: PASS } })
  const { accessToken } = await login.json()
  const h = { Authorization: `Bearer ${accessToken}` }

  await request.post(`${API}/caja/abrir`, { headers: h, data: { montoInicial: 0 } })
  const srv = await (await request.post(`${API}/servicios`, {
    headers: h, data: { nombre: 'Consulta', duracionMin: 30, precioBase: 1000 },
  })).json()
  const doc = await (await request.post(`${API}/doctores`, {
    headers: h, data: { nombre: 'Dr. Spec', comisionPct: 10 },
  })).json()
  const pac = await (await request.post(`${API}/pacientes`, {
    headers: h, data: { nombre: 'Paula', apellido: 'Spec', telefono: '+59173333333' },
  })).json()

  // Cita de hoy a las 18:00 + cobro pagado (alimenta reporte y comision)
  const hoy = new Date()
  const fh = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 18, 0, 0)
  const cita = await (await request.post(`${API}/citas`, {
    headers: h,
    data: { pacienteId: pac.id, doctorId: doc.id, servicioId: srv.id, fechaHora: fh.toISOString() },
  })).json()
  const fh2 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 8, 0, 0)
  const citaCobrada = await (await request.post(`${API}/citas`, {
    headers: h,
    data: { pacienteId: pac.id, doctorId: doc.id, servicioId: srv.id, fechaHora: fh2.toISOString() },
  })).json()
  for (const estado of ['CONFIRMADA', 'LLEGO', 'EN_ATENCION', 'ATENDIDA']) {
    await request.put(`${API}/citas/${citaCobrada.id}/estado`, { headers: h, data: { estado } })
  }
  const cobro = await (await request.get(`${API}/cobros/cita/${citaCobrada.id}`, { headers: h })).json()
  const tcs = (await (await request.get(`${API}/tipos-cuenta`, { headers: h })).json()) as Array<{ id: number; esEfectivo: boolean }>
  const tcEfectivo = tcs.find((t) => t.esEfectivo)!.id
  await request.post(`${API}/cobros/${cobro.id}/pagos`, {
    headers: h, data: { monto: 1000, tipoCuentaId: tcEfectivo },
  })
  void cita
})

test('la cola de mensajes encola el recordatorio y se marca enviado', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /^ingresar$/i }).click()
  await page.waitForURL(/\/agenda$/)

  await page.goto('/mensajes')
  await page.getByRole('button', { name: 'Generar cola' }).click()
  await expect(page.getByText('Spec, Paula').first()).toBeVisible()

  // Marcar enviado: desaparece de pendientes y aparece en resueltos
  await page.getByRole('button', { name: 'Marcar como enviado' }).first().click()
  await page.getByRole('tab', { name: 'resueltos' }).click()
  await expect(page.getByText(/Enviado por Admin/).first()).toBeVisible()
})

test('el reporte mensual muestra ingresos y la comisión del doctor', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /^ingresar$/i }).click()
  await page.waitForURL(/\/agenda$/)

  await page.goto('/reportes')
  await expect(page.getByText('Ingresos por forma de pago')).toBeVisible()
  await expect(page.getByRole('table').getByText('Dr. Spec')).toBeVisible()
  // Comision 10% de 1000 = 100 y fila de total
  await expect(page.getByText('Total comisiones a liquidar')).toBeVisible()
})
