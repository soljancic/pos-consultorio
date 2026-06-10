-- Formas de pago: QR absorbe TRANSFERENCIA (mismo canal en la practica) y se
-- agrega VALES. Los datos historicos se migran antes del swap del enum.

-- 1. Mover pagos por transferencia a QR (con el enum viejo todavia vigente)
UPDATE "pagos" SET "formaPago" = 'QR' WHERE "formaPago" = 'TRANSFERENCIA';

-- 2. Consolidar los totales de caja
UPDATE "caja_diaria" SET "totalQr" = "totalQr" + "totalTransferencia";

-- 3. Reemplazar el enum
CREATE TYPE "FormaPago_new" AS ENUM ('EFECTIVO', 'QR', 'TARJETA', 'VALES');
ALTER TABLE "pagos" ALTER COLUMN "formaPago" TYPE "FormaPago_new" USING ("formaPago"::text::"FormaPago_new");
ALTER TYPE "FormaPago" RENAME TO "FormaPago_old";
ALTER TYPE "FormaPago_new" RENAME TO "FormaPago";
DROP TYPE "FormaPago_old";

-- 4. Caja: entra vales, sale transferencia (ya consolidada en QR)
ALTER TABLE "caja_diaria" ADD COLUMN "totalVales" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "caja_diaria" DROP COLUMN "totalTransferencia";
