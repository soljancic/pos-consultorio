# Testing — POS del Consultorio

Tres capas, de mas rapida a mas completa. Las tres deben estar verdes antes de
un tag o un deploy.

## 1. Unit (Jest) — logica pura

```bash
cd apps/api && npx jest
```

- `src/common/transiciones.spec.ts` — fija el contrato de la maquina de estados
  de citas (flujo feliz, deuda, COBRADO terminal, sin saltos ni retrocesos,
  ATENDIDA alcanzable solo desde EN_ATENCION — garantiza el incremento unico de
  `deudaTotal`).

Sin base de datos ni server. Agregar aqui todo lo que sea logica pura.

## 2. Gates de API (PowerShell) — flujos de negocio reales

Requieren la API corriendo (`node dist/src/main.js` o `pnpm start:dev`) con
PostgreSQL local. Cada gate crea su propio consultorio (no ensucian datos de
otros): son idempotentes y re-ejecutables.

```powershell
scripts/gate-m2.ps1               # escenario de deuda completo (deudores/resumen)
scripts/gate-m3.ps1               # catalogo, roles 403, usuarios, consultorio
scripts/gate-m4.ps1               # atenciones, filtro doctor, desglose de caja
scripts/gate-agenda-nocturna.ps1  # cita 21:00 local cae en el dia correcto (canario TZ)
scripts/gate-hardening.ps1        # health, helmet, throttle 429, swagger dev
scripts/gate-negativos.ps1        # AISLAMIENTO MULTI-TENANT + solapamiento +
                                  # transicion invalida + pagos excedidos + 401
```

**Gotcha PowerShell 5.1:** `ConvertFrom-Json` via pipeline no enumera arrays
(`@(...)` envuelve el array entero como 1 item y los conteos mienten). Usar
siempre `ConvertFrom-Json -InputObject $raw`.

## 3. E2E de UI (Playwright) — browser real contra API real

Requiere API en :3000 y `pnpm dev` (web) en :5173.

```bash
cd apps/web && npx playwright test            # toda la suite
npx playwright test e2e/smoke.spec.ts         # solo smoke
npx playwright show-trace test-results/...    # debug de una falla
```

- `e2e/smoke.spec.ts` — el dia del consultorio de punta a punta: login →
  dashboard → crear paciente → cita → estados → atencion ("Guardar y marcar
  Atendida") → cobro parcial → deudores → caja con desglose → catalogo →
  configuracion → atencion legible en la ficha.
- `e2e/roles.spec.ts` — SECRETARIA sin Configuracion ni CRUD (y la ruta la
  expulsa); ADMIN con todo.

**Gotcha rate-limit:** la suite hace muchos logins por minuto. El throttle de
`/auth/login` (10/min en produccion) se relaja en dev con `LOGIN_RATE_LIMIT` /
`REGISTER_RATE_LIMIT` en `apps/api/.env` — sin eso la suite se auto-bloquea
con 429 y los tests mueren esperando el redirect del login.

## Verificacion minima pre-commit

```bash
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```

(Y `pnpm build` en packages/types si se tocaron los tipos compartidos.)

## Politica

- Cada hito nuevo agrega: su gate de API y/o su spec de Playwright. Los gates
  de hitos anteriores se corren como regresion antes de cerrar el nuevo.
- Un bug encontrado en runtime gana un caso en el gate correspondiente (asi
  nacieron el canario nocturno y gate-negativos).
