-- AlterTable: add explicit toggles for business promo rules in negocio
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'negocio'
      AND column_name = 'envio_gratis_activo'
  ) THEN
    ALTER TABLE "negocio" ADD COLUMN "envio_gratis_activo" BOOLEAN NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'negocio'
      AND column_name = 'cuotas_sin_interes_activo'
  ) THEN
    ALTER TABLE "negocio" ADD COLUMN "cuotas_sin_interes_activo" BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- Backfill defensive (existing rows remain active by default)
UPDATE "negocio"
SET
  "envio_gratis_activo" = COALESCE("envio_gratis_activo", true),
  "cuotas_sin_interes_activo" = COALESCE("cuotas_sin_interes_activo", true)
WHERE
  "envio_gratis_activo" IS NULL
  OR "cuotas_sin_interes_activo" IS NULL;
