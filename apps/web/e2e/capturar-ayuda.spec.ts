import { test } from '@playwright/test'

// Generador de capturas del manual /ayuda. NO corre en la suite normal: solo
// con CAPTURAS=1 (`CAPTURAS=1 npx playwright test capturar-ayuda.spec.ts`).
// Siembra un consultorio con datos via API y fotografia los flujos clave a
// apps/web/public/ayuda/<id>.png. Regenerable cuando cambia la UI.

const API = 'http://localhost:3000/api/v1'
const DIR = 'public/ayuda'
test.use({ viewport: { width: 1280, height: 820 } })

test('generar capturas del manual', async ({ page, request }) => {
  test.skip(!process.env.CAPTURAS, 'Solo on-demand: CAPTURAS=1')

  const ts = Date.now().toString().slice(-6)
  const email = `cap${ts}@test.com`
  const pass = 'Password123!'
  await request.post(`${API}/auth/register`, {
    data: { consultorioNombre: 'Consultorio Demo', adminNombre: 'Admin Demo', email, password: pass },
  })
  const login = await request.post(`${API}/auth/login`, { data: { email, password: pass } })
  const data = await login.json()
  const auth = { Authorization: `Bearer ${data.accessToken}` }

  const hoy = new Date().toISOString().slice(0, 10)
  const srv = await (await request.post(`${API}/servicios`, { headers: auth, data: { nombre: 'Consulta general', duracionMin: 30, precioBase: 50 } })).json()
  const doc = await (await request.post(`${API}/doctores`, { headers: auth, data: { nombre: 'Dra. Ana Pérez', especialidad: 'Clínica' } })).json()
  await request.post(`${API}/disponibilidades`, { headers: auth, data: { doctorId: doc.id, fecha: hoy, horaInicio: '08:00', horaFin: '18:00' } })
  const pac = await (await request.post(`${API}/pacientes`, { headers: auth, data: { nombre: 'María', apellido: 'González' } })).json()

  // sesion en el navegador
  await page.addInitScript((p) => {
    localStorage.setItem('pos-auth', JSON.stringify({
      state: { accessToken: p.a, refreshToken: p.a, user: p.u }, version: 0,
    }))
  }, { a: data.accessToken, u: data.user })

  const modal = () => page.locator('.modal-pop')

  // 1) Abrir caja (modal) — con la caja todavia cerrada
  await page.goto('/caja')
  await page.getByRole('button', { name: /abrir caja/i }).first().click()
  await modal().waitFor()
  await modal().screenshot({ path: `${DIR}/abrir-turno.png` })
  await page.keyboard.press('Escape')

  // abrir caja por API + sembrar un deudor (cita atendida con cobro parcial)
  await request.post(`${API}/caja/abrir`, { headers: auth, data: { montoInicial: 100 } })
  const citaDeuda = await (await request.post(`${API}/citas`, { headers: auth, data: { pacienteId: pac.id, doctorId: doc.id, servicioId: srv.id, fechaHora: `${hoy}T09:00:00` } })).json()
  for (const e of ['CONFIRMADA', 'LLEGO', 'EN_ATENCION', 'ATENDIDA']) {
    await request.put(`${API}/citas/${citaDeuda.id}/estado`, { headers: auth, data: { estado: e } })
  }
  const cobroDeuda = await (await request.get(`${API}/cobros/cita/${citaDeuda.id}`, { headers: auth })).json()
  await request.post(`${API}/cobros/${cobroDeuda.id}/pagos`, { headers: auth, data: { monto: 20, formaPago: 'EFECTIVO' } })
  // una cita pendiente para la agenda
  await request.post(`${API}/citas`, { headers: auth, data: { pacienteId: pac.id, doctorId: doc.id, servicioId: srv.id, fechaHora: `${hoy}T11:00:00` } })

  // 2) Caja del dia (pagina)
  await page.goto('/caja')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${DIR}/caja-turno.png` })
  // 3) Cerrar caja (modal)
  await page.getByRole('button', { name: /cerrar caja/i }).first().click()
  await modal().waitFor()
  await modal().screenshot({ path: `${DIR}/cerrar-arqueo.png` })
  await page.keyboard.press('Escape')

  // 4) Agenda vista Dia
  await page.goto('/agenda')
  await page.getByRole('button', { name: 'Día' }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${DIR}/mi-agenda.png` })
  // 5) Nueva cita (modal)
  await page.getByRole('button', { name: 'Nueva cita' }).click()
  await modal().waitFor()
  await modal().screenshot({ path: `${DIR}/agendar-cita.png` })
  await page.keyboard.press('Escape')

  // 6) Deudores
  await page.goto('/deudores')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${DIR}/deudores-whatsapp.png` })

  // 7) Catalogo: Nuevo doctor (modal con foto + precio por servicio)
  await page.goto('/catalogo')
  await page.getByRole('button', { name: /nuevo doctor/i }).click()
  await modal().waitFor()
  await modal().screenshot({ path: `${DIR}/catalogo-doctores.png` })
  await page.keyboard.press('Escape')

  // 8) Configuracion (pagina) + Nuevo usuario (modal)
  await page.goto('/configuracion')
  await page.getByRole('tab', { name: 'consultorio' }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${DIR}/configuracion.png` })
  await page.getByRole('tab', { name: 'usuarios' }).click()
  await page.getByRole('button', { name: /nuevo usuario/i }).click()
  await modal().waitFor()
  await modal().screenshot({ path: `${DIR}/usuarios.png` })
  await page.keyboard.press('Escape')

  // 9) Reportes
  await page.goto('/reportes')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DIR}/reportes.png` })
})
