-- AlterTable: cuotas_habilitadas en productos (null = regla general, true = siempre 3 cuotas, false = no 3 cuotas)
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "cuotas_habilitadas" BOOLEAN;
