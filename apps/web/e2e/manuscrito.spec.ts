import { test, expect, type Locator, type Page } from '@playwright/test'

// Notas manuscritas: recorre el lienzo del lápiz con puntero genérico --
// guardar la atención, dibujar, deshacer, hojas múltiples, autoguardado al
// cerrar/reabrir y borrado con ConfirmarModal (nunca window.confirm).
//
// NO cubre presión real ni pointerType 'pen': la API estándar de Playwright
// no los simula (queda para la prueba manual en hardware real).
//
// El brief original de esta tarea quedó desactualizado por decisiones de
// review tomadas durante la implementación (Tasks 8-15); este spec se
// escribió leyendo el código actual, no el brief:
// - La barra de herramientas (lápiz/borrador/color/grosor/deshacer) vive en
//   el FOOTER de LienzoManuscrito.tsx, no en la barra superior.
// - La línea de tiempo de la historia clínica ya NO pinta miniaturas de
//   trazos (Task 14, decisión del owner): muestra un contador y pide las
//   hojas recién al tocarlo. No hay nada que este spec pueda cubrir ahí sin
//   tocar HistoriaClinicaTimeline.tsx, fuera del alcance de esta tarea.
// - El visor de hojas es a pantalla completa, compartido entre el panel de
//   Atención y la línea de tiempo (VisorHojaManuscrita.tsx).
// - "+ Hoja" se deshabilita mientras la creación está en vuelo (no solo al
//   llegar a las 20 hojas) -- Test C lo verifica con un retraso de red.
//
// `hasTouch: true`: HojasManuscritasPanel.tsx gatea "Escribir a mano" por
// `window.matchMedia('(pointer: coarse)')` o `navigator.maxTouchPoints > 0`
// (ESCRITURA_DISPONIBLE) -- ninguno de los dos es cierto en un Chromium de
// escritorio por defecto. Verificado con una prueba aislada: `hasTouch: true`
// pone `maxTouchPoints=1` y `matchMedia('(pointer: coarse)').matches=true`
// sin cambiar `navigator.platform` (sigue "Win32"), así que el aviso de
// Scribble (gateado por UA/plataforma de iPad) no aparece -- eso es lo que
// Test B verifica explícitamente (su ausencia, no su presencia).

const API = 'http://localhost:3000/api/v1'
const ts = Date.now().toString().slice(-6)
const EMAIL = `manu${ts}@test.com`
const PASS = 'Password123!'
const PACIENTE = 'Manu Escrita'

test.use({ hasTouch: true })
test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  await request.post(`${API}/auth/register`, {
    data: { consultorioNombre: `Manu ${ts}`, adminNombre: 'Admin', email: EMAIL, password: PASS },
  })
  const login = await request.post(`${API}/auth/login`, { data: { email: EMAIL, password: PASS } })
  const { accessToken } = await login.json()
  const auth = { Authorization: `Bearer ${accessToken}` }
  const srv = await (
    await request.post(`${API}/servicios`, {
      headers: auth,
      data: { nombre: 'Consulta', duracionMin: 30, precioBase: 2000 },
    })
  ).json()
  const doc = await (
    await request.post(`${API}/doctores`, { headers: auth, data: { nombre: 'Dr. Manuscrito' } })
  ).json()
  const pac = await (
    await request.post(`${API}/pacientes`, {
      headers: auth,
      data: { nombre: 'Manu', apellido: 'Escrita' },
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
  // Se detiene en EN_ATENCION (no ATENDIDA): así "Registrar o ver atención"
  // sigue visible y editable durante todo el archivo (todos los tests
  // reabren la misma cita).
  for (const estado of ['CONFIRMADA', 'LLEGO', 'EN_ATENCION']) {
    await request.put(`${API}/citas/${cita.id}/estado`, { headers: auth, data: { estado } })
  }
})

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /^ingresar$/i }).click()
  await page.waitForURL(/\/agenda$/)
}

// Card raíz de la cita en la vista lista (CitaCard usa cardUI -> "bg-card").
// El texto real es "{nombre} {apellido}" (CitaCard.tsx:192), sin coma --
// distinto del "Apellido, Nombre" de la ficha de paciente.
function cardDe(page: Page) {
  return page.locator('div.bg-card').filter({ hasText: PACIENTE }).first()
}

async function abrirAtencion(page: Page) {
  await login(page)
  await cardDe(page).getByRole('button', { name: 'Registrar o ver atención' }).click()
  await expect(page.getByRole('heading', { name: 'Atención', level: 2 })).toBeVisible()
}

async function abrirEditor(page: Page) {
  await abrirAtencion(page)
  await page.getByRole('button', { name: 'Escribir a mano' }).click()
  await expect(page.getByRole('heading', { name: 'Nota manuscrita', level: 1 })).toBeVisible()
}

function canvasVivoDe(page: Page): Locator {
  return page.locator('canvas[aria-label="Hoja para escribir a mano con el lápiz o el dedo"]')
}

// El canvas de fondo (aria-hidden, hermano ANTERIOR del canvas vivo en el
// DOM -- ver el JSX de LienzoManuscrito.tsx) pinta TODOS los trazos ya
// cerrados; el canvas "vivo" solo el trazo en curso y se limpia apenas se
// suelta el lápiz (limpiarVivo() en alSubir). Por eso la lectura de píxeles
// para verificar que "hay tinta" siempre se hace sobre el fondo, nunca sobre
// el vivo.
async function fondoDataUrl(canvasVivo: Locator): Promise<string> {
  return canvasVivo.evaluate((vivo) => {
    const fondo = vivo.previousElementSibling as HTMLCanvasElement
    return fondo.toDataURL()
  })
}

// Dibuja un trazo simple con mouse.move/down/up -- pointerType 'mouse'
// (puedeDibujar() en LienzoManuscrito.tsx deja dibujar con mouse siempre,
// sin emular lápiz ni tocar el rechazo de palma). Presión real y
// pointerType 'pen' no son simulables con la API estándar de Playwright.
async function dibujarTrazo(page: Page, canvas: Locator) {
  const box = await canvas.boundingBox()
  if (!box) throw new Error('El canvas no tiene bounding box (no está visible)')
  const x0 = box.x + box.width * 0.2
  const y0 = box.y + box.height * 0.2
  const x1 = box.x + box.width * 0.6
  const y1 = box.y + box.height * 0.5
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 6 })
  await page.mouse.move(x1, y1, { steps: 6 })
  await page.mouse.up()
}

test('guardar la atención habilita el panel de notas manuscritas', async ({ page }) => {
  await abrirAtencion(page)

  // Sin atención guardada todavía: leyenda distinta, sin link para escribir
  // (hayAtencion=false -> puedeEscribir=false en HojasManuscritasPanel.tsx).
  await expect(page.getByText('Guarde la atención para poder escribir a mano')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Escribir a mano' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  // El guardado cierra el modal (onSuccess llama onClose() sin condicion).
  await expect(page.getByRole('heading', { name: 'Atención', level: 2 })).not.toBeVisible()

  // Reabrir: la atención ya existe -> leyenda de vacío + link para escribir.
  await cardDe(page).getByRole('button', { name: 'Registrar o ver atención' }).click()
  await expect(page.getByText('Sin notas manuscritas')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Escribir a mano' })).toBeVisible()
})

test('dibujar con el puntero agrega un trazo que Deshacer puede quitar', async ({ page }) => {
  await abrirEditor(page)

  // Sin aviso de Scribble: la UA/plataforma de Playwright no matchea ES_IPAD
  // (Win32, no "iPad"). Se afirma la AUSENCIA, no la presencia (Task 15).
  await expect(page.getByText(/apagá Scribble/)).toHaveCount(0)

  // Primera hoja de esta atención: sin esto no hay canvas que dibujar.
  await page.getByRole('button', { name: 'Primera hoja' }).click()
  const canvas = canvasVivoDe(page)
  await expect(canvas).toBeVisible()
  await expect(page.getByText('Hoja 1 / 1')).toBeVisible()

  const deshacer = page.getByRole('button', { name: 'Deshacer' })
  await expect(deshacer).toBeDisabled()

  const blanco = await fondoDataUrl(canvas)
  await dibujarTrazo(page, canvas)
  // Sin contador de trazos en la UI (el brief original asumía uno que no
  // existe): Deshacer pasando a habilitado es la señal real que expone el
  // DOM de que se comiteó un trazo (registrarCambio() en alSubir).
  await expect(deshacer).toBeEnabled()
  const conTrazo = await fondoDataUrl(canvas)
  expect(conTrazo).not.toBe(blanco)

  await deshacer.click()
  await expect(deshacer).toBeDisabled()
  await expect.poll(() => fondoDataUrl(canvas)).toBe(blanco)
})

test('"+ Hoja" crea una segunda hoja y se deshabilita mientras la creación está en curso', async ({ page }) => {
  await abrirEditor(page)
  // Reabre sobre la hoja de Test B (auto-selección de la primera hoja).
  await expect(page.getByText('Hoja 1 / 1')).toBeVisible()

  // Retraso artificial SOLO en el POST de creación: en localhost la ventana
  // real de "disabled" dura unos pocos ms, insuficiente para verificarla de
  // forma confiable sin esto. GET/PUT pasan sin tocar.
  const esCreacionDeHoja = (url: URL) => /\/atenciones\/cita\/\d+\/hojas$/.test(url.pathname)
  const conRetraso = async (route: import('@playwright/test').Route) => {
    if (route.request().method() === 'POST') {
      await new Promise((r) => setTimeout(r, 500))
    }
    await route.continue()
  }
  await page.route(esCreacionDeHoja, conRetraso)

  const botonMasHoja = page.getByRole('button', { name: 'Hoja', exact: true })
  await botonMasHoja.click()
  await expect(botonMasHoja).toBeDisabled()
  await expect(page.getByText('Hoja 2 / 2')).toBeVisible()
  await expect(botonMasHoja).toBeEnabled()

  await page.unroute(esCreacionDeHoja, conRetraso)
})

test('cerrar el editor guarda y reabrir muestra el trazo intacto', async ({ page }) => {
  await abrirEditor(page)
  // 2 hojas desde Test C; auto-selección deja la primera activa.
  await expect(page.getByText('Hoja 1 / 2')).toBeVisible()

  const canvas = canvasVivoDe(page)
  const blanco = await fondoDataUrl(canvas)
  await dibujarTrazo(page, canvas)
  const conTrazo = await fondoDataUrl(canvas)
  expect(conTrazo).not.toBe(blanco)

  // El cierre dispara el guardado por el cleanup de useEffect (deps [],
  // guardarAlSalir) -- se espera la respuesta real, no un timeout fijo.
  //
  // ALCANCE: acá no hay ningún PUT en vuelo (el trazo se dibuja y se cierra
  // enseguida, mucho antes del primer tick del autoguardado a los 10s), así
  // que `guardarActivaSiSucia` es DUEÑA del mutex y devuelve `true` de una.
  // Este test cubre el flush de salida en general, NO la rama de unión al
  // mutex, que es donde estaba el bug del review final -- ese camino lo cubre
  // el último test del archivo.
  const guardado = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && /\/hojas\/\d+$/.test(new URL(r.url()).pathname),
  )
  await page.getByRole('button', { name: 'Cerrar nota manuscrita' }).click()
  await guardado

  // Recarga real (no solo cerrar el overlay): la única fuente de verdad es
  // lo que el servidor confirmó, no la cache en memoria de esta pestaña.
  await page.reload()
  await cardDe(page).getByRole('button', { name: 'Registrar o ver atención' }).click()
  await page.getByRole('button', { name: 'Escribir a mano' }).click()
  await expect(page.getByRole('heading', { name: 'Nota manuscrita', level: 1 })).toBeVisible()
  await expect(page.getByText('Hoja 1 / 2')).toBeVisible()

  const canvasReabierto = canvasVivoDe(page)
  await expect(canvasReabierto).toBeVisible()
  await expect.poll(() => fondoDataUrl(canvasReabierto)).not.toBe(blanco)
})

test('eliminar una hoja usa el ConfirmarModal (no window.confirm) y deja una sola', async ({ page }) => {
  const dialogosNativos: string[] = []
  page.on('dialog', (d) => {
    dialogosNativos.push(d.message())
    d.dismiss()
  })

  await abrirEditor(page)
  // 2 hojas desde Test C/D; auto-selección deja la primera (con el trazo de Test D) activa.
  await expect(page.getByText('Hoja 1 / 2')).toBeVisible()

  await page.getByRole('button', { name: 'Eliminar hoja actual' }).click()
  await expect(page.getByRole('heading', { name: 'Eliminar hoja', level: 2 })).toBeVisible()
  await expect(page.getByText(/Se eliminará la hoja 1 de la historia clínica/)).toBeVisible()

  await page.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Eliminar hoja', level: 2 })).not.toBeVisible()
  await expect(page.getByText('Hoja 1 / 1')).toBeVisible()

  expect(dialogosNativos).toHaveLength(0)
})

// Cuántos trazos viajaron en el cuerpo de un PUT de hoja. try/catch porque
// esto corre dentro de un handler de evento de Playwright: una excepción ahí
// tumba el test por una razón que no tiene nada que ver con lo que mide.
function trazosDe(request: import('@playwright/test').Request): number {
  try {
    const cuerpo = request.postDataJSON() as { trazos?: { strokes?: unknown[] } } | null
    return cuerpo?.trazos?.strokes?.length ?? -1
  } catch {
    return -1
  }
}

// El camino REAL del Finding 2 del review final de la rama, que el test D NO
// toca: cerrar el editor con el PUT del AUTOGUARDADO todavía en vuelo.
//
// El defecto: `guardarAlSalir` (antes, el cleanup llamando
// `prepararCambioDeHoja`) pedía un guardado, `guardarActivaSiSucia` veía el
// mutex tomado y devolvía la promesa del PUT que ya estaba viajando en vez de
// emitir uno nuevo. Esa promesa resuelve `false` (su foto ya no coincide con
// la memoria: el doctor dibujó después de que salió) y nadie consumía ese
// `false` -- el editor se cerraba sin error y el último trazo no viajaba
// nunca.
//
// Se afirma sobre el CUERPO de los PUT, no sobre píxeles: contar tinta en el
// canvas no distingue un trazo de dos, y lo que el bug producía era
// exactamente eso -- un solo PUT, con un solo trazo.
test('cerrar con un autoguardado en vuelo reintenta y no pierde el último trazo', async ({ page }) => {
  // El intervalo de autoguardado es de 10s fijos desde que monta el editor
  // (useEffect con deps [] en LienzoManuscrito.tsx) y el PUT se retiene 2s a
  // propósito más abajo: no entra en el timeout de 30s del config.
  test.setTimeout(60_000)

  const trazosPorPut: number[] = []
  page.on('request', (r) => {
    if (r.method() !== 'PUT') return
    if (!/\/hojas\/\d+$/.test(new URL(r.url()).pathname)) return
    trazosPorPut.push(trazosDe(r))
  })

  await abrirEditor(page)
  // Test E dejó una sola hoja, y vacía (la que creó Test C sin dibujar).
  await expect(page.getByText('Hoja 1 / 1')).toBeVisible()

  // Retraso SOLO en el PUT (el POST de "+ Hoja" y los GET pasan sin tocar):
  // mantiene el guardado del timer en vuelo el tiempo suficiente para dibujar
  // encima y cerrar. El evento 'request' de Playwright se emite al
  // INTERCEPTAR, antes de este sleep, así que el waitForRequest de abajo
  // vuelve con los 2s enteros de margen por delante.
  const esGuardadoDeHoja = (url: URL) => /\/atenciones\/cita\/\d+\/hojas\/\d+$/.test(url.pathname)
  const conRetraso = async (route: import('@playwright/test').Route) => {
    if (route.request().method() === 'PUT') {
      await new Promise((r) => setTimeout(r, 2000))
    }
    await route.continue()
  }
  await page.route(esGuardadoDeHoja, conRetraso)

  const canvas = canvasVivoDe(page)
  const esPutDeHoja = (r: import('@playwright/test').Request) =>
    r.method() === 'PUT' && /\/hojas\/\d+$/.test(new URL(r.url()).pathname)

  // Se registra la espera ANTES de ensuciar la hoja: la hoja abre limpia, así
  // que el primer PUT que exista es el del tick del timer con el trazo 1.
  const primerGuardado = page.waitForRequest(esPutDeHoja)
  await dibujarTrazo(page, canvas)
  await primerGuardado

  // Trazo 2 mientras ese PUT sigue retenido por la ruta.
  await dibujarTrazo(page, canvas)

  // El reintento del flush de salida es el PUT que lleva los DOS trazos.
  const guardadoConAmbos = page.waitForResponse(
    (r) => esPutDeHoja(r.request()) && trazosDe(r.request()) === 2,
  )
  await page.getByRole('button', { name: 'Cerrar nota manuscrita' }).click()
  const respuesta = await guardadoConAmbos
  expect(respuesta.ok()).toBe(true)

  await page.unroute(esGuardadoDeHoja, conRetraso)

  // El del timer llevó 1 trazo (lo único que existía cuando disparó) y hubo
  // un segundo PUT después: antes del fix, ese segundo no se emitía nunca.
  expect(trazosPorPut[0]).toBe(1)
  expect(trazosPorPut.length).toBeGreaterThanOrEqual(2)
})
