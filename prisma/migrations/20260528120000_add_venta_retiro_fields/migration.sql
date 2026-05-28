-- Retiro en tienda: aviso al cliente y marca de retirado
ALTER TABLE "venta" ADD COLUMN IF NOT EXISTS "listo_retiro_avisado_en" TIMESTAMP(6);
ALTER TABLE "venta" ADD COLUMN IF NOT EXISTS "retirado_en" TIMESTAMP(6);
ALTER TABLE "venta" ADD COLUMN IF NOT EXISTS "motivo_cancelacion" VARCHAR(500);
