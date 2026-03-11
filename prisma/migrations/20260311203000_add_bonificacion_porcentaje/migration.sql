-- Bonificación porcentual (0-100) para productos y detalle de venta.
-- Mantiene columnas legacy codi_bonificacion sin borrarlas para compatibilidad.

ALTER TABLE "productos"
ADD COLUMN IF NOT EXISTS "bonificacion_porcentaje" DECIMAL(5,2);

ALTER TABLE "venta-detalle"
ADD COLUMN IF NOT EXISTS "bonificacion_porcentaje" DECIMAL(5,2);

-- Migración best-effort desde codi_bonificacion cuando contiene un número válido.
UPDATE "productos"
SET "bonificacion_porcentaje" = NULLIF(regexp_replace("codi_bonificacion", '[^0-9\.\-]', '', 'g'), '')::DECIMAL(5,2)
WHERE "bonificacion_porcentaje" IS NULL
  AND "codi_bonificacion" IS NOT NULL
  AND regexp_replace("codi_bonificacion", '[^0-9\.\-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$';

UPDATE "venta-detalle"
SET "bonificacion_porcentaje" = NULLIF(regexp_replace("codi_bonificacion", '[^0-9\.\-]', '', 'g'), '')::DECIMAL(5,2)
WHERE "bonificacion_porcentaje" IS NULL
  AND "codi_bonificacion" IS NOT NULL
  AND regexp_replace("codi_bonificacion", '[^0-9\.\-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$';
