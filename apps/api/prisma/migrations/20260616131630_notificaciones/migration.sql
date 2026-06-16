-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('NUEVA_CITA', 'CITA_CANCELADA', 'CITA_REPROGRAMADA', 'PACIENTE_EN_ESPERA');

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "citaId" INTEGER,
    "destinoUsuarioId" INTEGER,
    "leidaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_consultorioId_destinoUsuarioId_leidaAt_idx" ON "notificaciones"("consultorioId", "destinoUsuarioId", "leidaAt");

-- CreateIndex
CREATE INDEX "notificaciones_consultorioId_createdAt_idx" ON "notificaciones"("consultorioId", "createdAt");

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "citas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_destinoUsuarioId_fkey" FOREIGN KEY ("destinoUsuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
