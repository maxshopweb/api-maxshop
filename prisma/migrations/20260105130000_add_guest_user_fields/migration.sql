-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "email_temporal" VARCHAR(255);

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "es_anonimo" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "activo" BOOLEAN DEFAULT true;

-- Actualizar valores existentes
UPDATE "usuarios" SET "es_anonimo" = false WHERE "es_anonimo" IS NULL;
UPDATE "usuarios" SET "activo" = true WHERE "activo" IS NULL;

