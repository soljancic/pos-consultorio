-- Token opaco por paciente para links de reserva precargados del portal
-- publico. Aleatorio (no derivado de datos), se genera bajo demanda.
ALTER TABLE "pacientes" ADD COLUMN "portalToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pacientes_portalToken_key" ON "pacientes"("portalToken");
