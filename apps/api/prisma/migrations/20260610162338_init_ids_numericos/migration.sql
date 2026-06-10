-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'SECRETARIA', 'DOCTOR', 'CAJA');

-- CreateEnum
CREATE TYPE "EstadoCita" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'LLEGO', 'EN_ATENCION', 'ATENDIDA', 'COBRADO', 'CON_DEUDA', 'CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA');

-- CreateEnum
CREATE TYPE "EstadoCobro" AS ENUM ('PENDIENTE', 'PARCIAL', 'COMPLETO');

-- CreateEnum
CREATE TYPE "FormaPago" AS ENUM ('EFECTIVO', 'QR', 'TARJETA', 'VALES');

-- CreateEnum
CREATE TYPE "AccionLog" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATE_CHANGE', 'PAYMENT');

-- CreateTable
CREATE TABLE "consultorios" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "logoUrl" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "plan" TEXT NOT NULL DEFAULT 'free',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "duracionMin" INTEGER NOT NULL,
    "precioBase" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctores" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "nombre" TEXT NOT NULL,
    "especialidad" TEXT,
    "colorAgenda" TEXT NOT NULL DEFAULT '#3B82F6',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horarios_atencion" (
    "id" SERIAL NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "horarios_atencion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacientes" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "dni" TEXT,
    "telefono" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "fechaNacimiento" DATE,
    "sexo" TEXT,
    "direccion" TEXT,
    "notas" TEXT,
    "deudaTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citas" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "servicioId" INTEGER NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL,
    "duracionMin" INTEGER NOT NULL,
    "estado" "EstadoCita" NOT NULL DEFAULT 'PENDIENTE',
    "notasSecretaria" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "citas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atenciones" (
    "id" SERIAL NOT NULL,
    "citaId" INTEGER NOT NULL,
    "motivo" TEXT,
    "diagnostico" TEXT,
    "tratamiento" TEXT,
    "evolucion" TEXT,
    "proximoControl" DATE,
    "adjuntos" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atenciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recetas" (
    "id" SERIAL NOT NULL,
    "atencionId" INTEGER NOT NULL,
    "contenido" JSONB NOT NULL,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobros" (
    "id" SERIAL NOT NULL,
    "citaId" INTEGER NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "saldoPendiente" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoCobro" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cobros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" SERIAL NOT NULL,
    "cobroId" INTEGER NOT NULL,
    "formaPago" "FormaPago" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "referencia" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja_diaria" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "usuarioAperturaId" INTEGER NOT NULL,
    "usuarioCierreId" INTEGER,
    "totalEfectivo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalQr" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalVales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalTarjeta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalGeneral" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cerrada" BOOLEAN NOT NULL DEFAULT false,
    "cierreAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caja_diaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" SERIAL NOT NULL,
    "consultorioId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "entidad" TEXT NOT NULL,
    "entidadId" INTEGER NOT NULL,
    "accion" "AccionLog" NOT NULL,
    "payloadAntes" JSONB,
    "payloadDespues" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usuarios_consultorioId_idx" ON "usuarios"("consultorioId");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_consultorioId_key" ON "usuarios"("email", "consultorioId");

-- CreateIndex
CREATE INDEX "servicios_consultorioId_idx" ON "servicios"("consultorioId");

-- CreateIndex
CREATE UNIQUE INDEX "doctores_usuarioId_key" ON "doctores"("usuarioId");

-- CreateIndex
CREATE INDEX "doctores_consultorioId_idx" ON "doctores"("consultorioId");

-- CreateIndex
CREATE INDEX "horarios_atencion_doctorId_idx" ON "horarios_atencion"("doctorId");

-- CreateIndex
CREATE INDEX "pacientes_consultorioId_apellido_nombre_idx" ON "pacientes"("consultorioId", "apellido", "nombre");

-- CreateIndex
CREATE INDEX "pacientes_consultorioId_dni_idx" ON "pacientes"("consultorioId", "dni");

-- CreateIndex
CREATE INDEX "pacientes_consultorioId_whatsapp_idx" ON "pacientes"("consultorioId", "whatsapp");

-- CreateIndex
CREATE INDEX "citas_consultorioId_fechaHora_idx" ON "citas"("consultorioId", "fechaHora");

-- CreateIndex
CREATE INDEX "citas_consultorioId_doctorId_fechaHora_idx" ON "citas"("consultorioId", "doctorId", "fechaHora");

-- CreateIndex
CREATE INDEX "citas_consultorioId_pacienteId_idx" ON "citas"("consultorioId", "pacienteId");

-- CreateIndex
CREATE INDEX "citas_consultorioId_estado_idx" ON "citas"("consultorioId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "atenciones_citaId_key" ON "atenciones"("citaId");

-- CreateIndex
CREATE UNIQUE INDEX "cobros_citaId_key" ON "cobros"("citaId");

-- CreateIndex
CREATE INDEX "cobros_consultorioId_idx" ON "cobros"("consultorioId");

-- CreateIndex
CREATE INDEX "cobros_consultorioId_estado_idx" ON "cobros"("consultorioId", "estado");

-- CreateIndex
CREATE INDEX "pagos_cobroId_idx" ON "pagos"("cobroId");

-- CreateIndex
CREATE INDEX "caja_diaria_consultorioId_idx" ON "caja_diaria"("consultorioId");

-- CreateIndex
CREATE UNIQUE INDEX "caja_diaria_consultorioId_fecha_key" ON "caja_diaria"("consultorioId", "fecha");

-- CreateIndex
CREATE INDEX "logs_consultorioId_entidad_entidadId_idx" ON "logs"("consultorioId", "entidad", "entidadId");

-- CreateIndex
CREATE INDEX "logs_consultorioId_createdAt_idx" ON "logs"("consultorioId", "createdAt");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctores" ADD CONSTRAINT "doctores_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctores" ADD CONSTRAINT "doctores_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horarios_atencion" ADD CONSTRAINT "horarios_atencion_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "citas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_atencionId_fkey" FOREIGN KEY ("atencionId") REFERENCES "atenciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "citas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "cobros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_diaria" ADD CONSTRAINT "caja_diaria_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_diaria" ADD CONSTRAINT "caja_diaria_usuarioAperturaId_fkey" FOREIGN KEY ("usuarioAperturaId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_diaria" ADD CONSTRAINT "caja_diaria_usuarioCierreId_fkey" FOREIGN KEY ("usuarioCierreId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_consultorioId_fkey" FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
