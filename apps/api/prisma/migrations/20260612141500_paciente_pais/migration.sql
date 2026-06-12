-- Pais del paciente (ISO 3166-1 alfa-2): define el prefijo internacional
-- al armar links de WhatsApp. Bolivia por defecto.
ALTER TABLE "pacientes" ADD COLUMN "pais" TEXT NOT NULL DEFAULT 'BO';
