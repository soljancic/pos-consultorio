import { test, expect } from '@playwright/test'

// Manual de ayuda in-app: carga, cambia de rol y muestra el tema.

const API = 'http://localhost:3000/api/v1'
const ts = Date.now().toString().slice(-6)
const EMAIL = `ayuda${ts}@test.com`
const PASS = 'Password123!'

test('/ayuda carga, cambia de rol y muestra el tema', async ({ page, request }) => {
  await request.post(`${API}/auth/register`, {
    data: { consultorioNombre: `Ayuda ${ts}`, adminNombre: 'Admin', email: EMAIL, password: PASS },
  })
  const login = await request.post(`${API}/auth/login`, { data: { email: EMAIL, password: PASS } })
  const data = await login.json()
  await page.addInitScript((p) => {
    localStorage.setItem('pos-auth', JSON.stringify({
      state: { accessToken: p.accessToken, refreshToken: p.refreshToken ?? p.accessToken, user: p.user },
      version: 0,
    }))
  }, { accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user })

  await page.goto('/ayuda')
  await expect(page.getByRole('heading', { name: 'Ayuda', level: 1 })).toBeVisible()
  // El admin arranca en su seccion
  await expect(page.getByRole('tab', { name: 'Administrador' })).toHaveAttribute('aria-selected', 'true')

  // Cambiar a Secretaria muestra su primer tema
  await page.getByRole('tab', { name: 'Secretaria' }).click()
  await expect(page.getByRole('heading', { name: 'Agendar una cita', level: 2 })).toBeVisible()
  await expect(page.getByText(/Reservás un turno para un paciente/)).toBeVisible()

  // Deep-link: /ayuda#<tema> abre ese tema directo (carga fresca)
  await page.goto('/agenda')
  await page.goto('/ayuda#deudores-whatsapp')
  await expect(page.getByRole('heading', { name: 'Deudores y recordatorios por WhatsApp', level: 2 })).toBeVisible()
})
