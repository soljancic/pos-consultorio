import { test, expect } from '@playwright/test'

// Landing Consultech en la raiz: publica sin sesion, redirige al panel con sesion.

const API = 'http://localhost:3000/api/v1'
const ts = Date.now().toString().slice(-6)
const EMAIL = `landing${ts}@test.com`
const PASS = 'Password123!'

test('/ sin sesion muestra la landing y el CTA va a /login; /agenda protegida', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /Tu consultorio/i })).toBeVisible()

  // El CTA principal lleva al login
  await page.getByRole('link', { name: /Iniciar sesión/i }).first().click()
  await page.waitForURL(/\/login$/)

  // Una ruta del POS sigue protegida sin sesion
  await page.goto('/agenda')
  await page.waitForURL(/\/login$/)
})

test('/ con sesion redirige al panel (/inicio)', async ({ page, request }) => {
  await request.post(`${API}/auth/register`, {
    data: { consultorioNombre: `Land ${ts}`, adminNombre: 'Admin', email: EMAIL, password: PASS },
  })
  const login = await request.post(`${API}/auth/login`, { data: { email: EMAIL, password: PASS } })
  const data = await login.json()

  // Sembrar la sesion en el storage de zustand persist (key "pos-auth")
  await page.addInitScript((p) => {
    localStorage.setItem(
      'pos-auth',
      JSON.stringify({
        state: { accessToken: p.accessToken, refreshToken: p.refreshToken, user: p.user },
        version: 0,
      }),
    )
  }, { accessToken: data.accessToken, refreshToken: data.refreshToken ?? data.accessToken, user: data.user })

  await page.goto('/')
  await page.waitForURL(/\/inicio$/)
})
