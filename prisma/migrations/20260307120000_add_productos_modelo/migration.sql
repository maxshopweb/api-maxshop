-- AlterTable: add modelo to productos (COPRARTI from MAESARTI; optional, some products have none)
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "modelo" VARCHAR(50);
