-- AlterTable
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "publicado" BOOLEAN DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_productos_publicado" ON "productos"("publicado");
