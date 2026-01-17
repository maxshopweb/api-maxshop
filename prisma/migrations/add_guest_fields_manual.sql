-- ============================================
-- MIGRACIÓN MANUAL: Agregar campos de usuario invitado
-- ============================================
-- Ejecutar este script directamente en tu base de datos PostgreSQL
-- o usar: psql -U tu_usuario -d tu_base_de_datos -f add_guest_fields_manual.sql

-- Agregar columna email_temporal (si no existe)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'usuarios' AND column_name = 'email_temporal'
    ) THEN
        ALTER TABLE "usuarios" ADD COLUMN "email_temporal" VARCHAR(255);
    END IF;
END $$;

-- Agregar columna es_anonimo (si no existe)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'usuarios' AND column_name = 'es_anonimo'
    ) THEN
        ALTER TABLE "usuarios" ADD COLUMN "es_anonimo" BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Agregar columna activo (si no existe)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'usuarios' AND column_name = 'activo'
    ) THEN
        ALTER TABLE "usuarios" ADD COLUMN "activo" BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Actualizar valores existentes
UPDATE "usuarios" 
SET "es_anonimo" = false 
WHERE "es_anonimo" IS NULL;

UPDATE "usuarios" 
SET "activo" = true 
WHERE "activo" IS NULL;

-- Verificar que las columnas se crearon correctamente
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'usuarios' 
  AND column_name IN ('email_temporal', 'es_anonimo', 'activo');

