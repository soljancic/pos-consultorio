-- CreateEnum
CREATE TYPE "OrigenCita" AS ENUM ('INTERNO', 'PORTAL');

-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "origen" "OrigenCita" NOT NULL DEFAULT 'INTERNO';

-- AlterTable
ALTER TABLE "consultorios" ADD COLUMN     "portalActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "consultorios_slug_key" ON "consultorios"("slug");

