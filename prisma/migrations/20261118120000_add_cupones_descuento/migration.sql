-- Cupones de descuento (checkout) y canjes
CREATE TABLE IF NOT EXISTS "cupones" (
    "id_cupon" SERIAL NOT NULL,
    "codigo" VARCHAR(64) NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "monto_minimo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "usos_maximos" INTEGER NOT NULL DEFAULT 1,
    "usos_actuales" INTEGER NOT NULL DEFAULT 0,
    "fecha_inicio" TIMESTAMP(6),
    "fecha_fin" TIMESTAMP(6),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cupones_pkey" PRIMARY KEY ("id_cupon")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cupones_codigo_key" ON "cupones"("codigo");
CREATE INDEX IF NOT EXISTS "idx_cupones_activo" ON "cupones"("activo");
CREATE INDEX IF NOT EXISTS "idx_cupones_activo_codigo" ON "cupones"("activo", "codigo");

ALTER TABLE "venta" ADD COLUMN IF NOT EXISTS "id_cupon" INTEGER;
ALTER TABLE "venta" ADD COLUMN IF NOT EXISTS "codigo_cupon" VARCHAR(64);
ALTER TABLE "venta" ADD COLUMN IF NOT EXISTS "descuento_cupon" DECIMAL(10,2);

CREATE INDEX IF NOT EXISTS "idx_venta_cupon" ON "venta"("id_cupon");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venta_id_cupon_fkey'
  ) THEN
    ALTER TABLE "venta"
      ADD CONSTRAINT "venta_id_cupon_fkey"
      FOREIGN KEY ("id_cupon") REFERENCES "cupones"("id_cupon")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "cupon_canjes" (
    "id_canje" SERIAL NOT NULL,
    "id_cupon" INTEGER NOT NULL,
    "id_venta" INTEGER NOT NULL,
    "monto_aplicado" DECIMAL(10,2) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'aplicado',
    "creado_en" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liberado_en" TIMESTAMP(6),
    CONSTRAINT "cupon_canjes_pkey" PRIMARY KEY ("id_canje")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uk_cupon_canjes_venta" ON "cupon_canjes"("id_venta");
CREATE INDEX IF NOT EXISTS "idx_cupon_canjes_cupon" ON "cupon_canjes"("id_cupon");
CREATE INDEX IF NOT EXISTS "idx_cupon_canjes_estado" ON "cupon_canjes"("estado");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cupon_canjes_id_cupon_fkey'
  ) THEN
    ALTER TABLE "cupon_canjes"
      ADD CONSTRAINT "cupon_canjes_id_cupon_fkey"
      FOREIGN KEY ("id_cupon") REFERENCES "cupones"("id_cupon")
      ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cupon_canjes_id_venta_fkey'
  ) THEN
    ALTER TABLE "cupon_canjes"
      ADD CONSTRAINT "cupon_canjes_id_venta_fkey"
      FOREIGN KEY ("id_venta") REFERENCES "venta"("id_venta")
      ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
END $$;
