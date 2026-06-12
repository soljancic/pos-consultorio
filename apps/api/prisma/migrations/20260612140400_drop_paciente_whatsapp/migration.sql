-- La columna whatsapp se elimina: telefono pasa a ser el unico numero de
-- contacto (sirve para llamadas y WhatsApp). Antes de dropear, se preserva
-- el numero en telefono para los pacientes que solo tenian whatsapp.
UPDATE "pacientes" SET "telefono" = "whatsapp" WHERE "telefono" IS NULL AND "whatsapp" IS NOT NULL;

-- DropIndex
DROP INDEX "pacientes_consultorioId_whatsapp_idx";

-- AlterTable
ALTER TABLE "pacientes" DROP COLUMN "whatsapp";

-- CreateIndex (el portal publico matchea pacientes por telefono)
CREATE INDEX "pacientes_consultorioId_telefono_idx" ON "pacientes"("consultorioId", "telefono");
