-- Recrea la tabla plantillas_horario (presets de horario del calendario).
-- DDL identico al de la migracion original 20260611214531_plantillas_y_prepago,
-- asi el estado de Prisma migrate queda consistente (esa migracion ya figura
-- como aplicada en _prisma_migrations; esto solo restaura la tabla dropeada).
-- La tabla queda VACIA: si tenias presets cargados, se recrean desde la UI.
CREATE TABLE "plantillas_horario" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "plantillas_horario_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "plantillas_horario_consultorioId_idx" ON "plantillas_horario"("consultorioId");

ALTER TABLE "plantillas_horario" ADD CONSTRAINT "plantillas_horario_consultorioId_fkey"
  FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
