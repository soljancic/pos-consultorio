-- CreateEnum
CREATE TYPE "CategoriaGasto" AS ENUM ('INSUMOS', 'SUELDOS', 'ALQUILER', 'SERVICIOS', 'IMPUESTOS', 'OTROS');

-- CreateEnum
CREATE TYPE "CuentaGasto" AS ENUM ('CAJA_EFECTIVO', 'BANCO', 'OTRO');

-- CreateTable
CREATE TABLE "gastos" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "categoria" "CategoriaGasto" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "personal" TEXT,
    "cuenta" "CuentaGasto" NOT NULL DEFAULT 'CAJA_EFECTIVO',
    "comprobanteUrl" TEXT,
    "registradoPorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gastos_consultorioId_fecha_idx" ON "gastos"("consultorioId", "fecha");

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

