-- AlterTable: add installment_amount to mercado_pago_payments (monto por cuota desde MP transaction_details)
ALTER TABLE "mercado_pago_payments" ADD COLUMN IF NOT EXISTS "installment_amount" DECIMAL(12,2);
