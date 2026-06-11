-- AlterTable
ALTER TABLE "caja_diaria" ADD COLUMN     "abiertaAt" TIMESTAMP(3),
ADD COLUMN     "montoInicial" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "notasApertura" TEXT;

