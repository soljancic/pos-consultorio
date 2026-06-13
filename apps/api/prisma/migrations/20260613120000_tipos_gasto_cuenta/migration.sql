-- Catalogos por consultorio: TipoGasto y TipoCuenta reemplazan los enums
-- CategoriaGasto/CuentaGasto. Migra los gastos existentes sin perdida.

-- 1) Tablas nuevas
CREATE TABLE "tipos_gasto" (
  "id" SERIAL NOT NULL,
  "consultorioId" INTEGER NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tipos_gasto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tipos_gasto_consultorioId_idx" ON "tipos_gasto"("consultorioId");
ALTER TABLE "tipos_gasto" ADD CONSTRAINT "tipos_gasto_consultorioId_fkey"
  FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "tipos_cuenta" (
  "id" SERIAL NOT NULL,
  "consultorioId" INTEGER NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "esEfectivo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tipos_cuenta_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tipos_cuenta_consultorioId_idx" ON "tipos_cuenta"("consultorioId");
ALTER TABLE "tipos_cuenta" ADD CONSTRAINT "tipos_cuenta_consultorioId_fkey"
  FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Sembrar defaults por consultorio existente
INSERT INTO "tipos_gasto" ("consultorioId", "nombre", "updatedAt")
SELECT c."id", v.nombre, CURRENT_TIMESTAMP
FROM "consultorios" c
CROSS JOIN (VALUES ('Insumos'),('Sueldos'),('Alquiler'),('Servicios'),('Impuestos'),('Otros')) AS v(nombre);

INSERT INTO "tipos_cuenta" ("consultorioId", "nombre", "esEfectivo", "updatedAt")
SELECT c."id", v.nombre, v.efectivo, CURRENT_TIMESTAMP
FROM "consultorios" c
CROSS JOIN (VALUES ('Caja efectivo', true),('Banco', false),('Otro', false)) AS v(nombre, efectivo);

-- 3) Columnas FK nullable temporal
ALTER TABLE "gastos" ADD COLUMN "tipoGastoId" INTEGER;
ALTER TABLE "gastos" ADD COLUMN "tipoCuentaId" INTEGER;

-- 4) Mapear enum -> FK por nombre del default
UPDATE "gastos" g SET "tipoGastoId" = tg."id"
FROM "tipos_gasto" tg
WHERE tg."consultorioId" = g."consultorioId" AND tg."nombre" = (
  CASE g."categoria"
    WHEN 'INSUMOS' THEN 'Insumos' WHEN 'SUELDOS' THEN 'Sueldos'
    WHEN 'ALQUILER' THEN 'Alquiler' WHEN 'SERVICIOS' THEN 'Servicios'
    WHEN 'IMPUESTOS' THEN 'Impuestos' ELSE 'Otros' END);

UPDATE "gastos" g SET "tipoCuentaId" = tc."id"
FROM "tipos_cuenta" tc
WHERE tc."consultorioId" = g."consultorioId" AND tc."nombre" = (
  CASE g."cuenta"
    WHEN 'CAJA_EFECTIVO' THEN 'Caja efectivo' WHEN 'BANCO' THEN 'Banco' ELSE 'Otro' END);

-- 5) NOT NULL + FKs
ALTER TABLE "gastos" ALTER COLUMN "tipoGastoId" SET NOT NULL;
ALTER TABLE "gastos" ALTER COLUMN "tipoCuentaId" SET NOT NULL;
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_tipoGastoId_fkey"
  FOREIGN KEY ("tipoGastoId") REFERENCES "tipos_gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_tipoCuentaId_fkey"
  FOREIGN KEY ("tipoCuentaId") REFERENCES "tipos_cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6) Drop columnas y enums viejos
ALTER TABLE "gastos" DROP COLUMN "categoria";
ALTER TABLE "gastos" DROP COLUMN "cuenta";
DROP TYPE "CategoriaGasto";
DROP TYPE "CuentaGasto";
