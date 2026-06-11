-- AlterTable
ALTER TABLE "caja_diaria" ADD COLUMN     "diferencia" DECIMAL(10,2),
ADD COLUMN     "montoDeclarado" DECIMAL(10,2),
ADD COLUMN     "montoEsperado" DECIMAL(10,2),
ADD COLUMN     "notasCierre" TEXT,
ADD COLUMN     "notasRevision" TEXT,
ADD COLUMN     "revisadaAt" TIMESTAMP(3),
ADD COLUMN     "revisadaPorId" INTEGER;

-- AddForeignKey
ALTER TABLE "caja_diaria" ADD CONSTRAINT "caja_diaria_revisadaPorId_fkey" FOREIGN KEY ("revisadaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

