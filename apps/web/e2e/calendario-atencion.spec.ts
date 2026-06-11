import { test, expect } from '@playwright/test'
import { format } from 'date-fns'

// E2.5a: crear un horario desde el scheduler semanal y verlo en la grilla.

const API = 'http://localhost:3000/api/v1'
const ts = Date.now().toString().slice(-6)
const EMAIL = `cal${ts}@test.com`
const PASS = 'Password123!'

test.beforeAll(async ({ request }) => {
  await request.post(`${API}/auth/register`, {
    data: { consultorioNombre: `Cal ${ts}`, adminNombre: 'Admin', email: EMAIL, password: PASS },
  })
  const login = await request.post(`${API}/auth/login`, { data: { email: EMAIL, password: PASS } })
  const { accessToken } = await login.json()
  await request.post(`${API}/doctores`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { nombre: 'Dr. Semana' },
  })
})

test('crear horario con preset y verlo como bloque en la grilla', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /^ingresar$/i }).click()
  await page.waitForURL(/\/agenda$/)

  await page.goto('/calendario-atencion')
  await expect(page.getByText('Dr. Semana')).toBeVisible()

  const hoy = format(new Date(), 'yyyy-MM-dd')
  await page.getByRole('button', { name: `Agregar horario a Dr. Semana el ${hoy}` }).click()

  // preset + crear
  await page.getByRole('button', { name: '09:00 - 17:00' }).click()
  await page.getByRole('button', { name: 'Crear', exact: true }).click()

  // el bloque aparece en la celda del dia
  await expect(page.getByRole('button', { name: /09:00–17:00/ })).toBeVisible()
})
