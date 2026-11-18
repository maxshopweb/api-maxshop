-- Descuento global por transferencia (config tienda) y monto aplicado en venta
ALTER TABLE "negocio" ADD COLUMN IF NOT EXISTS "descuento_transferencia_activo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "negocio" ADD COLUMN IF NOT EXISTS "descuento_transferencia_pct" DECIMAL(5,2);

ALTER TABLE "venta" ADD COLUMN IF NOT EXISTS "descuento_transferencia" DECIMAL(10,2);
