-- Añade la columna precio_editado_manualmente a la tabla productos.
-- Ejecutar con: psql $DATABASE_URL -f prisma/add_precio_editado_manualmente.sql
-- O con Prisma (si tu schema valida): npx prisma db execute --file prisma/add_precio_editado_manualmente.sql --schema prisma/schema.prisma
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "precio_editado_manualmente" BOOLEAN DEFAULT false;
