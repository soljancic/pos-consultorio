-- Archivar pacientes (activo:false). Aditiva y no destructiva: los pacientes
-- existentes quedan activos por el DEFAULT.
ALTER TABLE "pacientes" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;
