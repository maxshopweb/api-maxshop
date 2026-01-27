/*
  Warnings:

  - You are about to drop the column `email_temporal` on the `usuarios` table. All the data in the column will be lost.
  - You are about to drop the column `token` on the `usuarios` table. All the data in the column will be lost.
  - You are about to drop the column `token_expira` on the `usuarios` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."usuarios" DROP CONSTRAINT "usuarios_id_rol_fkey";

-- DropIndex
DROP INDEX "public"."usuarios_id_usuario_key";

-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "altura" VARCHAR(20),
ADD COLUMN     "dpto" VARCHAR(20),
ADD COLUMN     "piso" VARCHAR(20);

-- AlterTable
ALTER TABLE "negocio" ALTER COLUMN "token_envio" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "email_temporal",
DROP COLUMN "token",
DROP COLUMN "token_expira",
ADD COLUMN     "email_no_verificado" BOOLEAN DEFAULT false,
ALTER COLUMN "nombre" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "apellido" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "login_ip" SET DATA TYPE VARCHAR(100);

-- CreateTable
CREATE TABLE "direcciones" (
    "id_direccion" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_usuario" VARCHAR(150),
    "id_venta" INTEGER,
    "nombre" VARCHAR(100),
    "direccion" VARCHAR(255),
    "altura" VARCHAR(20),
    "piso" VARCHAR(20),
    "dpto" VARCHAR(20),
    "cod_postal" INTEGER,
    "ciudad" VARCHAR(100),
    "provincia" VARCHAR(100),
    "es_principal" BOOLEAN DEFAULT false,
    "activo" BOOLEAN DEFAULT true,
    "tipo" VARCHAR(20),
    "creado_en" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "direccion_formateada" VARCHAR(500),
    "pais" VARCHAR(100) DEFAULT 'Argentina',

    CONSTRAINT "direcciones_pkey" PRIMARY KEY ("id_direccion")
);

-- CreateTable
CREATE TABLE "lista_precio" (
    "id_lista" SERIAL NOT NULL,
    "codi_lista" VARCHAR(1) NOT NULL,
    "nombre" VARCHAR(15),
    "tipo_lista" VARCHAR(1),
    "venta_lista" VARCHAR(1),
    "activo_cuenta" BOOLEAN,
    "codi_forma_pago" VARCHAR(1),
    "activo_lista" VARCHAR(1),
    "porc_descuento" DECIMAL(5,2),
    "porc_descuento_m" DECIMAL(5,2),
    "valor_lista" DECIMAL(5,2),
    "activo" BOOLEAN DEFAULT true,
    "creado_en" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lista_precio_pkey" PRIMARY KEY ("id_lista")
);

-- CreateTable
CREATE TABLE "situacion_fiscal" (
    "id_sifi" SERIAL NOT NULL,
    "codi_sifi" VARCHAR(2) NOT NULL,
    "nombre" VARCHAR(25),
    "sim1_sifi" DECIMAL(5,2),
    "cuenta_venta" VARCHAR(6),
    "cuenta_compra" VARCHAR(6),
    "idis_sifi" VARCHAR(1),
    "idic_sifi" VARCHAR(1),
    "minimo_sifi" DECIMAL(15,2),
    "prbi_sifi" DECIMAL(5,2),
    "prse_sifi" DECIMAL(5,2),
    "codi_sucursal" VARCHAR(4),
    "codi_impuesto" VARCHAR(2),
    "menos_impuesto" VARCHAR(1),
    "activo" BOOLEAN DEFAULT true,
    "creado_en" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "situacion_fiscal_pkey" PRIMARY KEY ("id_sifi")
);

-- CreateTable
CREATE TABLE "provincia" (
    "id_provincia" SERIAL NOT NULL,
    "codi_provincia" VARCHAR(1) NOT NULL,
    "nombre" VARCHAR(20),
    "alicuota_1" DECIMAL(5,2),
    "alicuota_2" DECIMAL(5,2),
    "alicuota_3" DECIMAL(5,2),
    "alicuota_4" DECIMAL(5,2),
    "activo" BOOLEAN DEFAULT true,
    "creado_en" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provincia_pkey" PRIMARY KEY ("id_provincia")
);

-- CreateTable
CREATE TABLE "plataforma_pago" (
    "id_plataforma" SERIAL NOT NULL,
    "codi_plataforma" VARCHAR(2) NOT NULL,
    "nombre" VARCHAR(30),
    "tipo_plataforma" VARCHAR(1),
    "activo" BOOLEAN DEFAULT true,
    "creado_en" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plataforma_pago_pkey" PRIMARY KEY ("id_plataforma")
);

-- CreateTable
CREATE TABLE "forma_pago" (
    "id_forma_pago" SERIAL NOT NULL,
    "codi_forma_pago" VARCHAR(1) NOT NULL,
    "nombre" VARCHAR(20),
    "cuenta_venta" VARCHAR(6),
    "cuenta_compra" VARCHAR(6),
    "ico_banco" VARCHAR(1),
    "ipag_fopa" VARCHAR(1),
    "iven_fopa" VARCHAR(1),
    "iban_fopa" VARCHAR(1),
    "icaj_fopa" VARCHAR(1),
    "iuni_fopa" VARCHAR(1),
    "icom_fopa" VARCHAR(1),
    "idis_fopa" VARCHAR(1),
    "caja_fopa" VARCHAR(1),
    "debe_fopa" DECIMAL(19,2),
    "haber_fopa" DECIMAL(19,2),
    "codi_descuento" VARCHAR(2),
    "imod_descuento" VARCHAR(1),
    "itar_fopa" VARCHAR(1),
    "porc_fopa" DECIMAL(6,2),
    "activo" BOOLEAN DEFAULT true,
    "creado_en" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forma_pago_pkey" PRIMARY KEY ("id_forma_pago")
);

-- CreateTable
CREATE TABLE "mercado_pago_payments" (
    "id" BIGSERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "payment_id" VARCHAR(100) NOT NULL,
    "preference_id" VARCHAR(100),
    "external_reference" VARCHAR(255) NOT NULL,
    "status_mp" VARCHAR(50) NOT NULL,
    "status_detail" VARCHAR(100),
    "estado_venta_relacionado" VARCHAR(50),
    "payment_type_id" VARCHAR(50) NOT NULL,
    "payment_method_id" VARCHAR(50),
    "installments" INTEGER DEFAULT 1,
    "transaction_amount" DECIMAL(12,2) NOT NULL,
    "total_paid_amount" DECIMAL(12,2),
    "net_received_amount" DECIMAL(12,2),
    "commission_amount" DECIMAL(12,2),
    "fee_details" JSONB,
    "currency_id" VARCHAR(3) NOT NULL DEFAULT 'ARS',
    "operation_type" VARCHAR(50),
    "date_created" TIMESTAMP(6) NOT NULL,
    "date_approved" TIMESTAMP(6),
    "money_release_date" TIMESTAMP(6),
    "card_info" JSONB,
    "payer_info" JSONB,
    "processing_mode" VARCHAR(50),
    "live_mode" BOOLEAN NOT NULL DEFAULT false,
    "webhook_id" BIGINT,
    "webhook_processed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "mercado_pago_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failed_webhooks" (
    "id" BIGSERIAL NOT NULL,
    "payment_id" VARCHAR(100),
    "webhook_data" JSONB NOT NULL,
    "error_message" TEXT NOT NULL,
    "error_stack" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 5,
    "last_retry_at" TIMESTAMP(6),
    "next_retry_at" TIMESTAMP(6),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_logs" (
    "id" BIGSERIAL NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "handlers_executed" INTEGER NOT NULL DEFAULT 0,
    "handlers_succeeded" INTEGER NOT NULL DEFAULT 0,
    "handlers_failed" INTEGER NOT NULL DEFAULT 0,
    "total_duration_ms" INTEGER,
    "handler_results" JSONB,
    "source" VARCHAR(100),
    "triggered_by" VARCHAR(150),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_direcciones_usuario" ON "direcciones"("id_usuario");

-- CreateIndex
CREATE INDEX "idx_direcciones_venta" ON "direcciones"("id_venta");

-- CreateIndex
CREATE INDEX "idx_direcciones_principal" ON "direcciones"("es_principal");

-- CreateIndex
CREATE UNIQUE INDEX "lista_precio_codi_lista_key" ON "lista_precio"("codi_lista");

-- CreateIndex
CREATE INDEX "idx_lista_precio_codigo" ON "lista_precio"("codi_lista");

-- CreateIndex
CREATE UNIQUE INDEX "situacion_fiscal_codi_sifi_key" ON "situacion_fiscal"("codi_sifi");

-- CreateIndex
CREATE INDEX "idx_situacion_fiscal_codigo" ON "situacion_fiscal"("codi_sifi");

-- CreateIndex
CREATE UNIQUE INDEX "provincia_codi_provincia_key" ON "provincia"("codi_provincia");

-- CreateIndex
CREATE INDEX "idx_provincia_codigo" ON "provincia"("codi_provincia");

-- CreateIndex
CREATE UNIQUE INDEX "plataforma_pago_codi_plataforma_key" ON "plataforma_pago"("codi_plataforma");

-- CreateIndex
CREATE INDEX "idx_plataforma_pago_codigo" ON "plataforma_pago"("codi_plataforma");

-- CreateIndex
CREATE UNIQUE INDEX "forma_pago_codi_forma_pago_key" ON "forma_pago"("codi_forma_pago");

-- CreateIndex
CREATE INDEX "idx_forma_pago_codigo" ON "forma_pago"("codi_forma_pago");

-- CreateIndex
CREATE UNIQUE INDEX "mercado_pago_payments_payment_id_key" ON "mercado_pago_payments"("payment_id");

-- CreateIndex
CREATE INDEX "idx_mp_payments_venta" ON "mercado_pago_payments"("venta_id");

-- CreateIndex
CREATE INDEX "idx_mp_payments_status" ON "mercado_pago_payments"("status_mp");

-- CreateIndex
CREATE INDEX "idx_mp_payments_date" ON "mercado_pago_payments"("date_created");

-- CreateIndex
CREATE INDEX "idx_failed_webhooks_status" ON "failed_webhooks"("status");

-- CreateIndex
CREATE INDEX "idx_failed_webhooks_next_retry" ON "failed_webhooks"("next_retry_at");

-- CreateIndex
CREATE INDEX "idx_event_logs_type" ON "event_logs"("event_type");

-- CreateIndex
CREATE INDEX "idx_event_logs_date" ON "event_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_venta_estado_pago" ON "venta"("estado_pago");

-- AddForeignKey
ALTER TABLE "direcciones" ADD CONSTRAINT "direcciones_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "direcciones" ADD CONSTRAINT "direcciones_id_venta_fkey" FOREIGN KEY ("id_venta") REFERENCES "venta"("id_venta") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "roles"("id_rol") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mercado_pago_payments" ADD CONSTRAINT "mercado_pago_payments_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id_venta") ON DELETE CASCADE ON UPDATE NO ACTION;
