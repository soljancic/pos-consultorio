import { test, expect } from '@playwright/test'

// Responsive movil (375px): sidebar como drawer con hamburguesa,
// tablas con scroll horizontal sin romper el layout.

const API = 'http://localhost:3000/api/v1'
const ts = Date.now().toString().slice(-6)
const EMAIL = `mob${ts}@test.com`
const PASS = 'Password123!'

test.use({ viewport: { width: 375, height: 667 } })

test.beforeAll(async ({ request }) => {
  await request.post(`${API}/auth/register`, {
    data: {
      consultorioNombre: `Mobile ${ts}`,
      adminNombre: 'Admin Mobile',
      email: EMAIL,
      password: PASS,
    },
  })
})

test('en movil el menu es un drawer con hamburguesa', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /ingresar/i }).click()
  await page.waitForURL(/\/agenda$/)

  // El drawer arranca cerrado: el link Pacientes no es visible
  await expect(page.getByRole('link', { name: 'Pacientes' })).not.toBeVisible()

  // Hamburguesa visible y abre el drawer
  await page.getByRole('button', { name: 'Abrir menu' }).click()
  await expect(page.getByRole('link', { name: 'Pacientes' })).toBeVisible()
  await expect(page.getByText('Mi cuenta')).toBeVisible()
  await expect(page.getByText('Modo oscuro')).toBeVisible()

  // Navegar cierra el drawer
  await page.getByRole('link', { name: 'Pacientes' }).click()
  await page.waitForURL(/\/pacientes$/)
  await expect(page.getByRole('link', { name: 'Deudores' })).not.toBeVisible()

  // Sin scroll horizontal en el body (la tabla scrollea en su contenedor)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
})
