-- AlterTable: ensure negocio config columns exist and cuotas_sin_interes is DECIMAL (was Int in schema)
-- Add columns if missing (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'negocio' AND column_name = 'envio_gratis_minimo'
  ) THEN
    ALTER TABLE "negocio" ADD COLUMN "envio_gratis_minimo" DECIMAL(12,2);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'negocio' AND column_name = 'cuotas_sin_interes_minimo'
  ) THEN
    ALTER TABLE "negocio" ADD COLUMN "cuotas_sin_interes_minimo" DECIMAL(12,2);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'negocio' AND column_name = 'cuotas_sin_interes'
  ) THEN
    ALTER TABLE "negocio" ADD COLUMN "cuotas_sin_interes" DECIMAL(12,2);
  ELSE
    -- Column exists: ensure type is DECIMAL (in case it was INTEGER)
    ALTER TABLE "negocio" ALTER COLUMN "cuotas_sin_interes" TYPE DECIMAL(12,2) USING cuotas_sin_interes::numeric(12,2);
  END IF;
END $$;
