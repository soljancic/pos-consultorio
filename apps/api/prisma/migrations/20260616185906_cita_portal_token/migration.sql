/*
  Warnings:

  - A unique constraint covering the columns `[portalToken]` on the table `citas` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "portalToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "citas_portalToken_key" ON "citas"("portalToken");
