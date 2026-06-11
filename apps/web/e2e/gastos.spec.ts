import { test, expect } from '@playwright/test'

// E2-M8: alta de gasto desde la UI + KPI en dashboard.

const API = 'http://localhost:3000/api/v1'
const ts = Date.now().toString().slice(-6)
const EMAIL = `gastos${ts}@test.com`
const PASS = 'Password123!'

test.beforeAll(async ({ request }) => {
  await request.post(`${API}/auth/register`, {
    data: { consultorioNombre: `Gastos ${ts}`, adminNombre: 'Admin', email: EMAIL, password: PASS },
  })
  const login = await request.post(`${API}/auth/login`, { data: { email: EMAIL, password: PASS } })
  const { accessToken } = await login.json()
  // E2-M9: sin turno abierto no se registran gastos
  await request.post(`${API}/caja/abrir`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { montoInicial: 0 },
  })
})

test('registrar un gasto lo muestra en la tabla y en el KPI del dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /^ingresar$/i }).click()
  await page.waitForURL(/\/agenda$/)

  await page.goto('/gastos')
  await page.getByRole('button', { name: 'Nuevo gasto' }).click()

  await page.getByLabel('Monto *').fill('1234')
  await page.getByLabel('Categoría *').selectOption('INSUMOS')
  await page.getByLabel('Descripción *').fill('material descartable')
  await page.getByRole('button', { name: 'Registrar gasto' }).click()

  // fila visible con categoria y monto (scope a la tabla: el filtro tambien dice Insumos)
  await expect(page.getByText('material descartable')).toBeVisible()
  await expect(page.getByRole('table').getByText('Insumos')).toBeVisible()

  // KPI en dashboard: gastos del mes y resultado neto
  await page.goto('/')
  await expect(page.getByText('Gastos del mes')).toBeVisible()
  await expect(page.getByText('Resultado neto')).toBeVisible()
  await expect(page.getByText(/1\.?234/).first()).toBeVisible()
})
