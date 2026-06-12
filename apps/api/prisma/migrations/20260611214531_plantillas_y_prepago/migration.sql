-- AlterTable
ALTER TABLE "pacientes" ADD COLUMN     "requierePrepago" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "plantillas_horario" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "plantillas_horario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plantillas_horario_consultorioId_idx" ON "plantillas_horario"("consultorioId");

-- AddForeignKey
ALTER TABLE "plantillas_horario" ADD CONSTRAINT "plantillas_horario_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;