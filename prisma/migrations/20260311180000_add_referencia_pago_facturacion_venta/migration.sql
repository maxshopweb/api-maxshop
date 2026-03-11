-- AlterTable
ALTER TABLE "venta" ADD COLUMN IF NOT EXISTS "referencia_pago_manual" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "referencia_facturacion" VARCHAR(100);
