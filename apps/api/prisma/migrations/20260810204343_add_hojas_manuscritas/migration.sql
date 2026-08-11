-- CreateTable
CREATE TABLE "hojas_manuscritas" (
    "id" SERIAL NOT NULL,
    "atencionId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "trazos" JSONB NOT NULL,
    "transcripcion" TEXT,
    "transcritoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "hojas_manuscritas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hojas_manuscritas_atencionId_orden_key" ON "hojas_manuscritas"("atencionId", "orden");

-- CreateIndex
CREATE INDEX "hojas_manuscritas_atencionId_idx" ON "hojas_manuscritas"("atencionId");

-- AddForeignKey
ALTER TABLE "hojas_manuscritas" ADD CONSTRAINT "hojas_manuscritas_atencionId_fkey" FOREIGN KEY ("atencionId") REFERENCES "atenciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
