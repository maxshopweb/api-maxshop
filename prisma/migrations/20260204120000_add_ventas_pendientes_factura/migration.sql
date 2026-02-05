-- CreateTable
CREATE TABLE "ventas_pendientes_factura" (
    "id" BIGSERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "fecha_creacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_ultimo_intento" TIMESTAMP(6),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "estado" VARCHAR(50) NOT NULL DEFAULT 'pendiente',
    "error_mensaje" TEXT,
    "factura_encontrada" BOOLEAN NOT NULL DEFAULT false,
    "factura_nombre_archivo" VARCHAR(255),
    "procesado_en" TIMESTAMP(6),

    CONSTRAINT "ventas_pendientes_factura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ventas_pendientes_factura_venta_id_key" ON "ventas_pendientes_factura"("venta_id");

-- CreateIndex
CREATE INDEX "idx_pendientes_factura_estado" ON "ventas_pendientes_factura"("estado");

-- CreateIndex
CREATE INDEX "idx_pendientes_factura_fecha" ON "ventas_pendientes_factura"("fecha_creacion");

-- CreateIndex
CREATE INDEX "idx_pendientes_factura_venta" ON "ventas_pendientes_factura"("venta_id");

-- AddForeignKey
ALTER TABLE "ventas_pendientes_factura" ADD CONSTRAINT "ventas_pendientes_factura_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id_venta") ON DELETE CASCADE ON UPDATE CASCADE;
