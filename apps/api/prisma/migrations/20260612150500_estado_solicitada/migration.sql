-- Estado SOLICITADA: reserva del portal sin revisar. La secretaria valida
-- los datos y la pasa a PENDIENTE (o la cancela). Las manuales nacen PENDIENTE.
ALTER TYPE "EstadoCita" ADD VALUE 'SOLICITADA' BEFORE 'PENDIENTE';
