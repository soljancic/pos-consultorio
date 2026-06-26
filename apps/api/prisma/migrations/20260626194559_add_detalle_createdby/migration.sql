-- AlterTable
ALTER TABLE "detalle_cobros" ADD COLUMN     "createdById" INTEGER;

-- AddForeignKey
ALTER TABLE "detalle_cobros" ADD CONSTRAINT "detalle_cobros_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
