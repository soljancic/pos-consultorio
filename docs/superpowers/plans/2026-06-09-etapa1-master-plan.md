# Etapa 1 — Plan Maestro de Ejecucion

> ✔ **EJECUTADO COMPLETO el 2026-06-09/10.** Los 5 hitos M0-M4 pasaron sus gates runtime, el gate final se cumplio con la suite Playwright (5/5) y se taggeo `v0.1.0-mvp`. Bugs extra encontrados por los gates (no previstos en los planes): packaging de @pos/types, serializacion de Decimal, PUT parcial de pacientes, dia de caja/agenda en UTC. Este documento queda como registro historico; el estado vivo esta en PLAN.md §11.

> **Para agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Este documento orquesta los 8 planes individuales — cada hito ejecuta un plan completo de `docs/superpowers/plans/`.

**Goal:** Completar la Etapa 1 (MVP Operativo vendible) ejecutando los 8 planes en orden, con gates de verificacion entre hitos.

**Estado del repo al iniciar:** un solo commit (`875f6c2` scaffold) + working tree con fixes y NuevaCitaModal sin commitear (ver PLAN.md §11).

---

## Mapa de dependencias

```
M0: commit base ──► M0: fixes-previos  ◄── BLOQUEA TODO (sin esto la API da 400 en POST/PUT)
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
   M1: pacientes    M2: deudores ──► dashboard    M3: catalogo ──► configuracion
        │                 (ambos tocan cobros.service:        (independientes entre si,
        │                  ejecutar en serie)                  pero config usa patron DTO de catalogo)
        └────────────┬────┴──────────────────┘
                     ▼
        M4: atencion-basica ──► etapa1-menores
             (ambos tocan AgendaPage/CitaCard: en serie)
                     │
                     ▼
              GATE FINAL E2E
```

Regla practica: **un plan por sesion de trabajo**, commit al cierre de cada task (ya definido dentro de cada plan), `tsc --noEmit` en ambos apps antes de cada commit.

---

## M0 — Base sana

- [ ] **Step 1: Commitear el working tree actual**

Todo lo que esta sin commitear es un solo cambio logico (fixes de sesion anterior + modal conectado):

```bash
git add -A
git commit -m "feat: connect nueva-cita modal and fix UTC dates, JWT fallback, transicionValida"
```

- [ ] **Step 2: Ejecutar `2026-06-09-fixes-previos-plan.md` completo** (3 tasks: DTOs class-validator, deudaTotal en ATENDIDA, timezone modal)

- [ ] **GATE M0 (runtime, no solo tsc):** levantar la API y verificar con Swagger o curl:
  - `POST /api/v1/auth/login` → 200 con token
  - `POST /api/v1/pacientes` con body valido → 201 (hoy daria 400)
  - `POST /api/v1/citas` con body valido → 201 y crea el cobro PENDIENTE
  - Cita creada a las 10:00 hora local aparece a las 10:00 en la agenda

No avanzar a M1 sin este gate verde — todos los planes siguientes asumen la API funcional.

---

## M1 — Pacientes (el modulo que mas valor entrega)

- [ ] Ejecutar `2026-06-09-pacientes-plan.md` (5 tasks: migracion sexo/direccion, ruta+nav, PacienteDetallePage, PacienteModal, tipos)

- [ ] **GATE M1:** crear un paciente desde la UI → navega a su ficha; editarlo; verlo en la lista con busqueda. Crear cita para ese paciente desde la agenda.

---

## M2 — Flujo de dinero (deudores → dashboard, EN SERIE: ambos tocan cobros.service.ts)

- [ ] Ejecutar `2026-06-09-deudores-plan.md` (reescribe getDeudores + DeudoresPage)
- [ ] Ejecutar `2026-06-09-dashboard-plan.md` (getDeudoresResumen + DashboardPage)

- [ ] **GATE M2 (escenario de deuda completo):**
  1. Crear cita hoy → LLEGO → EN_ATENCION → ATENDIDA
  2. Cobrar PARCIAL → cita queda CON_DEUDA
  3. El paciente aparece en /deudores con el saldo correcto y boton WhatsApp con el monto
  4. Un paciente con cita FUTURA sin atender NO aparece en /deudores
  5. El dashboard muestra el total de deuda y las metricas del dia coherentes
  6. Pagar el saldo desde /deudores → desaparece de la lista, cita pasa a COBRADO

---

## M3 — Administracion (catalogo → configuracion)

- [ ] Ejecutar `2026-06-09-catalogo-crud-plan.md` (PUT /doctores/:id, ?todos=true, modales, rol guard)
- [ ] Ejecutar `2026-06-09-configuracion-plan.md` (migracion telefono/direccion, usuarios POST/PUT, ConfiguracionPage, AdminRoute)

- [ ] **GATE M3:**
  1. Como ADMIN: crear servicio, desactivarlo → no aparece en NuevaCitaModal pero si en catalogo (badge Inactivo), reactivarlo
  2. Crear doctor con color → aparece en la agenda con su color
  3. Crear usuario SECRETARIA; login con el → no ve Configuracion ni botones CRUD del catalogo; /configuracion lo redirige a /agenda
  4. Cambiar moneda del consultorio → formatMoneda refleja el cambio

---

## M4 — Doctor y cierre (atencion-basica → etapa1-menores, EN SERIE: ambos tocan AgendaPage)

- [ ] Ejecutar `2026-06-09-atencion-basica-plan.md` (migracion tratamiento, modulo atenciones, AtencionModal, ficha expandible)
- [ ] Ejecutar `2026-06-09-etapa1-menores-plan.md` (filtro doctor + vista DOCTOR, caja historial, desglose deuda)

- [ ] **GATE M4:**
  1. Cita EN_ATENCION → registrar diagnostico/tratamiento → "Guardar y marcar Atendida" en un click
  2. En la ficha del paciente, expandir la cita y leer la atencion
  3. Usuario DOCTOR (vinculado a un doctor) entra a la agenda → ve solo sus citas, sin dropdown
  4. Caja > Hoy: cobrar una deuda de ayer → suma en "Pagos de deuda anterior" y el movimiento tiene badge Deuda
  5. Caja > Historial: los dias anteriores listan con totales y el total del periodo cierra

---

## GATE FINAL — Etapa 1 terminada (criterios de exito del MVP)

El dia a dia completo del consultorio, de punta a punta, sin tocar la base de datos:

- [ ] **Secretaria** (regla de oro UX): desde /agenda puede agendar, confirmar, marcar llegada, cobrar, dejar deuda y mandar WhatsApp sin cambiar de pantalla
- [ ] **"Cuanto se cobro hoy"**: visible en segundos en dashboard y caja, por forma de pago
- [ ] **"Quien debe y cuanto"**: /deudores responde con montos exactos y ultimo pago
- [ ] **"Que se le hizo la ultima vez"**: el doctor lo lee en la ficha del paciente
- [ ] Los 4 roles probados: ADMIN (todo), SECRETARIA (sin config), DOCTOR (su agenda + atenciones), CAJA (caja y cobros)
- [ ] `npx tsc --noEmit` limpio en api y web; sin regresiones en los gates anteriores
- [ ] Tag de cierre: `git tag v0.1.0-mvp`

**Despues del gate final:** desplegar a un entorno real y conseguir el primer consultorio piloto — el trigger de Etapa 2 es "1 consultorio activo usandolo a diario durante 2 semanas" (PLAN.md §10).
