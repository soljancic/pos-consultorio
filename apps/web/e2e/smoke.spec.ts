import { test, expect } from '@playwright/test'

// Smoke E2E de Etapa 1: recorre el flujo completo del consultorio en browser
// real contra la API real. Requiere: API en :3000 (con PostgreSQL) y
// vite dev en :5173.

const API = 'http://localhost:3000/api/v1'
const ts = Date.now().toString().slice(-6)
const EMAIL = `smoke${ts}@test.com`
const PASS = 'Password123!'

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  // Consultorio limpio con catalogo minimo via API
  await request.post(`${API}/auth/register`, {
    data: {
      consultorioNombre: `Smoke ${ts}`,
      adminNombre: 'Admin Smoke',
      email: EMAIL,
      password: PASS,
    },
  })
  const login = await request.post(`${API}/auth/login`, {
    data: { email: EMAIL, password: PASS },
  })
  const { accessToken } = await login.json()
  const auth = { Authorization: `Bearer ${accessToken}` }
  await request.post(`${API}/servicios`, {
    headers: auth,
    data: { nombre: 'Consulta', duracionMin: 30, precioBase: 5000 },
  })
  await request.post(`${API}/doctores`, {
    headers: auth,
    data: { nombre: 'Dr. Smoke' },
  })
})

async function login(page: any) {
  await page.goto('/login')
  await page.getByPlaceholder(/email|correo/i).or(page.locator('input[type="email"]')).first().fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /^ingresar$/i }).click()
  await page.waitForURL(/\/(agenda)?$/, { timeout: 10_000 })
}

test('login y dashboard con metricas', async ({ page }) => {
  await login(page)
  await page.goto('/')
  await expect(page.getByText('Citas hoy')).toBeVisible()
  await expect(page.getByText('Caja del dia')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Deudas pendientes' })).toBeVisible()
})

test('crear paciente desde la UI navega a su ficha', async ({ page }) => {
  await login(page)
  await page.goto('/pacientes')
  await page.getByRole('button', { name: /nuevo paciente/i }).click()
  const modal = page.locator('.fixed.inset-0')
  await modal.getByText('Nombre *').locator('..').locator('input').fill('Elena')
  await modal.getByText('Apellido *').locator('..').locator('input').fill('Smoke')
  await modal.getByText('WhatsApp').locator('..').locator('input').fill('+5491155557777')
  await page.getByRole('button', { name: /crear paciente/i }).click()
  await page.waitForURL(/\/pacientes\/.+/, { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: /Smoke, Elena/ })).toBeVisible()
  await expect(page.getByText('Sin citas registradas')).toBeVisible()
})

test('agenda: crear cita, recorrer estados, registrar atencion y cobrar', async ({ page }) => {
  await login(page)
  await page.goto('/agenda')

  // Nueva cita para Elena a una hora segura del dia
  await page.getByRole('button', { name: /nueva cita/i }).click()
  const modal = page.locator('.fixed.inset-0')
  await modal.locator('input[placeholder*="aciente"], input[placeholder*="uscar"]').first().fill('Elena')
  await page.getByText(/Smoke, Elena|Elena Smoke/).first().click()
  // doctor y servicio: selects del modal (el primero con opciones)
  const selects = modal.locator('select')
  const count = await selects.count()
  for (let i = 0; i < count; i++) {
    const opts = selects.nth(i).locator('option')
    if ((await opts.count()) > 1) await selects.nth(i).selectOption({ index: 1 })
  }
  const horaInput = modal.locator('input[type="time"]')
  if (await horaInput.count()) await horaInput.fill('10:00')
  await modal.getByRole('button', { name: /crear|guardar|agendar/i }).last().click()
  await expect(page.getByText(/Smoke, Elena/)).toBeVisible({ timeout: 10_000 })

  // Avanzar estados: Confirmada -> Llego -> En atencion
  for (const estado of ['Confirmada', 'Llego', 'En atencion']) {
    await page.getByRole('button', { name: new RegExp(estado, 'i') }).first().click()
    await page.waitForTimeout(400)
  }

  // Registrar atencion (estetoscopio) y marcar Atendida en un click
  await page.getByTitle('Atencion').first().click()
  const atModal = page.locator('.fixed.inset-0')
  await atModal.getByText('Diagnostico').locator('..').locator('input').fill('Todo en orden')
  await atModal.getByText('Tratamiento indicado').locator('..').locator('input').fill('Control en 30 dias')
  await atModal.getByRole('button', { name: /guardar y marcar atendida/i }).click()
  await expect(page.getByText('Atendida').first()).toBeVisible({ timeout: 10_000 })

  // Cobro parcial -> Con deuda
  await page.getByTitle('Cobrar').first().click()
  const cobroModal = page.locator('.fixed.inset-0')
  await cobroModal.locator('input[type="number"]').fill('2000')
  await cobroModal.getByRole('button', { name: /registrar pago/i }).click()
  await expect(page.getByText('Con deuda').first()).toBeVisible({ timeout: 10_000 })
})

test('deudores lista a Elena y la caja registra el cobro', async ({ page }) => {
  await login(page)
  await page.goto('/deudores')
  await expect(page.getByText(/Smoke, Elena/)).toBeVisible()
  await expect(page.getByText(/3\.?000/).first()).toBeVisible()

  await page.goto('/caja')
  await expect(page.getByText(/2\.?000/).first()).toBeVisible()
  await expect(page.getByText('Nuevas deudas de hoy')).toBeVisible()
  // Tab historial (los tabs de Caja exponen role="tab" desde el pase de UI)
  await page.getByRole('tab', { name: 'historial' }).click()
  await expect(page.getByText('Total del periodo')).toBeVisible()
})

test('catalogo y configuracion (ADMIN ve CRUD; ficha muestra atencion)', async ({ page }) => {
  await login(page)
  await page.goto('/catalogo')
  await expect(page.getByRole('button', { name: /nuevo servicio/i })).toBeVisible()
  await expect(page.getByText('Dr. Smoke')).toBeVisible()

  await page.goto('/configuracion')
  // exact: el aria-label del boton editar ("Editar usuario Admin Smoke") tambien matchea
  await expect(page.getByRole('cell', { name: 'Admin Smoke', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'consultorio' }).click()
  await expect(page.getByText('Nombre del consultorio')).toBeVisible()

  // Ficha de Elena: la atencion registrada es legible (criterio MVP #3)
  await page.goto('/pacientes')
  await page.getByText(/Smoke, Elena/).click()
  await page.waitForURL(/\/pacientes\/.+/)
  await page.getByTitle('Ver atencion').first().click()
  await expect(page.getByText('Todo en orden')).toBeVisible()
  await expect(page.getByText('Control en 30 dias')).toBeVisible()
})
