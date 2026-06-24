-- Auditoria claude-db: indices de cobertura para FK consultadas + CHECK constraints de dominio.
-- Migracion aditiva y reversible. Las tablas son chicas: CREATE INDEX plano (sin CONCURRENTLY,
-- que ademas no corre dentro de la transaccion de Prisma). Los CHECK validan los datos
-- existentes al aplicar; correr antes el SQL de verificacion (cada query debe dar 0 filas).

-- ─── Indices de FK (M11) ──────────────────────────────────────────────────────
-- Tenant-first donde la tabla tiene consultorioId (las queries siempre filtran por tenant);
-- plano en recetas, que se alcanza via atencion y no lleva consultorioId.
CREATE INDEX "citas_consultorioId_servicioId_idx" ON "citas"("consultorioId", "servicioId");
CREATE INDEX "gastos_consultorioId_tipoGastoId_idx" ON "gastos"("consultorioId", "tipoGastoId");
CREATE INDEX "gastos_consultorioId_tipoCuentaId_idx" ON "gastos"("consultorioId", "tipoCuentaId");
CREATE INDEX "pacientes_consultorioId_aseguradoraId_idx" ON "pacientes"("consultorioId", "aseguradoraId");
CREATE INDEX "recetas_atencionId_idx" ON "recetas"("atencionId");

-- ─── CHECK constraints de dominio (M5) ────────────────────────────────────────
-- Prisma no modela CHECK: viven solo aqui (no se reflejan en schema.prisma ni rompen el client).
-- Subconjunto SIN ambiguedad. NO se restringe el signo de Pago.monto: el asiento de reversa
-- guarda un espejo negativo (cobros.service.ts), un CHECK de no-negativo romperia la anulacion.

-- Porcentajes en 0..100 (comision del doctor, cobertura del seguro)
ALTER TABLE "doctores"
  ADD CONSTRAINT "doctores_comisionPct_check"
  CHECK ("comisionPct" IS NULL OR ("comisionPct" >= 0 AND "comisionPct" <= 100));

ALTER TABLE "categorias_seguro"
  ADD CONSTRAINT "categorias_seguro_porcentajeCobertura_check"
  CHECK ("porcentajeCobertura" >= 0 AND "porcentajeCobertura" <= 100);

-- Duracion de cita/servicio positiva
ALTER TABLE "servicios"
  ADD CONSTRAINT "servicios_duracionMin_check"
  CHECK ("duracionMin" > 0);

ALTER TABLE "citas"
  ADD CONSTRAINT "citas_duracionMin_check"
  CHECK ("duracionMin" > 0);

-- Sexo dentro del dominio declarado en el schema ("M" | "F" | "X")
ALTER TABLE "pacientes"
  ADD CONSTRAINT "pacientes_sexo_check"
  CHECK ("sexo" IS NULL OR "sexo" IN ('M', 'F', 'X'));

-- Pais en ISO 3166-1 alfa-2 (exactamente 2 caracteres)
ALTER TABLE "pacientes"
  ADD CONSTRAINT "pacientes_pais_check"
  CHECK (char_length("pais") = 2);

ALTER TABLE "consultorios"
  ADD CONSTRAINT "consultorios_pais_check"
  CHECK ("pais" IS NULL OR char_length("pais") = 2);
