-- AlterTable
ALTER TABLE "consultorios" ADD COLUMN     "vendeProductos" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "productos" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "categoria" TEXT,
    "nombre" TEXT NOT NULL,
    "codigoBarras" TEXT,
    "precioVenta" DECIMAL(10,2) NOT NULL,
    "precioCosto" DECIMAL(10,2) NOT NULL,
    "stockActual" INTEGER NOT NULL DEFAULT 0,
    "controlaStock" BOOLEAN NOT NULL DEFAULT true,
    "habilitadoVenta" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "productos_consultorioId_idx" ON "productos"("consultorioId");

-- CreateIndex
CREATE INDEX "productos_consultorioId_nombre_idx" ON "productos"("consultorioId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "productos_consultorioId_codigoBarras_key" ON "productos"("consultorioId", "codigoBarras");

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
