import { test, expect } from '@playwright/test'

// Verifica que la UI respeta los roles (la seguridad real es el backend,
// ya cubierta por scripts/gate-m3.ps1 y gate-negativos.ps1).

const API = 'http://localhost:3000/api/v1'
const ts = Date.now().toString().slice(-6)
const ADMIN_EMAIL = `roladmin${ts}@test.com`
const SEC_EMAIL = `rolsec${ts}@test.com`
const PASS = 'Password123!'

test.beforeAll(async ({ request }) => {
  await request.post(`${API}/auth/register`, {
    data: { consultorioNombre: `Roles ${ts}`, adminNombre: 'Admin Rol', email: ADMIN_EMAIL, password: PASS },
  })
  const login = await request.post(`${API}/auth/login`, { data: { email: ADMIN_EMAIL, password: PASS } })
  const { accessToken } = await login.json()
  await request.post(`${API}/usuarios`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { nombre: 'Sec Rol', email: SEC_EMAIL, password: PASS, rol: 'SECRETARIA' },
  })
})

async function loginAs(page: any, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /ingresar|entrar|login|iniciar/i }).click()
  await page.waitForURL(/\/agenda$/, { timeout: 10_000 })
}

test('SECRETARIA no ve Configuracion en el nav y la ruta la expulsa', async ({ page }) => {
  await loginAs(page, SEC_EMAIL)
  await expect(page.getByRole('link', { name: 'Configuracion' })).toHaveCount(0)
  await page.goto('/configuracion')
  await page.waitForURL(/\/agenda$/, { timeout: 10_000 })
})

test('SECRETARIA ve el catalogo en solo lectura', async ({ page }) => {
  await loginAs(page, SEC_EMAIL)
  await page.goto('/catalogo')
  await expect(page.getByRole('heading', { name: 'Servicios' })).toBeVisible()
  await expect(page.getByRole('button', { name: /nuevo servicio/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /nuevo doctor/i })).toHaveCount(0)
})

test('ADMIN si ve Configuracion y los botones CRUD', async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL)
  await expect(page.getByRole('link', { name: 'Configuracion' })).toBeVisible()
  await page.goto('/catalogo')
  await expect(page.getByRole('button', { name: /nuevo servicio/i })).toBeVisible()
})
