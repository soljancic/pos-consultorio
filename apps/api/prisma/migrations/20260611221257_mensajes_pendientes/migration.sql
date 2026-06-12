-- CreateEnum
CREATE TYPE "TipoMensaje" AS ENUM ('RECORDATORIO', 'DEUDA');

-- CreateEnum
CREATE TYPE "EstadoMensaje" AS ENUM ('PENDIENTE', 'ENVIADO', 'OMITIDO');

-- CreateTable
CREATE TABLE "mensajes_pendientes" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "citaId" INTEGER,
    "tipo" "TipoMensaje" NOT NULL,
    "estado" "EstadoMensaje" NOT NULL DEFAULT 'PENDIENTE',
    "detalle" TEXT,
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltoAt" TIMESTAMP(3),
    "resueltoPorId" INTEGER,

    CONSTRAINT "mensajes_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensajes_pendientes_consultorioId_estado_idx" ON "mensajes_pendientes"("consultorioId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "mensajes_pendientes_citaId_tipo_key" ON "mensajes_pendientes"("citaId", "tipo");

-- AddForeignKey
ALTER TABLE "mensajes_pendientes" ADD CONSTRAINT "mensajes_pendientes_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_pendientes" ADD CONSTRAINT "mensajes_pendientes_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_pendientes" ADD CONSTRAINT "mensajes_pendientes_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "citas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_pendientes" ADD CONSTRAINT "mensajes_pendientes_resueltoPorId_fkey" FOREIGN KEY ("resueltoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

