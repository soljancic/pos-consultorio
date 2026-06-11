-- CreateTable
CREATE TABLE "_DoctorServicios" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_DoctorServicios_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_DoctorServicios_B_index" ON "_DoctorServicios"("B");

-- AddForeignKey
ALTER TABLE "_DoctorServicios" ADD CONSTRAINT "_DoctorServicios_A_fkey" FOREIGN KEY ("A") REFERENCES "doctores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DoctorServicios" ADD CONSTRAINT "_DoctorServicios_B_fkey" FOREIGN KEY ("B") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;