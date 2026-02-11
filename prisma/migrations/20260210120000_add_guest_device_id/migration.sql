-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "guest_device_id" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_guest_device_id_key" ON "usuarios"("guest_device_id");
