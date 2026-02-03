-- Productos: listas de precio (precio_venta, precio_especial, precio_pvp, precio_campanya, lista_precio_activa)
-- 1. Añadir nuevas columnas
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "precio_venta" DECIMAL(19,6);
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "precio_especial" DECIMAL(19,6);
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "precio_pvp" DECIMAL(19,6);
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "precio_campanya" DECIMAL(19,6);
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "lista_precio_activa" VARCHAR(1);

-- 2. Migrar datos: precio -> precio_venta, lista activa por defecto V
UPDATE "productos" SET "precio_venta" = "precio", "lista_precio_activa" = 'V' WHERE "precio" IS NOT NULL;
UPDATE "productos" SET "lista_precio_activa" = 'V' WHERE "lista_precio_activa" IS NULL;

-- 3. Eliminar columnas antiguas
ALTER TABLE "productos" DROP COLUMN IF EXISTS "precio";
ALTER TABLE "productos" DROP COLUMN IF EXISTS "precio_sin_iva";
ALTER TABLE "productos" DROP COLUMN IF EXISTS "iva_monto";
ALTER TABLE "productos" DROP COLUMN IF EXISTS "id_interno";
ALTER TABLE "productos" DROP COLUMN IF EXISTS "cod_sku";
ALTER TABLE "productos" DROP COLUMN IF EXISTS "modelo";
ALTER TABLE "productos" DROP COLUMN IF EXISTS "precio_mayorista";
ALTER TABLE "productos" DROP COLUMN IF EXISTS "precio_minorista";
ALTER TABLE "productos" DROP COLUMN IF EXISTS "precio_evento";
ALTER TABLE "productos" DROP COLUMN IF EXISTS "stock_mayorista";
