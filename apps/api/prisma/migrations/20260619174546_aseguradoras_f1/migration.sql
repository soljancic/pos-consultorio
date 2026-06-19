-- AlterTable
ALTER TABLE "consultorios" ADD COLUMN     "trabajaConAseguradoras" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "aseguradoras" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "observaciones" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aseguradoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_seguro" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "aseguradoraId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "porcentajeCobertura" DECIMAL(5,2) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_seguro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarifas_cobertura" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "categoriaSeguroId" INTEGER NOT NULL,
    "servicioId" INTEGER NOT NULL,
    "montoPaciente" DECIMAL(10,2) NOT NULL,
    "montoAseguradora" DECIMAL(10,2) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarifas_cobertura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aseguradoras_consultorioId_idx" ON "aseguradoras"("consultorioId");

-- CreateIndex
CREATE INDEX "categorias_seguro_consultorioId_idx" ON "categorias_seguro"("consultorioId");

-- CreateIndex
CREATE INDEX "categorias_seguro_aseguradoraId_idx" ON "categorias_seguro"("aseguradoraId");

-- CreateIndex
CREATE INDEX "tarifas_cobertura_consultorioId_idx" ON "tarifas_cobertura"("consultorioId");

-- CreateIndex
CREATE UNIQUE INDEX "tarifas_cobertura_categoriaSeguroId_servicioId_key" ON "tarifas_cobertura"("categoriaSeguroId", "servicioId");

-- AddForeignKey
ALTER TABLE "aseguradoras" ADD CONSTRAINT "aseguradoras_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_seguro" ADD CONSTRAINT "categorias_seguro_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_seguro" ADD CONSTRAINT "categorias_seguro_aseguradoraId_fkey" FOREIGN KEY ("aseguradoraId") REFERENCES "aseguradoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifas_cobertura" ADD CONSTRAINT "tarifas_cobertura_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifas_cobertura" ADD CONSTRAINT "tarifas_cobertura_categoriaSeguroId_fkey" FOREIGN KEY ("categoriaSeguroId") REFERENCES "categorias_seguro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifas_cobertura" ADD CONSTRAINT "tarifas_cobertura_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
