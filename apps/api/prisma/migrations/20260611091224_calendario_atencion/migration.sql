-- CreateEnum
CREATE TYPE "TipoDisponibilidad" AS ENUM ('DISPONIBLE', 'VACACIONES', 'AUSENCIA', 'CAPACITACION', 'REUNION', 'BLOQUEADO');

-- CreateTable
CREATE TABLE "series_disponibilidad" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "diasSemana" INTEGER[],
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "tipo" "TipoDisponibilidad" NOT NULL DEFAULT 'DISPONIBLE',
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "series_disponibilidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disponibilidades" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "tipo" "TipoDisponibilidad" NOT NULL DEFAULT 'DISPONIBLE',
    "nota" TEXT,
    "serieId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "disponibilidades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "series_disponibilidad_consultorioId_doctorId_idx" ON "series_disponibilidad"("consultorioId", "doctorId");

-- CreateIndex
CREATE INDEX "disponibilidades_consultorioId_fecha_idx" ON "disponibilidades"("consultorioId", "fecha");

-- CreateIndex
CREATE INDEX "disponibilidades_consultorioId_doctorId_fecha_idx" ON "disponibilidades"("consultorioId", "doctorId", "fecha");

-- AddForeignKey
ALTER TABLE "series_disponibilidad" ADD CONSTRAINT "series_disponibilidad_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_disponibilidad" ADD CONSTRAINT "series_disponibilidad_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilidades" ADD CONSTRAINT "disponibilidades_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilidades" ADD CONSTRAINT "disponibilidades_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilidades" ADD CONSTRAINT "disponibilidades_serieId_fkey" FOREIGN KEY ("serieId") REFERENCES "series_disponibilidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

