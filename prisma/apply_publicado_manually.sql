-- Añade la columna publicado a productos (misma lógica que 20260205120000_add_productos_publicado).
-- Ejecutar contra la BD que usa el backend si migrate deploy no se puede usar (ej. P3005).
-- Ejemplo: psql -U postgres -d maxshop -f prisma/apply_publicado_manually.sql

ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "publicado" BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS "idx_productos_publicado" ON "productos"("publicado");
