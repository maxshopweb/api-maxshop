-- Etapa 1: Precio manual (lista E) y bonificación
-- Productos: precio_manual (precio cuando lista_precio_activa = 'E'), codi_bonificacion
-- venta_detalle: codi_bonificacion

ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "precio_manual" DECIMAL(19,6);
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "codi_bonificacion" VARCHAR(10);

ALTER TABLE "venta-detalle" ADD COLUMN IF NOT EXISTS "codi_bonificacion" VARCHAR(10);
