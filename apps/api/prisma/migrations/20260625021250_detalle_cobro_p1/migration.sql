-- DropForeignKey
ALTER TABLE "cobros" DROP CONSTRAINT "cobros_citaId_fkey";

-- AlterTable
ALTER TABLE "cobros" ADD COLUMN     "pacienteId" INTEGER,
ALTER COLUMN "citaId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "detalle_cobros" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "cobroId" INTEGER NOT NULL,
    "servicioId" INTEGER,
    "productoId" INTEGER,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "precioVenta" DECIMAL(10,2) NOT NULL,
    "precioCosto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detalle_cobros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "detalle_cobros_consultorioId_idx" ON "detalle_cobros"("consultorioId");

-- CreateIndex
CREATE INDEX "detalle_cobros_cobroId_idx" ON "detalle_cobros"("cobroId");

-- CreateIndex
CREATE INDEX "detalle_cobros_consultorioId_productoId_idx" ON "detalle_cobros"("consultorioId", "productoId");

-- CreateIndex
CREATE INDEX "cobros_consultorioId_pacienteId_idx" ON "cobros"("consultorioId", "pacienteId");

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "citas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "pacientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_cobros" ADD CONSTRAINT "detalle_cobros_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_cobros" ADD CONSTRAINT "detalle_cobros_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "cobros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_cobros" ADD CONSTRAINT "detalle_cobros_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_cobros" ADD CONSTRAINT "detalle_cobros_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- XOR servicio/producto: exactamente uno no nulo
ALTER TABLE "detalle_cobros"
  ADD CONSTRAINT "detalle_cobros_servicio_o_producto"
  CHECK ((("servicioId" IS NOT NULL)::int + ("productoId" IS NOT NULL)::int) = 1);

-- Cantidad positiva
ALTER TABLE "detalle_cobros"
  ADD CONSTRAINT "detalle_cobros_cantidad_pos" CHECK ("cantidad" > 0);

-- Backfill: una linea de servicio por cada cobro existente, preservando el
-- total. precioVenta = subtotal = cobro.total (cantidad 1, costo 0). El nombre
-- del servicio sale de la cita asociada.
INSERT INTO "detalle_cobros"
  ("consultorioId", "cobroId", "servicioId", "descripcion", "cantidad", "precioVenta", "precioCosto", "subtotal", "createdAt")
SELECT c."consultorioId", c."id", ci."servicioId", s."nombre", 1, c."total", 0, c."total", NOW()
FROM "cobros" c
JOIN "citas" ci ON ci."id" = c."citaId"
JOIN "servicios" s ON s."id" = ci."servicioId";

-- Backfill: copiar el paciente de la cita al cobro (para deuda de venta directa
-- y consistencia; los cobros existentes siempre tienen cita).
UPDATE "cobros" c
SET "pacienteId" = ci."pacienteId"
FROM "citas" ci
WHERE ci."id" = c."citaId" AND c."pacienteId" IS NULL;
