-- QR de pagos del consultorio: imagen subida a Cloudinary, visible para el
-- paciente en la pagina publica /qr/:slug
ALTER TABLE "consultorios" ADD COLUMN "qrUrl" TEXT;
