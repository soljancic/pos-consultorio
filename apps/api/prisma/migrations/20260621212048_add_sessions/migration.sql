-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "familia" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiraAt" TIMESTAMP(3) NOT NULL,
    "revocadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_usuarioId_idx" ON "sessions"("usuarioId");

-- CreateIndex
CREATE INDEX "sessions_familia_idx" ON "sessions"("familia");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
