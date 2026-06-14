-- Unifica las formas de pago del cobro con el catalogo de tipos de cuenta.
-- Pago.formaPago (enum) -> Pago.tipoCuentaId (FK a tipos_cuenta).

-- 1) columna nueva (nullable para poder backfillear)
ALTER TABLE "pagos" ADD COLUMN "tipoCuentaId" INTEGER;

-- 2) backfill: mapear el enum viejo a una cuenta del mismo consultorio
--    EFECTIVO -> la cuenta esEfectivo; el resto -> la primera no-efectivo
UPDATE "pagos" p SET "tipoCuentaId" = COALESCE(
  (SELECT tc.id FROM "tipos_cuenta" tc
     JOIN "cobros" co ON co.id = p."cobroId"
    WHERE tc."consultorioId" = co."consultorioId"
      AND ((p."formaPago" = 'EFECTIVO' AND tc."esEfectivo" = true)
        OR (p."formaPago" <> 'EFECTIVO' AND tc."esEfectivo" = false))
    ORDER BY tc.id LIMIT 1),
  (SELECT tc.id FROM "tipos_cuenta" tc
     JOIN "cobros" co ON co.id = p."cobroId"
    WHERE tc."consultorioId" = co."consultorioId"
    ORDER BY tc.id LIMIT 1)
);

-- 3) restricciones definitivas
ALTER TABLE "pagos" ALTER COLUMN "tipoCuentaId" SET NOT NULL;
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_tipoCuentaId_fkey"
  FOREIGN KEY ("tipoCuentaId") REFERENCES "tipos_cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "pagos_tipoCuentaId_idx" ON "pagos"("tipoCuentaId");

-- 4) baja del enum viejo y de las columnas de caja por metodo (el desglose se
--    calcula dinamico desde los pagos; el arqueo usa solo totalEfectivo)
ALTER TABLE "pagos" DROP COLUMN "formaPago";
ALTER TABLE "caja_diaria" DROP COLUMN "totalQr";
ALTER TABLE "caja_diaria" DROP COLUMN "totalVales";
ALTER TABLE "caja_diaria" DROP COLUMN "totalTarjeta";
DROP TYPE "FormaPago";
