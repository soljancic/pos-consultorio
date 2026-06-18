-- Tabla legacy reemplazada por el Calendario de Atencion (Disponibilidad /
-- SerieDisponibilidad). Sin lectura util (el include en doctores.findAll no lo
-- consumia el frontend) ni escritura viva (el endpoint POST /doctores/:id/horarios
-- nunca se llamaba). Se elimina el modelo HorarioAtencion.

-- DropForeignKey
ALTER TABLE IF EXISTS "horarios_atencion" DROP CONSTRAINT IF EXISTS "horarios_atencion_doctorId_fkey";

-- DropTable
DROP TABLE IF EXISTS "horarios_atencion";
