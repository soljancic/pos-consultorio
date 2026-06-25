-- AlterTable
ALTER TABLE "cobros" ADD COLUMN     "descuento" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "motivoDescuento" TEXT;
