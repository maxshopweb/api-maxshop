-- Migración de datos: homogeneizar cod_interno al formato "MAX-00000001"
-- Actualiza ventas con cod_interno NULL o con formato antiguo (8 dígitos) al nuevo formato.
UPDATE "venta"
SET "cod_interno" = 'MAX-' || lpad("id_venta"::text, 8, '0')
WHERE "cod_interno" IS NULL
   OR "cod_interno" NOT LIKE 'MAX-%';
