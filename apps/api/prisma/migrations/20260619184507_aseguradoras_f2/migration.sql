-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('PENDIENTE', 'FACTURADO', 'PAGADO', 'RECHAZADO');

-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "categoriaSeguroId" INTEGER,
ADD COLUMN     "codigoSeguro" TEXT,
ADD COLUMN     "montoAseguradora" DECIMAL(10,2),
ADD COLUMN     "montoPaciente" DECIMAL(10,2),
ADD COLUMN     "usaSeguro" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "pacientes" ADD COLUMN     "aseguradoraId" INTEGER,
ADD COLUMN     "categoriaSeguroId" INTEGER,
ADD COLUMN     "codigoSeguro" TEXT,
ADD COLUMN     "tieneSeguro" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "liquidacion_items" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "citaId" INTEGER NOT NULL,
    "aseguradoraId" INTEGER NOT NULL,
    "categoriaSeguroId" INTEGER NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "servicioId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "montoAseguradora" DECIMAL(10,2) NOT NULL,
    "codigoSeguro" TEXT,
    "estado" "EstadoLiquidacion" NOT NULL DEFAULT 'PENDIENTE',
    "facturadoAt" TIMESTAMP(3),
    "pagadoAt" TIMESTAMP(3),
    "rechazoMotivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidacion_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "liquidacion_items_citaId_key" ON "liquidacion_items"("citaId");

-- CreateIndex
CREATE INDEX "liquidacion_items_consultorioId_aseguradoraId_estado_idx" ON "liquidacion_items"("consultorioId", "aseguradoraId", "estado");

-- CreateIndex
CREATE INDEX "liquidacion_items_consultorioId_fecha_idx" ON "liquidacion_items"("consultorioId", "fecha");

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_aseguradoraId_fkey" FOREIGN KEY ("aseguradoraId") REFERENCES "aseguradoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_categoriaSeguroId_fkey" FOREIGN KEY ("categoriaSeguroId") REFERENCES "categorias_seguro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_categoriaSeguroId_fkey" FOREIGN KEY ("categoriaSeguroId") REFERENCES "categorias_seguro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_items" ADD CONSTRAINT "liquidacion_items_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_items" ADD CONSTRAINT "liquidacion_items_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "citas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_items" ADD CONSTRAINT "liquidacion_items_aseguradoraId_fkey" FOREIGN KEY ("aseguradoraId") REFERENCES "aseguradoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_items" ADD CONSTRAINT "liquidacion_items_categoriaSeguroId_fkey" FOREIGN KEY ("categoriaSeguroId") REFERENCES "categorias_seguro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_items" ADD CONSTRAINT "liquidacion_items_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_items" ADD CONSTRAINT "liquidacion_items_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
