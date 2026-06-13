-- Precio por doctor y servicio (override del precioBase). Tabla aditiva: la
-- membresia doctor-servicio sigue en el M2M implicito _DoctorServicios.
CREATE TABLE "doctor_servicio_precios" (
    "id" SERIAL NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "servicioId" INTEGER NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "doctor_servicio_precios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "doctor_servicio_precios_doctorId_servicioId_key" ON "doctor_servicio_precios"("doctorId", "servicioId");
CREATE INDEX "doctor_servicio_precios_doctorId_idx" ON "doctor_servicio_precios"("doctorId");

ALTER TABLE "doctor_servicio_precios" ADD CONSTRAINT "doctor_servicio_precios_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_servicio_precios" ADD CONSTRAINT "doctor_servicio_precios_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
