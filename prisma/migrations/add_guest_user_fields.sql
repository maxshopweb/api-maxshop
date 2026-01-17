-- Migración para agregar campos de usuario invitado
-- Campos: email_temporal, es_anonimo, activo

-- Agregar columna email_temporal
ALTER TABLE "usuarios" 
ADD COLUMN IF NOT EXISTS "email_temporal" VARCHAR(255);

-- Agregar columna es_anonimo con valor por defecto false
ALTER TABLE "usuarios" 
ADD COLUMN IF NOT EXISTS "es_anonimo" BOOLEAN DEFAULT false;

-- Agregar columna activo con valor por defecto true
ALTER TABLE "usuarios" 
ADD COLUMN IF NOT EXISTS "activo" BOOLEAN DEFAULT true;

-- Actualizar valores existentes: todos los usuarios actuales no son anónimos y están activos
UPDATE "usuarios" 
SET "es_anonimo" = false 
WHERE "es_anonimo" IS NULL;

UPDATE "usuarios" 
SET "activo" = true 
WHERE "activo" IS NULL;

