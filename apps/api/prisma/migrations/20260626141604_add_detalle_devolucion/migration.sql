-- AlterTable
ALTER TABLE "detalle_cobros" ADD COLUMN     "devueltoAt" TIMESTAMP(3),
ADD COLUMN     "devueltoPorId" INTEGER;

-- AddForeignKey
ALTER TABLE "detalle_cobros" ADD CONSTRAINT "detalle_cobros_devueltoPorId_fkey" FOREIGN KEY ("devueltoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
