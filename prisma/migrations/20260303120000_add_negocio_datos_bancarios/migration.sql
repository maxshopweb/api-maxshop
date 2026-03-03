-- AlterTable: add datos bancarios to negocio (transferencia / efectivo)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'negocio' AND column_name = 'banco') THEN
    ALTER TABLE "negocio" ADD COLUMN "banco" VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'negocio' AND column_name = 'tipo_cuenta') THEN
    ALTER TABLE "negocio" ADD COLUMN "tipo_cuenta" VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'negocio' AND column_name = 'numero_cuenta') THEN
    ALTER TABLE "negocio" ADD COLUMN "numero_cuenta" VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'negocio' AND column_name = 'cbu') THEN
    ALTER TABLE "negocio" ADD COLUMN "cbu" VARCHAR(22);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'negocio' AND column_name = 'alias') THEN
    ALTER TABLE "negocio" ADD COLUMN "alias" VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'negocio' AND column_name = 'instrucciones') THEN
    ALTER TABLE "negocio" ADD COLUMN "instrucciones" VARCHAR(500);
  END IF;
END $$;
