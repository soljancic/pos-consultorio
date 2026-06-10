-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "anuladoAt" TIMESTAMP(3),
ADD COLUMN     "anuladoPorId" INTEGER,
ADD COLUMN     "motivoAnulacion" TEXT,
ADD COLUMN     "reversaDeId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "pagos_reversaDeId_key" ON "pagos"("reversaDeId");

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_reversaDeId_fkey" FOREIGN KEY ("reversaDeId") REFERENCES "pagos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

