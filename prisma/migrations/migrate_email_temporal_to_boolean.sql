-- ============================================
-- MIGRACIÓN: Cambiar email_temporal (VARCHAR) a email_no_verificado (BOOLEAN)
-- ============================================
-- Este script migra los datos existentes y cambia la estructura de la tabla

-- Paso 1: Migrar datos existentes
-- Si hay usuarios con email_temporal pero sin email, copiar email_temporal a email
UPDATE "usuarios" 
SET "email" = "email_temporal"
WHERE "email" IS NULL 
  AND "email_temporal" IS NOT NULL;

-- Paso 2: Agregar columna email_no_verificado (si no existe)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'usuarios' AND column_name = 'email_no_verificado'
    ) THEN
        ALTER TABLE "usuarios" ADD COLUMN "email_no_verificado" BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Paso 3: Marcar emails de invitados como no verificados
UPDATE "usuarios" 
SET "email_no_verificado" = true 
WHERE "es_anonimo" = true 
  AND "email" IS NOT NULL;

-- Paso 4: Marcar usuarios con email_temporal como no verificados (antes de eliminar la columna)
UPDATE "usuarios" 
SET "email_no_verificado" = true 
WHERE "email_temporal" IS NOT NULL 
  AND "email_no_verificado" = false;

-- Paso 5: Eliminar columna email_temporal (VARCHAR) si existe
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'usuarios' AND column_name = 'email_temporal'
    ) THEN
        ALTER TABLE "usuarios" DROP COLUMN "email_temporal";
    END IF;
END $$;

-- Paso 6: Actualizar valores NULL de email_no_verificado
UPDATE "usuarios" 
SET "email_no_verificado" = false 
WHERE "email_no_verificado" IS NULL;

-- Verificar que la migración se completó correctamente
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'usuarios' 
  AND column_name IN ('email', 'email_no_verificado', 'es_anonimo')
ORDER BY column_name;

